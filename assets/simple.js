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

  /* Icônes Material Symbols (Outlined, 400, grade 0, grille 24) recopiées
   * depuis assets/icons/material/ — le nom du fichier est en commentaire.
   * Format natif : viewBox 0 -960 960 960, forme pleine. La CSS pilote
   * `color`, comme pour les tracés qu'elles remplacent.
   * L'argent se disait ici avec un « $ » — dans un produit facturé en dirhams. */
  const mi = (d, px) =>
    `<svg width="${px}" height="${px}" viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true"><path d="${d}"/></svg>`;
  /* payments.svg */
  const MI_PAYMENTS = 'M560-440q-50 0-85-35t-35-85q0-50 35-85t85-35q50 0 85 35t35 85q0 50-35 85t-85 35ZM280-320q-33 0-56.5-23.5T200-400v-320q0-33 23.5-56.5T280-800h560q33 0 56.5 23.5T920-720v320q0 33-23.5 56.5T840-320H280Zm80-80h400q0-33 23.5-56.5T840-480v-160q-33 0-56.5-23.5T760-720H360q0 33-23.5 56.5T280-640v160q33 0 56.5 23.5T360-400Zm440 240H120q-33 0-56.5-23.5T40-240v-440h80v440h680v80ZM280-400v-320 320Z';
  /* account_balance_wallet.svg */
  const MI_WALLET = 'M200-200v-560 560Zm0 80q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h560q33 0 56.5 23.5T840-760v100h-80v-100H200v560h560v-100h80v100q0 33-23.5 56.5T760-120H200Zm320-160q-33 0-56.5-23.5T440-360v-240q0-33 23.5-56.5T520-680h280q33 0 56.5 23.5T880-600v240q0 33-23.5 56.5T800-280H520Zm280-80v-240H520v240h280Zm-117.5-77.5Q700-455 700-480t-17.5-42.5Q665-540 640-540t-42.5 17.5Q580-505 580-480t17.5 42.5Q615-420 640-420t42.5-17.5Z';
  /* today.svg */
  const MI_TODAY = 'M289-329q-29-29-29-71t29-71q29-29 71-29t71 29q29 29 29 71t-29 71q-29 29-71 29t-71-29ZM200-80q-33 0-56.5-23.5T120-160v-560q0-33 23.5-56.5T200-800h40v-80h80v80h320v-80h80v80h40q33 0 56.5 23.5T840-720v560q0 33-23.5 56.5T760-80H200Zm0-80h560v-400H200v400Zm0-480h560v-80H200v80Zm0 0v-80 80Z';
  /* help.svg */
  const MI_HELP = 'M513.5-254.5Q528-269 528-290t-14.5-35.5Q499-340 478-340t-35.5 14.5Q428-311 428-290t14.5 35.5Q457-240 478-240t35.5-14.5ZM442-394h74q0-33 7.5-52t42.5-52q26-26 41-49.5t15-56.5q0-56-41-86t-97-30q-57 0-92.5 30T342-618l66 26q5-18 22.5-39t53.5-21q32 0 48 17.5t16 38.5q0 20-12 37.5T506-526q-44 39-54 59t-10 73Zm38 314q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm0-80q134 0 227-93t93-227q0-134-93-227t-227-93q-134 0-227 93t-93 227q0 134 93 227t227 93Zm0-320Z';

  /* A real session is the hosted app or any signed-in merchant (window.KiwiMe).
     In a real session we never surface the demo cast (Rachid · Café Atlas ·
     Mehdi Alami), the demo revenue, or the demo Kiwi-account balance. */
  const pairedVenue = () => {
    try {
      const P = window.KiwiCaissePairing;
      const pv = P?.pairedVenue?.();
      if (P?.isPaired?.() && pv?.merchant) return pv;
    } catch (_) {}
    try {
      if (localStorage.getItem('kiwiPaired') !== '1') return null;
      const pv = JSON.parse(localStorage.getItem('kiwiPairedVenue') || 'null');
      return pv?.merchant ? pv : null;
    } catch (_) { return null; }
  };
  const isReal = () => !!(window.KiwiEnv?.isReal?.() || window.KiwiMe || window.KiwiVenue?.isCustom?.() || pairedVenue());
  const hasOwnVenue = (venue) => {
    try { return !!window.KiwiVenue?.isCustom?.(venue); } catch (_) { return false; }
  };
  const ownTotals = (venue, range) => {
    /* A built-in id during the identity/pairing gap still points at the demo
       tenant. Reading it would be worse than displaying zero. */
    if (!isReal() || !hasOwnVenue(venue) || !window.KiwiSales?.totals) return null;
    let bounds = null;
    try { bounds = window.KiwiDateRange?.bounds?.(range); } catch (_) {}
    try { return window.KiwiSales.totals(venue, bounds?.[0], bounds?.[1]) || null; } catch (_) { return null; }
  };
  const ownSales = (venue, range) => {
    if (!isReal() || !hasOwnVenue(venue) || !window.KiwiSales?.list) return [];
    let bounds = [-Infinity, Infinity];
    try { bounds = window.KiwiDateRange?.bounds?.(range) || bounds; } catch (_) {}
    try {
      return (window.KiwiSales.list(venue) || [])
        .filter((s) => (+s?.ts || 0) >= bounds[0] && (+s?.ts || 0) < bounds[1])
        .sort((a, b) => (+a.ts || 0) - (+b.ts || 0));
    } catch (_) { return []; }
  };
  const meAvatar = () => {
    const nm = ((window.KiwiMe || {}).name || '').trim();
    if (nm) return ((nm.split(/\s+/)[0] || '')[0] + ((nm.split(/\s+/)[1] || '')[0] || '')).toUpperCase();
    return isReal() ? '·' : 'RB';
  };

  /* ═══ LYOUM (Today) ═══ */
  SIMPLE_PAGES.lyoum = () => {
    /* Real session → never surface the demo identity ("Rachid" / "Café Atlas"),
       the demo revenue (24 380 · 182) or the demo payout (Bank of Africa ••3291).
       Figures come from the merchant's own sales when we have them, else zero.
       Local demo (no real session) keeps the full pitch screen. */
    const me = window.KiwiMe || {};
    const real = isReal();
    const nm = (me.name || '').trim();
    const first = nm ? nm.split(/\s+/)[0] : (real ? '' : 'Rachid');
    const av = nm ? ((nm.split(/\s+/)[0] || '')[0] + ((nm.split(/\s+/)[1] || '')[0] || '')).toUpperCase() : (real ? '·' : 'RB');
    const pv = pairedVenue();
    const venueShop = window.KiwiVenue?.isCustom?.()
      ? ((window.KiwiVenue.getCurrentVenueData?.() || {}).fullDisplay || '') : '';
    const shop = me.business || venueShop || (pv && pv.name) || (real ? 'Votre établissement' : 'Café Atlas · Maarif');
    const vid = window.KiwiVenue && window.KiwiVenue.getVenue && window.KiwiVenue.getVenue();
    const tot = ownTotals(vid, 'aujourdhui');
    const recent = real ? ownSales(vid, 'aujourdhui').slice(-5).reverse() : [];
    const heroAmt = real ? Number(tot && tot.revenue || 0).toLocaleString('fr-FR').replace(/[  ]/g, ' ') : '24 380';
    const heroCount = real ? Number(tot && tot.count || 0) : 182;
    const payoutMeta = real ? 'Aucune source de règlement disponible' : '23 091 MAD sur Bank of Africa •• 3291';
    const payoutWhen = real ? '—' : 'Demain matin, 9h';
    return `
    <div class="simple-screen">
      <div class="simple-top">
        <div class="merchant">
          <div class="av">${av}</div>
          <div>
            <div class="n">Salam ${first}</div>
            <div class="shop">${shop}</div>
          </div>
        </div>
        <button class="icon-btn-s" data-simple-tab="3awn" aria-label="Aide">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><circle cx="12" cy="12" r="10"/><path d="M9 9a3 3 0 016 0c0 2-3 2-3 4M12 17h.01"/></svg>
        </button>
      </div>

      <div class="lyoum-hero">
        <div class="eyebrow">AUJOURD'HUI</div>
        <div class="amount">${heroAmt}<span class="unit">MAD</span></div>
        <div class="count">${heroCount} paiements</div>
      </div>

      <div class="lyoum-payout">
        <div class="icn">
          ${mi(MI_PAYMENTS, 22)}
        </div>
        <div class="body">
          <div class="label">Ton argent arrive</div>
          <div class="when">${payoutWhen}</div>
          <div class="meta">${payoutMeta}</div>
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
        ${real ? (recent.length ? recent.map((s) => {
          const method = ({ cash: 'Espèces', card: 'Carte', tap: 'Kiwi Tap', qr: 'QR', wallet: 'Kiwi Wallet', link: 'Lien de paiement' })[String(s.method || '')] || 'Paiement';
          const when = new Date(+s.ts || 0).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
          const amount = Math.max(0, +s.amount || 0).toLocaleString('fr-FR', { maximumFractionDigits: 2 });
          return `<div class="simple-tx">
            <div class="av">P</div>
            <div class="body"><div class="name">Paiement</div><div class="meta">${method} · ${when}</div></div>
            <div class="amt">+${amount} MAD</div>
          </div>`;
        }).join('') : `<div class="simple-tx-empty" style="color:var(--n-500); font-size:13.5px; padding:14px 4px;">Aucun paiement pour le moment.</div>`) : [
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
  };

  /* ═══ FLOUSI (My money) ═══ */
  SIMPLE_PAGES.flousi = () => {
    /* Real session → never surface the demo week (24 380…), the demo Kiwi-account
       balance (47 281,90) or the demo "RB" avatar. Both the weekly total and its
       day rows come from the merchant's own KiwiSales feed. */
    const real = isReal();
    const av = meAvatar();
    const vid = window.KiwiVenue && window.KiwiVenue.getVenue && window.KiwiVenue.getVenue();
    const tot = ownTotals(vid, 'septJours');
    const realSales = real ? ownSales(vid, 'septJours') : [];
    const days = real ? Array.from({ length: 7 }, (_, offset) => {
      const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - offset);
      const next = new Date(d); next.setDate(next.getDate() + 1);
      const amount = realSales.reduce((sum, s) => {
        const ts = +s.ts || 0;
        return sum + (ts >= d.getTime() && ts < next.getTime() ? Math.max(0, +s.amount || 0) : 0);
      }, 0);
      return {
        date: offset === 0 ? "Aujourd'hui" : offset === 1 ? 'Hier' : d.toLocaleDateString('fr-FR', { weekday: 'long' }),
        sub: d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }),
        amt: amount.toLocaleString('fr-FR', { maximumFractionDigits: 2 }),
        pending: offset === 0,
      };
    }) : [
      { date: "Aujourd'hui", sub: 'Vendredi 24 avril', amt: '24 380', pending: true },
      { date: 'Hier', sub: 'Jeudi 23 avril', amt: '19 824' },
      { date: 'Mercredi', sub: '22 avril', amt: '17 290' },
      { date: 'Mardi', sub: '21 avril', amt: '21 688' },
      { date: 'Lundi', sub: '20 avril', amt: '18 415' },
      { date: 'Dimanche', sub: '19 avril', amt: '24 102' },
      { date: 'Samedi', sub: '18 avril', amt: '22 850' },
    ];
    const total = real ? Number(tot && tot.revenue || 0) : days.reduce((s, d) => s + parseInt(d.amt.replace(/\s/g, ''), 10), 0);
    return `
      <div class="simple-screen">
        <div class="simple-top">
          <div class="merchant">
            <div class="av">${av}</div>
            <div>
              <div class="n">Mon argent</div>
              <div class="shop">7 derniers jours</div>
            </div>
          </div>
        </div>

        <div class="lyoum-hero">
          <div class="eyebrow">TOTAL CETTE SEMAINE</div>
          <div class="amount" style="font-size: 60px;">${total.toLocaleString('fr-FR').replace(/[  ]/g,' ')}<span class="unit">MAD</span></div>
          ${real ? '' : '<div class="count">+18 % vs semaine dernière</div>'}
        </div>

        <div class="compte-simple">
          <div class="compte-label">Solde de mon compte Kiwi</div>
          <div class="compte-amt">${real ? '—' : '47 281,90'} <span>MAD</span></div>
          <div class="compte-actions">
            <button class="chip-btn" data-simple-action="compte">Voir détails</button>
            <button class="chip-btn" data-simple-action="transfer">Virer</button>
          </div>
        </div>

        <div class="simple-section">
          <div class="h">Jour par jour</div>
          ${real && !realSales.length ? `<div class="simple-tx-empty" style="color:var(--n-500); font-size:13.5px; padding:14px 4px;">Pas encore d'historique. Tes ventes s'afficheront ici jour par jour.</div>` : `<div class="flousi-week">
            ${days.map(d => `
              <div class="flousi-day">
                <div class="date">${d.date}<span class="sub">${d.sub}${d.pending ? ' · en cours' : ' · reçu'}</span></div>
                <div class="amt">${d.amt} MAD</div>
              </div>
            `).join('')}
          </div>`}
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
          <div class="av">${meAvatar()}</div>
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
          ${mi(MI_TODAY, 26)}
          <span class="label">Aujourd'hui</span>
        </button>
        <button class="simple-tab ${currentTab === 'flousi' ? 'active' : ''}" data-simple-tab="flousi">
          ${mi(MI_WALLET, 26)}
          <span class="label">Mon argent</span>
        </button>
        <button class="simple-tab ${currentTab === '3awn' ? 'active' : ''}" data-simple-tab="3awn">
          ${mi(MI_HELP, 26)}
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
      toast(isReal() ? 'Rapport envoyé à ton comptable' : 'Rapport envoyé à Mehdi Alami', { type: 'success', desc: 'PDF signé · totaux de la semaine.' });
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
        <p style="margin-top: 16px; font-size: 16px; color: var(--n-700); line-height: 1.55;">${isReal() ? 'Un tour rapide de Kiwi : encaisser un paiement, envoyer un lien, suivre ton argent, le tout en une main.' : 'Rachid, 58 ans, tient Café Atlas depuis 22 ans. Il montre comment Kiwi lui fait gagner 30 minutes par jour.'}</p>`,
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
