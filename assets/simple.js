/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · Simple Mode runtime (v4 · adult-simple)
 *
 * Calibrated for a 50-year-old café owner who runs a business, uses WhatsApp
 * daily, reads French fluently. Not a child. Simple ≠ reductive.
 *
 * Rule: show anything they'd actually USE. Hide anything that needs jargon to
 * explain (Murabaha, interchange, CNP, T+1, KYC, PCI).
 * ─────────────────────────────────────────────────────────────────────────── */
(() => {
  'use strict';

  const SIMPLE_PAGES = {};
  let currentTab = 'lyoum';
  const SUPPORT_WA = '212522123456';

  /* ═══ LYOUM (Today) ═══ */
  SIMPLE_PAGES.lyoum = () => `
    <div class="simple-screen">
      <div class="simple-top">
        <div class="merchant">
          <div class="av">RB</div>
          <div>
            <div class="n">Salam Rachid</div>
            <div class="shop">Café Atlas · Maarif</div>
          </div>
        </div>
        <button class="icon-btn-s" data-simple-tab="3awn" aria-label="Aide">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><circle cx="12" cy="12" r="10"/><path d="M9 9a3 3 0 016 0c0 2-3 2-3 4M12 17h.01"/></svg>
        </button>
      </div>

      <div class="lyoum-hero">
        <div class="eyebrow">AUJOURD'HUI</div>
        <div class="amount">24 380<span class="unit">MAD</span></div>
        <div class="count">182 paiements · 14:38</div>
      </div>

      <div class="lyoum-payout">
        <div class="icn">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>
        </div>
        <div class="body">
          <div class="label">Ton argent arrive</div>
          <div class="when">Demain matin, 9h</div>
          <div class="meta">23 091 MAD sur BMCE •• 3291</div>
        </div>
      </div>

      <button class="simple-btn atlas" data-simple-action="new-sale">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M12 5v14M5 12h14"/></svg>
        Encaisser un paiement
      </button>

      <div class="mini-tiles">
        <button class="mini-tile" data-simple-action="payment-link">
          <div class="mini-ic">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 14a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71M14 10a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
          </div>
          <div class="mini-n">Envoyer un lien</div>
        </button>
        <button class="mini-tile" data-simple-action="refund">
          <div class="mini-ic">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 10h10a5 5 0 015 5v2M3 10l4-4M3 10l4 4"/></svg>
          </div>
          <div class="mini-n">Rembourser</div>
        </button>
        <button class="mini-tile" data-simple-action="compte">
          <div class="mini-ic">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 12h4"/></svg>
          </div>
          <div class="mini-n">Ma carte</div>
        </button>
      </div>

      <div class="simple-section">
        <div class="simple-section-head">
          <div class="h">Derniers paiements</div>
          <button class="link-atlas" data-simple-tab="flousi">Tout voir</button>
        </div>
        ${[
          ['Karim B.', 240, 'Visa · il y a 5 min', '+24 pourboire'],
          ['Sara L.', 85.5, 'Mastercard · 22 min', ''],
          ['Youssef A.', 312, 'Visa · 40 min', '+30 pourboire'],
          ['Nawal K.', 62, 'Kiwi Wallet · 1 h', ''],
          ['Mehdi R.', 148, 'Mastercard · 1 h', '+15 pourboire'],
        ].map(([n, a, m, tip]) => `
          <div class="simple-tx">
            <div class="av">${n.split(' ').map(x => x[0]).join('').slice(0,2)}</div>
            <div class="body">
              <div class="name">${n}</div>
              <div class="meta">${m}${tip ? ' · ' + tip : ''}</div>
            </div>
            <div class="amt">+${a.toString().replace('.', ',')} MAD</div>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  /* ═══ FLOUSI (My money) ═══ */
  SIMPLE_PAGES.flousi = () => {
    const days = [
      { date: "Aujourd'hui", sub: 'Vendredi 24 avril', amt: '24 380', pending: true },
      { date: 'Hier', sub: 'Jeudi 23 avril', amt: '19 824' },
      { date: 'Mercredi', sub: '22 avril', amt: '17 290' },
      { date: 'Mardi', sub: '21 avril', amt: '21 688' },
      { date: 'Lundi', sub: '20 avril', amt: '18 415' },
      { date: 'Dimanche', sub: '19 avril', amt: '24 102' },
      { date: 'Samedi', sub: '18 avril', amt: '22 850' },
    ];
    const total = days.reduce((s, d) => s + parseInt(d.amt.replace(/\s/g, ''), 10), 0);
    return `
      <div class="simple-screen">
        <div class="simple-top">
          <div class="merchant">
            <div class="av">RB</div>
            <div>
              <div class="n">Mon argent</div>
              <div class="shop">7 derniers jours</div>
            </div>
          </div>
        </div>

        <div class="lyoum-hero">
          <div class="eyebrow">TOTAL CETTE SEMAINE</div>
          <div class="amount" style="font-size: 60px;">${total.toLocaleString('fr-FR').replace(/,/g,' ')}<span class="unit">MAD</span></div>
          <div class="count">+18 % vs semaine dernière</div>
        </div>

        <div class="compte-simple">
          <div class="compte-label">Solde de mon compte Kiwi</div>
          <div class="compte-amt">47 281,90 <span>MAD</span></div>
          <div class="compte-actions">
            <button class="chip-btn" data-simple-action="compte">Voir détails</button>
            <button class="chip-btn" data-simple-action="transfer">Virer</button>
          </div>
        </div>

        <div class="simple-section">
          <div class="h">Jour par jour</div>
          <div class="flousi-week">
            ${days.map(d => `
              <div class="flousi-day">
                <div class="date">${d.date}<span class="sub">${d.sub}${d.pending ? ' · en cours' : ' · reçu'}</span></div>
                <div class="amt">${d.amt} MAD</div>
              </div>
            `).join('')}
          </div>
        </div>

        <button class="simple-btn outline" data-simple-action="share-comptable" style="margin-top: 22px;">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6"/></svg>
          Envoyer le rapport au comptable
        </button>
      </div>
    `;
  };

  /* ═══ 3AWN (Help) ═══ */
  SIMPLE_PAGES['3awn'] = () => `
    <div class="simple-screen">
      <div class="simple-top">
        <div class="merchant">
          <div class="av">RB</div>
          <div>
            <div class="n">Aide</div>
            <div class="shop">On est là pour toi</div>
          </div>
        </div>
      </div>

      <div class="help-hero-xl">
        <div class="help-greet">Comment on peut t'aider ?</div>
        <p>Un conseiller Kiwi répond en moins de 5 minutes. Ou regarde une réponse rapide ci-dessous.</p>
      </div>

      <a href="tel:+${SUPPORT_WA}" class="simple-btn atlas" data-simple-action="call">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.13.96.37 1.9.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z"/></svg>
        Appeler un conseiller Kiwi
      </a>

      <div class="simple-section">
        <div class="h">Questions fréquentes</div>
        ${[
          ["Où est mon argent ?", "Ton argent arrive le lendemain matin sur ton compte. Tu peux aussi le recevoir maintenant pour 1,50 MAD."],
          ["Comment rembourser un client ?", "Dans la liste des derniers paiements, touche le paiement puis \"Rembourser\". Total ou partiel."],
          ["Ma carte n'a pas marché ?", "Vérifie ta connexion 4G/Wi-Fi et la batterie du terminal. Si ça continue, appelle-nous."],
          ["Ajouter un serveur ?", "Touche \"Mode avancé\" en bas, puis \"Équipe\". Chaque serveur a son propre code PIN."],
        ].map(([q, a]) => `
          <details class="faq">
            <summary>${q}</summary>
            <div class="faq-body">${a}</div>
          </details>
        `).join('')}
      </div>

      <button class="simple-btn outline" data-simple-action="video" style="margin-top: 18px;">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M5 3l14 9-14 9V3z"/></svg>
        Vidéo · Kiwi en 90 secondes
      </button>

      <button class="simple-btn ghost" data-simple-action="pro-toggle" style="margin-top: 22px;">
        Passer en mode avancé →
      </button>
    </div>
  `;

  /* ═══ 3-tab bottom nav ═══ */
  function renderTabBar() {
    return `
      <nav class="simple-tabs">
        <button class="simple-tab ${currentTab === 'lyoum' ? 'active' : ''}" data-simple-tab="lyoum">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12l9-9 9 9M5 10v10h14V10"/></svg>
          <span class="label">Aujourd'hui</span>
        </button>
        <button class="simple-tab ${currentTab === 'flousi' ? 'active' : ''}" data-simple-tab="flousi">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>
          <span class="label">Mon argent</span>
        </button>
        <button class="simple-tab ${currentTab === '3awn' ? 'active' : ''}" data-simple-tab="3awn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9 9a3 3 0 016 0c0 2-3 2-3 4M12 17h.01"/></svg>
          <span class="label">Aide</span>
        </button>
      </nav>
    `;
  }

  function renderModeToggle() {
    const mode = getMode();
    document.querySelector('.mode-tg')?.remove();
    const tg = document.createElement('div');
    tg.className = 'mode-tg big';
    tg.innerHTML = `
      <button data-simple-mode="simple" class="${mode === 'simple' ? 'on' : ''}">Simple</button>
      <button data-simple-mode="pro" class="${mode === 'pro' ? 'on' : ''}">Pro</button>
    `;
    document.body.appendChild(tg);
  }

  function renderTab(tab) {
    currentTab = tab;
    let root = document.querySelector('.simple-root');
    if (!root) {
      root = document.createElement('div');
      root.className = 'simple-root';
      document.body.appendChild(root);
    }
    root.innerHTML = SIMPLE_PAGES[tab]();
    document.querySelector('.simple-tabs')?.remove();
    document.body.insertAdjacentHTML('beforeend', renderTabBar());
    window.scrollTo(0, 0);
  }

  function getMode() { return localStorage.getItem('kiwiMode') || 'simple'; }
  function setMode(m) {
    localStorage.setItem('kiwiMode', m);
    document.documentElement.setAttribute('data-mode', m);
    if (m === 'simple') {
      renderTab(currentTab);
    } else {
      document.querySelector('.simple-root')?.remove();
      document.querySelector('.simple-tabs')?.remove();
    }
    renderModeToggle();
  }

  /* ═══ Actions ═══ */
  function onAction(action) {
    if (!window.Kiwi) return;
    const { toast, modal, handlers } = window.Kiwi;

    const routes = {
      'new-sale': 'new-sale',
      'payment-link': 'payment-link',
      'compte': 'kiwi-compte',
    };
    if (routes[action] && handlers[routes[action]]) { handlers[routes[action]](); return; }

    if (action === 'refund') {
      toast('Choisis un paiement à rembourser', { type: 'info', desc: 'Dans la liste des derniers paiements ci-dessous.' });
      return;
    }
    if (action === 'transfer') {
      toast('Virement IBAN', { type: 'info', desc: 'Interface de virement · bientôt disponible.' });
      return;
    }
    if (action === 'share-comptable') {
      toast('Rapport envoyé à Mehdi Alami', { type: 'success', desc: 'PDF signé · totaux de la semaine.' });
      return;
    }
    if (action === 'call') {
      toast('Appel en cours…', { type: 'info', desc: 'Un conseiller va décrocher dans quelques secondes.' });
      return;
    }
    if (action === 'video') {
      modal({
        tag: 'VIDÉO · 90 SECONDES',
        title: 'Kiwi, expliqué simplement',
        width: 560,
        body: `<div style="background: #0A0F0D; border-radius: 14px; aspect-ratio: 16/9; display: flex; align-items: center; justify-content: center; color: var(--mint); position: relative;">
          <svg width="72" height="72" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="11" fill="rgba(125,242,176,0.1)"/><path d="M9 7v10l8-5z"/></svg>
          <div style="position: absolute; bottom: 16px; left: 16px; font-size: 12px; color: #c6ead4; font-family: var(--mono);">1 MIN 32</div>
        </div>
        <p style="margin-top: 16px; font-size: 16px; color: var(--n-700); line-height: 1.55;">Rachid, 58 ans, tient Café Atlas depuis 22 ans. Il montre comment Kiwi lui fait gagner 30 minutes par jour.</p>`,
      });
      return;
    }
    if (action === 'pro-toggle') {
      setMode('pro');
      toast('Mode avancé activé', { type: 'info', desc: 'Tu peux revenir en mode simple à tout moment.' });
      return;
    }
  }

  document.addEventListener('click', (e) => {
    const tabBtn = e.target.closest('[data-simple-tab]');
    if (tabBtn) { e.preventDefault(); renderTab(tabBtn.dataset.simpleTab); return; }
    const modeBtn = e.target.closest('[data-simple-mode]');
    if (modeBtn) { e.preventDefault(); setMode(modeBtn.dataset.simpleMode); return; }
    const actEl = e.target.closest('[data-simple-action]');
    if (actEl) {
      const a = actEl.dataset.simpleAction;
      if (a === 'call' && actEl.tagName === 'A') return;
      e.preventDefault();
      onAction(a);
    }
  });

  function init() {
    // Simple/Pro toggle retired per founder direction (2026-04-25).
    // Pro is the only mode going forward. Force pro and tear down any
    // simple-mode UI that may have been persisted from a prior session.
    document.documentElement.setAttribute('data-mode', 'pro');
    try { localStorage.setItem('kiwiMode', 'pro'); } catch (_) {}
    document.querySelector('.mode-tg')?.remove();
    document.querySelector('.simple-root')?.remove();
    document.querySelector('.simple-tabs')?.remove();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.KiwiSimple = { setMode, getMode, renderTab };
})();
