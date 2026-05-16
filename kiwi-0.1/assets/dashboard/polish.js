/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · polish runtime
 *  - IntersectionObserver scroll reveals
 *  - Number counter animations
 *  - Nav shrink on scroll
 *  - Active section tracking (nav highlight)
 *  - Magnetic buttons (subtle cursor pull)
 *  - Card tilt on mouse move
 *  - Live transaction feed simulation (dashboard)
 *  - Ticking KPI numbers (dashboard)
 * ─────────────────────────────────────────────────────────────────────────── */
(() => {
  'use strict';

  /* ─── 1. Scroll reveals ─── */
  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });

  function markForReveal() {
    // Auto-add .reveal to common containers
    document.querySelectorAll('section > .wrap > *, section > .wrap-sm > *, .sec-head, .feat-row, .products > *, .stats-grid, .price-wrap, .testi, .sec, .rest, .ma-map-wrap, .final .wrap-sm').forEach(el => {
      if (!el.classList.contains('reveal') && !el.classList.contains('reveal-stagger') && !el.closest('.hero')) {
        el.classList.add('reveal');
      }
    });
    document.querySelectorAll('.reveal, .reveal-stagger').forEach(el => io.observe(el));
  }

  /* ─── 2. Count-up numbers ─── */
  function animateCounter(el, target, duration = 1400, suffix = '') {
    const start = performance.now();
    const startVal = 0;
    const ease = t => 1 - Math.pow(1 - t, 3);
    function tick(now) {
      const p = Math.min(1, (now - start) / duration);
      const v = startVal + (target - startVal) * ease(p);
      el.textContent = formatNumber(v, target) + suffix;
      if (p < 1) requestAnimationFrame(tick);
      else el.textContent = formatNumber(target, target) + suffix;
    }
    requestAnimationFrame(tick);
  }
  function formatNumber(v, target) {
    if (target >= 1000) return Math.round(v).toLocaleString('fr-FR').replace(/,/g, ' ');
    if (Number.isInteger(target)) return Math.round(v).toString();
    return v.toFixed(target < 10 ? 2 : 1).replace('.', ',');
  }
  // Trigger counters when their container reveals
  const counterIo = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.querySelectorAll('[data-count]').forEach(c => {
          if (c.dataset.counted) return;
          c.dataset.counted = '1';
          const target = parseFloat(c.dataset.count);
          const suffix = c.dataset.suffix || '';
          animateCounter(c, target, 1400, suffix);
        });
        counterIo.unobserve(e.target);
      }
    });
  }, { threshold: 0.3 });
  function observeCounters() {
    document.querySelectorAll('[data-count]').forEach(c => {
      const container = c.closest('.stat-cell') || c.closest('.ma-map-stats') || c.closest('.hero') || c.parentElement;
      if (container) counterIo.observe(container);
    });
  }

  /* ─── 3. Nav shrink on scroll + active-section tracking ─── */
  const nav = document.querySelector('.nav');
  if (nav) {
    const onScroll = () => {
      if (window.scrollY > 40) nav.classList.add('scrolled');
      else nav.classList.remove('scrolled');
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }
  // Active section highlighting
  const sections = ['#produits', '#tarifs', '#securite'].map(id => ({ id, el: document.querySelector(id) })).filter(x => x.el);
  const navLinks = document.querySelectorAll('.nav-links a');
  const secIo = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        const id = '#' + e.target.id;
        navLinks.forEach(a => a.classList.toggle('active-section', a.getAttribute('href') === id));
      }
    });
  }, { threshold: [0.25, 0.5], rootMargin: '-100px 0px -40% 0px' });
  sections.forEach(s => secIo.observe(s.el));

  /* ─── 4. Magnetic buttons ─── */
  function bindMagnetic() {
    document.querySelectorAll('.btn-lg, .btn-primary.btn-lg, .btn-atlas.btn-lg, .btn-mint.btn-lg').forEach(btn => {
      btn.classList.add('magnetic');
      btn.addEventListener('mousemove', (e) => {
        const r = btn.getBoundingClientRect();
        const x = e.clientX - r.left - r.width / 2;
        const y = e.clientY - r.top - r.height / 2;
        btn.style.setProperty('--mx', x);
        btn.style.setProperty('--my', y);
      });
      btn.addEventListener('mouseleave', () => {
        btn.style.setProperty('--mx', 0);
        btn.style.setProperty('--my', 0);
      });
    });
  }

  /* ─── 5. 3D card tilt (on product tiles / testimonials / rmap-cards) ─── */
  function bindTilt() {
    document.querySelectorAll('.prod, .testi-card, .f-card, .rmap-card, .price-card, .stat-cell, .kpi-c, .kpi-m, .integ-card, .bm-card').forEach(card => {
      card.classList.add('tilt');
      card.addEventListener('mousemove', (e) => {
        const r = card.getBoundingClientRect();
        const rx = ((e.clientY - r.top) / r.height - 0.5) * -4;
        const ry = ((e.clientX - r.left) / r.width - 0.5) * 6;
        card.style.transform = `perspective(1000px) rotateX(${rx}deg) rotateY(${ry}deg) translateZ(2px)`;
      });
      card.addEventListener('mouseleave', () => {
        card.style.transform = '';
      });
    });
  }

  /* ─── 6. Live transaction feed simulation (dashboard) ─── */
  function bindLiveFeed() {
    const feed = document.querySelector('.feed');
    if (!feed) return;
    const pool = [
      { time: '', method: 'visa', mask: '•• 8124', country: 'ma', country_name: 'Carte marocaine · CIH', ctx: 'Hind M. · T5', amt: 128, tip: 12 },
      { time: '', method: 'tap', mask: 'NFC', country: 'ma', country_name: 'Kiwi Tap · contactless', ctx: 'Client #4127 · terrasse', amt: 45, tip: 0 },
      { time: '', method: 'mc', mask: '•• 2039', country: 'es', country_name: 'Carte espagnole · Santander', ctx: 'Marco L. · T2', amt: 210, tip: 20 },
      { time: '', method: 'qr', mask: 'QR', country: 'ma', country_name: 'Kiwi Wallet · régulier', ctx: 'Rachid B. · comptoir', amt: 32, tip: 0 },
      { time: '', method: 'visa', mask: '•• 9102', country: 'fr', country_name: 'Carte française · Société Générale', ctx: 'Julie M. · T1', amt: 185, tip: 18 },
      { time: '', method: 'mc', mask: '•• 6670', country: 'ma', country_name: 'Carte marocaine · BOA', ctx: 'Fadoua K. · T4', amt: 96, tip: 10 },
      { time: '', method: 'tap', mask: 'NFC', country: 'ma', country_name: 'Kiwi Tap · mobile', ctx: 'Client #4128 · terrasse', amt: 68, tip: 6 },
    ];
    const iconMap = { visa: 'ci visa', mc: 'ci mc', tap: 'ci tap', qr: 'ci qr' };
    const flagClass = { ma: 'flag ma', fr: 'flag fr', es: 'flag es', us: 'flag us' };

    function addRow() {
      if (document.hidden) return;
      // Live ticks only on the "today" range — historical ranges are static snapshots.
      const range = window.KiwiDateRange?.getDateRange?.();
      if (range && range !== 'aujourdhui' && range !== 'personnalise') return;
      const item = pool[Math.floor(Math.random() * pool.length)];
      const now = new Date();
      const hh = String(now.getHours()).padStart(2, '0');
      const mm = String(now.getMinutes()).padStart(2, '0');
      const ss = String(now.getSeconds()).padStart(2, '0');
      const row = document.createElement('div');
      row.className = 'feed-row live-new';
      row.innerHTML = `
        <div class="t">${hh}:${mm}:${ss}</div>
        <div class="method">
          <div class="${iconMap[item.method]}">${item.method === 'tap' ? 'NFC' : item.method === 'qr' ? 'QR' : ''}</div>
          <div class="desc">
            <div class="primary">${item.method === 'tap' ? 'Kiwi Tap' : item.method === 'qr' ? 'Kiwi Wallet QR' : (item.method === 'visa' ? 'Visa ' : 'Mastercard ') + item.mask}</div>
            <div class="sub"><span class="${flagClass[item.country]}"></span>${item.country_name}</div>
          </div>
        </div>
        <div class="ctx">${item.ctx}</div>
        <div class="amt">${item.amt.toFixed(2).replace('.', ',')}</div>
        <div class="tip">${item.tip > 0 ? '+' + item.tip.toFixed(2).replace('.', ',') : '—'}</div>
        <div class="more"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg></div>
      `;
      feed.insertBefore(row, feed.firstChild);
      // Keep max 6 rows
      while (feed.children.length > 6) feed.removeChild(feed.lastChild);
      // Bump KPI counts
      bumpKpi(item.amt, item.tip);
    }

    // Schedule random additions every 9-16 seconds
    function schedule() {
      const delay = 9000 + Math.random() * 7000;
      setTimeout(() => { addRow(); schedule(); }, delay);
    }
    schedule();
  }

  /* ─── 7. Ticking KPIs · defer to dateRange.js (single source of truth) ─── */
  function bumpKpi(amt, tip) {
    // Route through the date-range module so hero amount, goal bar, and KPIs stay in sync.
    // Falls through silently if the user is on a historical range.
    window.KiwiDateRange?.tickLiveRevenue?.({ amount: amt, tip: tip });
    // Subtle flash on the hero amount as a visual cue
    const heroAmt = document.querySelector('[data-hero-amount]');
    if (heroAmt) {
      heroAmt.classList.add('flash');
      setTimeout(() => heroAmt.classList.remove('flash'), 500);
    }
  }

  /* ─── 8. Current-time live badge updater ─── */
  function bindLiveBadge() {
    const el = document.querySelector('.live-badge');
    if (!el) return;
    function update() {
      const now = new Date();
      const hh = String(now.getHours()).padStart(2, '0');
      const mm = String(now.getMinutes()).padStart(2, '0');
      el.innerHTML = `<span class="dot"></span>LIVE · ${hh}:${mm} GMT+1`;
    }
    setInterval(update, 30000);
    update();
  }

  /* ─── Init ─── */
  function init() {
    markForReveal();
    observeCounters();
    bindMagnetic();
    bindTilt();
    bindLiveFeed();
    bindLiveBadge();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.KiwiPolish = { animateCounter };

})();
