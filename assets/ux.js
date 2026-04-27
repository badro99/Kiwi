/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · UX runtime
 *  - Scroll progress bar
 *  - Hero mouse parallax on dashboard mockup
 *  - Morocco map hover tooltips
 *  - Interactive pricing calculator
 *  - Keyboard shortcuts overlay (press ?)
 *  - Button ripple effect
 *  - Simple Mode live timestamp
 * ─────────────────────────────────────────────────────────────────────────── */
(() => {
  'use strict';

  /* ─── 1. Scroll progress ─── */
  function initScrollProgress() {
    if (document.querySelector('.scroll-progress')) return;
    const bar = document.createElement('div');
    bar.className = 'scroll-progress';
    document.body.appendChild(bar);
    let ticking = false;
    function update() {
      const h = document.documentElement.scrollHeight - window.innerHeight;
      const p = h > 0 ? (window.scrollY / h) * 100 : 0;
      bar.style.width = Math.min(100, Math.max(0, p)) + '%';
      ticking = false;
    }
    window.addEventListener('scroll', () => {
      if (!ticking) { requestAnimationFrame(update); ticking = true; }
    }, { passive: true });
    update();
  }

  /* ─── 2. Hero dashboard-mockup parallax (mouse-follow) ─── */
  function initHeroParallax() {
    const hero = document.querySelector('.hero');
    const dash = hero?.querySelector('.dash');
    if (!hero || !dash) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    // Wrap the dash in a parallax wrapper if not already
    if (!dash.parentElement.classList.contains('dash-wrap')) {
      const wrap = document.createElement('div');
      wrap.className = 'dash-wrap';
      dash.parentElement.insertBefore(wrap, dash);
      wrap.appendChild(dash);
    }
    hero.addEventListener('mousemove', (e) => {
      const r = hero.getBoundingClientRect();
      const x = (e.clientX - r.left - r.width / 2) / r.width;
      const y = (e.clientY - r.top - r.height / 2) / r.height;
      dash.style.transform = `rotateY(${x * 4}deg) rotateX(${-y * 3}deg) translateZ(0)`;
    });
    hero.addEventListener('mouseleave', () => {
      dash.style.transform = '';
    });
  }

  /* ─── 3. Morocco map tooltips ─── */
  function initMapTooltips() {
    const svg = document.querySelector('.ma-map svg');
    if (!svg) return;
    // City metadata keyed by approximate coords
    const cities = {
      '140,68': { name: 'Tanger', count: 148, recent: 'Lina B. · 92 MAD' },
      '158,118': { name: 'Rabat', count: 412, recent: 'Café Hassan · 240 MAD' },
      '168,152': { name: 'Casablanca', count: 1124, recent: 'Café Atlas · 240 MAD' },
      '180,228': { name: 'Marrakech', count: 286, recent: 'Dar Moha · 468 MAD' },
      '220,118': { name: 'Fès', count: 72, recent: 'Riad Nejjarine · 180 MAD' },
      '130,274': { name: 'Agadir', count: 58, recent: 'Surf Club · 95 MAD' },
      '302,112': { name: 'Oujda', count: 34, recent: 'Café Zaidi · 55 MAD' },
      '72,360': { name: 'Laâyoune', count: 22, recent: 'Poste restante · 32 MAD' },
    };
    let tip = null;
    function showTip(el, data) {
      if (!tip) {
        tip = document.createElement('div');
        tip.className = 'ma-tip';
        document.body.appendChild(tip);
      }
      tip.innerHTML = `
        <div class="ma-tip-n">${data.name}</div>
        <div class="ma-tip-c">${data.count.toLocaleString('fr-FR')} commerçants actifs</div>
        <div class="ma-tip-m">Dernière transaction · <b>${data.recent}</b></div>
      `;
      const r = el.getBoundingClientRect();
      tip.style.left = (r.left + r.width / 2) + 'px';
      tip.style.top = r.top + 'px';
      requestAnimationFrame(() => tip.classList.add('in'));
    }
    function hideTip() { tip?.classList.remove('in'); }
    // Find all dots with a matching key
    svg.querySelectorAll('circle').forEach(c => {
      const key = `${c.getAttribute('cx')},${c.getAttribute('cy')}`;
      if (cities[key] && c.classList.contains('ma-dot')) {
        c.style.cursor = 'pointer';
        c.addEventListener('mouseenter', () => showTip(c, cities[key]));
        c.addEventListener('mouseleave', hideTip);
      }
    });
  }

  /* ─── 4. Interactive pricing calculator ─── */
  let calcState = { volume: 200000, tier: 'base' };
  function initCalculator() {
    const root = document.querySelector('.calc');
    if (!root) return;
    const slider = root.querySelector('.calc-slider');
    const amt = root.querySelector('.calc-input-amount');
    const sub = root.querySelector('.calc-input-sub');
    const out = root.querySelector('.calc-output');
    const tierBtns = root.querySelectorAll('[data-tier]');
    function update() {
      const v = calcState.volume;
      const tier = calcState.tier;
      // Persona matching
      let persona = "Petit café de quartier";
      if (v > 80_000) persona = "Café actif en ville";
      if (v > 180_000) persona = "Restaurant moyen avec terrasse";
      if (v > 320_000) persona = "Restaurant ou hôtel bien rempli";
      if (v > 450_000) persona = "Chaîne multi-boutiques";

      // Avg ticket ≈ 130 MAD, so tx count ≈ v/130
      const txCount = Math.round(v / 130);
      // CMI: 2.0% MDR + ~300 MAD rental (blended realistic)
      const cmiMDR = v * 0.02;
      const cmiRental = 300;
      const cmiTotal = cmiMDR + cmiRental;
      // Kiwi Basic: 399 MAD/mois flat, hardware included, no commission layer
      const baseSaaS = 399;
      const baseTotal = baseSaaS;
      // Kiwi Pro: 699 MAD/mois flat, multi-terminal, hardware included
      const proSaaS = 699;
      const proTotal = proSaaS;

      const chosenTotal = tier === 'base' ? baseTotal : proTotal;
      const savingsMonth = Math.max(0, cmiTotal - chosenTotal);
      const savingsYear = savingsMonth * 12;

      amt.innerHTML = `${v.toLocaleString('fr-FR').replace(/,/g,' ')}<span class="u">MAD / mois</span>`;
      sub.textContent = persona + ` · ~${txCount.toLocaleString('fr-FR')} transactions`;

      out.innerHTML = `
        <div class="calc-tier-toggle" style="margin-bottom: 20px;">
          <button data-tier="base" class="${tier === 'base' ? 'on' : ''}">Kiwi Basic</button>
          <button data-tier="pro" class="${tier === 'pro' ? 'on' : ''}">Kiwi Pro</button>
        </div>
        <div class="calc-row">
          <div class="rk"><b>Avec CMI (aujourd'hui)</b>2 % MDR + 300 MAD location terminal</div>
          <div class="rv">${Math.round(cmiTotal).toLocaleString('fr-FR').replace(/,/g,' ')} MAD</div>
        </div>
        <div class="calc-row">
          <div class="rk"><b>Avec Kiwi ${tier === 'base' ? 'Basic' : 'Pro'}</b>${tier === 'base' ? '399' : '699'} MAD/mois · matériel offert · tout inclus</div>
          <div class="rv">${Math.round(chosenTotal).toLocaleString('fr-FR').replace(/,/g,' ')} MAD</div>
        </div>
        <div class="calc-row total ${savingsMonth > 0 ? 'savings-burst' : ''}">
          <div class="rk"><b>Économie annuelle</b>avec Kiwi ${tier === 'base' ? 'Basic' : 'Pro'}</div>
          <div class="rv">${Math.round(savingsYear).toLocaleString('fr-FR').replace(/,/g,' ')} MAD</div>
        </div>
        <div class="calc-footnote">Base comparaison : 2 % MDR CMI + 300 MAD/mois de loyer terminal. Kiwi Basic 399 MAD/mois et Pro 699 MAD/mois sont des forfaits tout compris (matériel, caisse restaurant, règlement T+1, support WhatsApp). Aucun engagement.</div>
      `;
      // Update persona card
      root.querySelector('.calc-persona').innerHTML = `<b>${persona}.</b> Faites glisser le curseur pour voir l'économie selon votre volume réel.`;

      // Re-wire tier toggle
      root.querySelectorAll('[data-tier]').forEach(btn => {
        btn.onclick = () => { calcState.tier = btn.dataset.tier; update(); };
      });
    }
    slider.addEventListener('input', (e) => {
      calcState.volume = Number(e.target.value);
      update();
    });
    update();
  }

  /* ─── 5. Keyboard shortcuts overlay ─── */
  function initShortcutsOverlay() {
    function open() {
      if (document.querySelector('.kb-overlay-backdrop')) return;
      const isDash = /dashboard\.html/.test(location.pathname);
      const back = document.createElement('div');
      back.className = 'kb-overlay-backdrop';
      back.innerHTML = `
        <div class="kb-overlay">
          <div class="kb-head">
            <h3>Raccourcis clavier</h3>
            <div class="hint">Appuyez sur <kbd>?</kbd> pour ouvrir</div>
          </div>
          <div class="kb-list">
            ${isDash ? `
              <div class="kb-section-head">Navigation</div>
              <div class="kb-row"><div class="kb-label">Ouvrir la recherche</div><div class="kb-keys"><kbd>⌘</kbd><kbd>K</kbd></div></div>
              <div class="kb-row"><div class="kb-label">Kiwi AI Agent</div><div class="kb-keys"><kbd>⌘</kbd><kbd>J</kbd></div></div>
              <div class="kb-row"><div class="kb-label">Nouvelle vente</div><div class="kb-keys"><kbd>N</kbd></div></div>
              <div class="kb-row"><div class="kb-label">Exporter</div><div class="kb-keys"><kbd>E</kbd></div></div>
              <div class="kb-section-head">Basculer</div>
              <div class="kb-row"><div class="kb-label">Mode Simple / Pro</div><div class="kb-keys"><kbd>⌘</kbd><kbd>⇧</kbd><kbd>M</kbd></div></div>
            ` : `
              <div class="kb-section-head">Navigation</div>
              <div class="kb-row"><div class="kb-label">Commencer l'inscription</div><div class="kb-keys"><kbd>⌘</kbd><kbd>K</kbd></div></div>
              <div class="kb-row"><div class="kb-label">Voir la démo</div><div class="kb-keys"><kbd>D</kbd></div></div>
            `}
            <div class="kb-section-head">Général</div>
            <div class="kb-row"><div class="kb-label">Fermer</div><div class="kb-keys"><kbd>Esc</kbd></div></div>
            <div class="kb-row"><div class="kb-label">Afficher cette aide</div><div class="kb-keys"><kbd>?</kbd></div></div>
          </div>
        </div>
      `;
      document.body.appendChild(back);
      requestAnimationFrame(() => back.classList.add('in'));
      const close = () => {
        back.classList.remove('in');
        setTimeout(() => back.remove(), 280);
        document.removeEventListener('keydown', esc);
      };
      const esc = (e) => { if (e.key === 'Escape') close(); };
      document.addEventListener('keydown', esc);
      back.addEventListener('click', (e) => { if (e.target === back) close(); });
    }
    document.addEventListener('keydown', (e) => {
      if (e.key === '?' && !e.target.matches('input, textarea, [contenteditable]')) {
        e.preventDefault();
        open();
      }
      // Mode toggle shortcut
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'm' && window.KiwiSimple) {
        e.preventDefault();
        const cur = window.KiwiSimple.getMode();
        window.KiwiSimple.setMode(cur === 'simple' ? 'pro' : 'simple');
      }
      // Single key shortcuts on dashboard
      if (!e.target.matches('input, textarea, [contenteditable]') && /dashboard\.html/.test(location.pathname)) {
        if (e.key === 'n' && !e.metaKey && !e.ctrlKey) {
          e.preventDefault();
          window.Kiwi?.handlers?.['new-sale']?.();
        }
        if (e.key === 'e' && !e.metaKey && !e.ctrlKey) {
          e.preventDefault();
          window.Kiwi?.handlers?.export?.();
        }
      }
    });
    // Topbar shortcuts hint button removed per founder direction (2026-04-25).
    // The `?` keyboard shortcut still opens the overlay; only the visible button is gone.
  }

  /* ─── 6. Button ripple ─── */
  function initRipple() {
    document.addEventListener('pointerdown', (e) => {
      const el = e.target.closest('.btn, .kb, .simple-btn, .mini-tile, .simple-btn-sm');
      if (!el || el.disabled) return;
      if (el.classList.contains('ghost')) return;
      const r = el.getBoundingClientRect();
      const ink = document.createElement('span');
      ink.className = 'ripple';
      ink.style.left = (e.clientX - r.left) + 'px';
      ink.style.top = (e.clientY - r.top) + 'px';
      el.appendChild(ink);
      setTimeout(() => ink.remove(), 560);
    });
  }

  /* ─── 7. Simple mode live "updated X sec ago" ─── */
  function initSimpleUpdatedLive() {
    if (document.documentElement.dataset.mode !== 'simple') return;
    let lastRendered = Date.now();
    function tick() {
      if (document.documentElement.dataset.mode !== 'simple') return;
      const count = document.querySelector('.lyoum-hero .count');
      if (!count) return;
      const sec = Math.floor((Date.now() - lastRendered) / 1000);
      const baseText = count.dataset.base || count.textContent;
      if (!count.dataset.base) count.dataset.base = baseText;
      let live = 'il y a quelques secondes';
      if (sec > 10) live = `il y a ${sec} secondes`;
      if (sec > 60) live = `il y a ${Math.floor(sec/60)} min`;
      if (sec > 3600) live = `il y a ${Math.floor(sec/3600)} h`;
      if (!count.querySelector('.updated-live')) {
        const badge = document.createElement('span');
        badge.className = 'updated-live';
        badge.textContent = live;
        count.appendChild(document.createTextNode(' · '));
        count.appendChild(badge);
      } else {
        count.querySelector('.updated-live').textContent = live;
      }
    }
    setInterval(tick, 4000);
    tick();
    // Reset on tab change
    const mo = new MutationObserver(() => { lastRendered = Date.now(); });
    document.body && mo.observe(document.body, { childList: true });
  }

  /* ─── 8. Word-wrap hero headline for stagger animation ─── */
  function wrapHeroWords() {
    const h1 = document.querySelector('.hero .display-1');
    if (!h1 || h1.dataset.wrapped) return;
    h1.dataset.wrapped = '1';
    const walk = (node) => {
      if (node.nodeType === 3) {
        const frag = document.createDocumentFragment();
        const words = node.textContent.split(/(\s+)/);
        words.forEach(w => {
          if (/\S/.test(w)) {
            const span = document.createElement('span');
            span.className = 'word';
            span.textContent = w;
            frag.appendChild(span);
          } else {
            frag.appendChild(document.createTextNode(w));
          }
        });
        node.parentNode.replaceChild(frag, node);
      } else if (node.nodeType === 1 && node.childNodes.length) {
        [...node.childNodes].forEach(walk);
      }
    };
    [...h1.childNodes].forEach(walk);
  }

  /* ─── Init ─── */
  function init() {
    initScrollProgress();
    initHeroParallax();
    initMapTooltips();
    initCalculator();
    initShortcutsOverlay();
    initRipple();
    initSimpleUpdatedLive();
    wrapHeroWords();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.KiwiUX = { initCalculator, initSimpleUpdatedLive };
})();
