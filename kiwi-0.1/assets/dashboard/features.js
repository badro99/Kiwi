/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · feature pack (v2 · post-competitor-audit)
 *
 * Adds handlers for: payment links, Zakat calculator, Sadaqa round-up,
 * Ramadan mode, Kiwi Compte business account, Diaspora FX corridor,
 * Kiwi Capital merchant cash advance, loyalty program, online store,
 * AI Agent Mode.
 *
 * Requires interactive.js (Kiwi.toast, Kiwi.modal, Kiwi.drawer, Kiwi.handlers).
 * ─────────────────────────────────────────────────────────────────────────── */
(() => {
  'use strict';
  if (!window.Kiwi) { console.warn('features.js loaded before interactive.js'); return; }
  const { toast, modal, drawer, handlers, confetti } = window.Kiwi;

  /* ─── Injected styles for feature-specific UI ─── */
  const CSS = `
  /* Payment link */
  .pl-preview { background: var(--paper-soft); border-radius: 14px; padding: 20px; text-align: center; border: 1px solid var(--n-200); }
  .pl-qr { width: 120px; height: 120px; background: var(--ink); padding: 8px; border-radius: 10px; margin: 0 auto; background-image: repeating-linear-gradient(0deg, var(--ink) 0 6px, transparent 6px 12px), repeating-linear-gradient(90deg, var(--ink) 0 6px, transparent 6px 12px); }
  .pl-link { font-family: var(--mono); font-size: 13px; background: #fff; border: 1px solid var(--n-200); border-radius: 10px; padding: 10px 14px; margin-top: 14px; display: flex; align-items: center; gap: 10px; }
  .pl-link .copy { margin-left: auto; color: var(--atlas); font-weight: 500; cursor: pointer; font-size: 12.5px; }
  .pl-share { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-top: 12px; }
  .pl-share button { padding: 12px 10px; background: #fff; border: 1px solid var(--n-200); border-radius: 10px; font-size: 12.5px; display: flex; flex-direction: column; align-items: center; gap: 6px; color: var(--ink); cursor: pointer; transition: border-color 150ms; }
  .pl-share button:hover { border-color: var(--atlas); }
  html[data-theme="dark"] .pl-link, html[data-theme="dark"] .pl-share button { background: var(--paper-soft); border-color: var(--n-200); }

  /* Zakat */
  .zk-hero { background: linear-gradient(135deg, var(--atlas), var(--riad-deep)); color: var(--paper); padding: 22px; border-radius: 14px; margin-bottom: 18px; }
  .zk-hero .big { font-size: 40px; font-weight: 600; letter-spacing: -0.035em; margin-top: 8px; font-feature-settings: "tnum" 1; }
  .zk-hero .sub { color: #c6ead4; font-size: 13px; margin-top: 8px; line-height: 1.45; }
  .zk-field { display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px solid var(--n-200); font-size: 14px; }
  .zk-field .l { color: var(--n-600); }
  .zk-field input { width: 140px; text-align: right; background: transparent; border: 0; outline: 0; font-family: var(--mono); font-size: 14px; color: var(--ink); font-weight: 500; border-bottom: 1px dashed var(--n-300); padding: 4px 6px; }
  .zk-field input:focus { border-bottom-color: var(--atlas); }
  .zk-total { padding: 14px 0 4px; display: flex; justify-content: space-between; font-weight: 600; font-size: 18px; font-feature-settings: "tnum" 1; }
  .zk-recipients { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 14px; }
  .zk-recipient { padding: 14px; border: 1px solid var(--n-200); border-radius: 12px; cursor: pointer; transition: border-color 150ms; }
  .zk-recipient:hover, .zk-recipient.selected { border-color: var(--atlas); background: var(--mint-soft); }
  .zk-recipient .n { font-weight: 500; font-size: 13.5px; }
  .zk-recipient .d { font-size: 12px; color: var(--n-500); margin-top: 3px; line-height: 1.4; }

  /* Kiwi Compte */
  .kc-card { background: linear-gradient(135deg, #053B2C 0%, #0A4A38 45%, #0B6E4F 100%); color: var(--paper); border-radius: 16px; padding: 28px; position: relative; overflow: hidden; aspect-ratio: 1.58; max-width: 380px; }
  .kc-card::before { content: ""; position: absolute; top: -80px; right: -60px; width: 240px; height: 240px; background: radial-gradient(circle, rgba(125,242,176,0.4), transparent 60%); }
  .kc-card .brand { position: relative; font-weight: 700; font-size: 22px; letter-spacing: -0.05em; display: inline-flex; align-items: baseline; gap: 4px; }
  .kc-card .brand i { width: 6px; height: 6px; background: var(--mint); border-radius: 50%; }
  .kc-card .chip-s { position: relative; width: 40px; height: 30px; border-radius: 6px; background: linear-gradient(135deg, #C9C5BC, #8A867E); margin-top: 26px; }
  .kc-card .num { position: relative; font-family: var(--mono); font-size: 18px; letter-spacing: 0.08em; margin-top: 18px; }
  .kc-card .row { position: relative; display: flex; justify-content: space-between; margin-top: 16px; font-size: 11px; }
  .kc-card .row .t { color: #a7d5b9; letter-spacing: 0.05em; text-transform: uppercase; font-weight: 500; }
  .kc-card .row .v { font-family: var(--mono); font-size: 13px; font-weight: 500; margin-top: 3px; }
  .kc-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin: 20px 0; }
  .kc-stat { padding: 14px; background: var(--paper-soft); border: 1px solid var(--n-200); border-radius: 12px; }
  .kc-stat .l { font-size: 10.5px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--n-500); font-family: var(--mono); }
  .kc-stat .v { font-size: 20px; font-weight: 600; letter-spacing: -0.025em; margin-top: 4px; font-feature-settings: "tnum" 1; }

  /* Diaspora */
  .dx-row { display: flex; align-items: center; gap: 14px; padding: 14px 16px; background: var(--paper-soft); border: 1px solid var(--n-200); border-radius: 12px; margin-bottom: 10px; }
  .dx-row .flag { width: 28px; height: 20px; border-radius: 3px; flex-shrink: 0; }
  .dx-row .flag.fr { background: linear-gradient(to right, #002395 33%, #FFF 33% 66%, #ED2939 66%); }
  .dx-row .flag.ma { background: linear-gradient(#C1272D 50%, #006233 50%); }
  .dx-row .info { flex: 1; }
  .dx-row .info .l { font-size: 11px; letter-spacing: 0.1em; color: var(--n-500); text-transform: uppercase; font-family: var(--mono); }
  .dx-row .info .amount { font-size: 26px; font-weight: 600; letter-spacing: -0.025em; margin-top: 2px; font-feature-settings: "tnum" 1; }
  .dx-row .info .amount .u { font-size: 13px; color: var(--n-500); margin-left: 4px; font-weight: 500; }
  .dx-row input { flex: 1; background: transparent; border: 0; outline: 0; font-size: 26px; font-weight: 600; letter-spacing: -0.025em; font-feature-settings: "tnum" 1; color: var(--ink); text-align: right; font-family: var(--sans); max-width: 180px; }
  .dx-cmp { margin: 14px 0; padding: 14px 16px; background: var(--mint-soft); border-radius: 12px; font-size: 13px; display: flex; gap: 10px; align-items: flex-start; color: var(--riad); }
  html[data-theme="dark"] .dx-cmp { background: rgba(125,242,176,0.1); color: var(--mint); }
  .dx-methods { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-top: 14px; }
  .dx-method { padding: 14px 10px; border: 1px solid var(--n-200); border-radius: 12px; text-align: center; cursor: pointer; font-size: 12px; transition: all 150ms; }
  .dx-method:hover, .dx-method.selected { border-color: var(--atlas); background: var(--mint-soft); }
  .dx-method strong { display: block; margin: 6px 0 3px; font-size: 13px; }
  .dx-method .time { color: var(--atlas); font-weight: 500; font-size: 11.5px; }

  /* Ramadan mode banner */
  .ramadan-banner { position: fixed; top: 0; left: 0; right: 0; z-index: 9999; background: linear-gradient(90deg, #7C4A1E, #D99A2B, #7C4A1E); color: #FFF4DD; padding: 10px 24px; display: flex; align-items: center; justify-content: space-between; font-size: 13px; animation: rb-glow 4s ease-in-out infinite; }
  .app .ramadan-banner { top: 37px; left: 260px; }
  @media (max-width: 1100px) { .app .ramadan-banner { left: 0; top: 37px; } }
  .ramadan-banner .left-s { display: flex; align-items: center; gap: 12px; }
  .ramadan-banner .moon { width: 20px; height: 20px; background: #FFF4DD; border-radius: 50%; box-shadow: -6px 0 0 1px rgba(0,0,0,0.3) inset; }
  .ramadan-banner .countdown { font-family: var(--mono); font-weight: 500; background: rgba(0,0,0,0.2); padding: 4px 10px; border-radius: 6px; }
  .ramadan-banner .close { background: none; border: 0; color: #FFF4DD; cursor: pointer; font-size: 14px; opacity: 0.8; }
  @keyframes rb-glow { 0%, 100% { box-shadow: 0 0 20px rgba(217,154,43,0.3) inset; } 50% { box-shadow: 0 0 40px rgba(217,154,43,0.45) inset; } }

  /* Capital */
  .cap-slider { margin: 18px 0; }
  .cap-amount { font-size: 36px; font-weight: 600; letter-spacing: -0.03em; text-align: center; font-feature-settings: "tnum" 1; padding: 10px; }
  .cap-slider input[type=range] { width: 100%; accent-color: var(--atlas); }
  .cap-range { display: flex; justify-content: space-between; font-size: 11.5px; color: var(--n-500); font-family: var(--mono); margin-top: 6px; }
  .cap-metric { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid var(--n-200); font-size: 13.5px; }
  .cap-metric:last-child { border-bottom: 0; }
  .cap-metric .v { font-family: var(--mono); font-weight: 500; }

  /* Loyalty */
  .loy-preview { background: var(--atlas); color: var(--paper); border-radius: 14px; padding: 20px; position: relative; overflow: hidden; }
  .loy-preview::before { content: ""; position: absolute; right: -40px; top: -40px; width: 180px; height: 180px; background: radial-gradient(circle, rgba(125,242,176,0.3), transparent 60%); pointer-events: none; }
  .loy-dots { display: flex; gap: 6px; margin-top: 14px; }
  .loy-dots i { flex: 1; height: 28px; border-radius: 6px; background: rgba(255,255,255,0.15); display: flex; align-items: center; justify-content: center; color: #c6ead4; font-size: 11px; font-weight: 500; }
  .loy-dots i.active { background: var(--mint); color: var(--riad); }
  .loy-dots i.current { background: rgba(125,242,176,0.5); color: var(--paper); border: 2px solid var(--mint); }

  /* Agent mode actions */
  .agent-action { border: 1px solid var(--n-200); border-radius: 12px; padding: 16px; margin-bottom: 10px; display: flex; gap: 12px; align-items: flex-start; background: #fff; }
  html[data-theme="dark"] .agent-action { background: var(--paper-soft); }
  .agent-action .ic { width: 36px; height: 36px; background: var(--mint-soft); color: var(--atlas); border-radius: 10px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .agent-action .b { flex: 1; }
  .agent-action .n { font-weight: 600; font-size: 14px; letter-spacing: -0.01em; }
  .agent-action .d { font-size: 12.5px; color: var(--n-500); margin-top: 3px; line-height: 1.45; }
  .agent-action .t { font-family: var(--mono); font-size: 10.5px; color: var(--atlas); margin-top: 8px; letter-spacing: 0.08em; }
  .agent-action .acts { display: flex; gap: 6px; margin-top: 10px; }
  .agent-action button { font-family: var(--sans); font-size: 12px; font-weight: 500; padding: 6px 12px; border-radius: 8px; cursor: pointer; }
  .agent-action .approve { background: var(--atlas); color: var(--paper); border: 0; }
  .agent-action .dismiss { background: transparent; color: var(--n-500); border: 1px solid var(--n-200); }
  `;
  const st = document.createElement('style');
  st.textContent = CSS;
  document.head.appendChild(st);

  /* ═══════════════════ PAYMENT LINK ═══════════════════ */
  handlers['payment-link'] = () => {
    let step = 'form';
    let data = { amount: '', desc: 'Commande Café Atlas', expiry: '7j', method: 'all' };
    const m = modal({
      tag: 'LIENS DE PAIEMENT',
      title: 'Créer un lien Kiwi',
      desc: 'Pour paiements à distance — WhatsApp, email, SMS. Zéro terminal requis.',
      width: 520,
      body: form()
    });
    function form() {
      return `
        <div class="kf-group">
          <label class="kf-label">Montant (MAD)</label>
          <input class="kf-input" placeholder="Ex. 250,00" data-f="amount" value="${data.amount}" style="font-size:18px; font-family: var(--mono); font-weight:500;" />
          <div class="kf-help">Laissez vide pour permettre au client de choisir.</div>
        </div>
        <div class="kf-group">
          <label class="kf-label">Description</label>
          <input class="kf-input" placeholder="Ce pour quoi le client paie" data-f="desc" value="${data.desc}" />
        </div>
        <div class="kf-row">
          <div class="kf-group">
            <label class="kf-label">Expire dans</label>
            <select class="kf-input" data-f="expiry">
              <option value="24h" ${data.expiry==='24h'?'selected':''}>24 heures</option>
              <option value="7j" ${data.expiry==='7j'?'selected':''}>7 jours</option>
              <option value="30j" ${data.expiry==='30j'?'selected':''}>30 jours</option>
              <option value="none" ${data.expiry==='none'?'selected':''}>Jamais</option>
            </select>
          </div>
          <div class="kf-group">
            <label class="kf-label">Méthodes</label>
            <select class="kf-input" data-f="method">
              <option value="all">Carte + Wallet + QR</option>
              <option value="card">Carte uniquement</option>
              <option value="wallet">Kiwi Wallet uniquement</option>
            </select>
          </div>
        </div>
        <div style="margin-top:6px; padding:12px 14px; background: var(--paper-soft); border-radius: 10px; font-size: 12.5px; color: var(--n-600); display:flex; gap:10px;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--atlas)" stroke-width="2" style="flex-shrink:0;"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
          Payment Links inclus dans l'abonnement Kiwi · règlement T+1 automatique.
        </div>
        <div style="display:flex; justify-content: flex-end; gap: 10px; margin-top: 20px;">
          <button class="kb ghost" data-close>Annuler</button>
          <button class="kb atlas" data-gen>Générer le lien →</button>
        </div>
      `;
    }
    function result() {
      const slug = Math.random().toString(36).slice(2, 9);
      const link = `kiwi.ma/p/${slug}`;
      return `
        <div class="pl-preview">
          <div class="pl-qr"></div>
          <div style="margin-top: 14px; font-size: 13px; color: var(--n-500);">Scannez ou partagez le lien</div>
          <div class="pl-link"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--atlas)" stroke-width="2"><path d="M10 14a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71M14 10a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>${link}<span class="copy" data-copy="${link}">Copier</span></div>
        </div>
        <div style="margin-top: 14px; padding: 14px; background: var(--paper-soft); border-radius: 10px; font-size: 13px;">
          <div style="display:flex; justify-content:space-between; padding: 3px 0;"><span style="color:var(--n-500);">Montant</span><b>${data.amount||'Libre'} ${data.amount?'MAD':''}</b></div>
          <div style="display:flex; justify-content:space-between; padding: 3px 0;"><span style="color:var(--n-500);">Description</span><b>${data.desc}</b></div>
          <div style="display:flex; justify-content:space-between; padding: 3px 0;"><span style="color:var(--n-500);">Expire</span><b>${data.expiry === 'none' ? 'Jamais' : data.expiry === '24h' ? 'Dans 24 heures' : 'Dans '+data.expiry.replace('j',' jours')}</b></div>
        </div>
        <div class="pl-share">
          <button data-share="whatsapp"><svg width="18" height="18" viewBox="0 0 24 24" fill="#25D366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>WhatsApp</button>
          <button data-share="email"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 6l-10 7L2 6"/></svg>Email</button>
          <button data-share="sms"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/></svg>SMS</button>
        </div>
        <div style="margin-top: 16px; display:flex; justify-content: space-between;">
          <button class="kb ghost" data-close>Fermer</button>
          <button class="kb atlas" data-new>Nouveau lien</button>
        </div>
      `;
    }
    m.el.addEventListener('input', (e) => {
      const f = e.target.closest('[data-f]')?.dataset?.f;
      if (f) data[f] = e.target.value;
    });
    m.el.addEventListener('click', (e) => {
      if (e.target.closest('[data-close]')) m.close();
      if (e.target.closest('[data-gen]')) {
        if (!data.desc) { toast('Ajoutez une description', {type: 'warn'}); return; }
        step = 'result';
        m.el.querySelector('.kiwi-modal-body').innerHTML = result();
        confetti();
      }
      if (e.target.closest('[data-new]')) {
        step = 'form';
        m.el.querySelector('.kiwi-modal-body').innerHTML = form();
      }
      const copy = e.target.closest('[data-copy]');
      if (copy) { navigator.clipboard?.writeText('https://' + copy.dataset.copy); toast('Lien copié', {type: 'success', desc: copy.dataset.copy}); }
      const share = e.target.closest('[data-share]');
      if (share) {
        const ch = share.dataset.share;
        toast(ch === 'whatsapp' ? 'WhatsApp ouvert · prêt à partager' : ch === 'email' ? 'Email prêt · client@example.com' : 'SMS envoyé', {type: 'success'});
      }
    });
  };

  /* ═══════════════════ ZAKAT CALCULATOR ═══════════════════ */
  handlers['zakat'] = () => {
    const nisab = 7438; // MAD (silver nisab as of 2026)
    let v = { cash: 0, bank: 0, gold: 0, silver: 0, inventory: 0, receivables: 0, debts: 0 };
    let recipient = null;
    const m = modal({
      tag: 'FINANCE ISLAMIQUE · زكاة',
      title: 'Calculateur Zakat 2026',
      desc: 'Nisab silver actuel : 7 438 MAD. Taux Zakat : 2,5 % sur les avoirs qualifiés.',
      width: 560,
      body: render()
    });
    function total() {
      const gOunce = v.gold * 840; // approx MAD/g 2026
      const sOunce = v.silver * 9.5;
      const base = Number(v.cash||0) + Number(v.bank||0) + gOunce + sOunce + Number(v.inventory||0) + Number(v.receivables||0) - Number(v.debts||0);
      return Math.max(0, base);
    }
    function render() {
      const tot = total();
      const due = tot >= nisab ? tot * 0.025 : 0;
      return `
        <div class="zk-hero">
          <div style="font-size:11px; letter-spacing:0.1em; color: #c6ead4; font-family: var(--mono);">ZAKAT DUE · 1447 AH</div>
          <div class="big">${due.toLocaleString('fr-FR', {maximumFractionDigits: 2})} <span style="font-size:16px; opacity:0.7;">MAD</span></div>
          <div class="sub">${tot >= nisab ? `Avoirs qualifiés : ${tot.toLocaleString('fr-FR',{maximumFractionDigits:0})} MAD (au-dessus du nisab).` : `Avoirs sous le nisab · aucune zakat due cette année.`}</div>
        </div>
        <div style="margin-bottom:8px;">
          <div style="font-size:11px; letter-spacing:0.1em; text-transform:uppercase; color:var(--n-500); font-family:var(--mono); margin-bottom:6px;">LIQUIDITÉS</div>
          <div class="zk-field"><span class="l">Espèces à la maison</span><span><input type="number" data-f="cash" value="${v.cash||''}" placeholder="0" /> MAD</span></div>
          <div class="zk-field"><span class="l">Soldes bancaires</span><span><input type="number" data-f="bank" value="${v.bank||''}" placeholder="0" /> MAD</span></div>
        </div>
        <div style="margin-top:16px;">
          <div style="font-size:11px; letter-spacing:0.1em; text-transform:uppercase; color:var(--n-500); font-family:var(--mono); margin-bottom:6px;">MÉTAUX PRÉCIEUX</div>
          <div class="zk-field"><span class="l">Or (grammes)</span><span><input type="number" data-f="gold" value="${v.gold||''}" placeholder="0" /> g</span></div>
          <div class="zk-field"><span class="l">Argent (grammes)</span><span><input type="number" data-f="silver" value="${v.silver||''}" placeholder="0" /> g</span></div>
        </div>
        <div style="margin-top:16px;">
          <div style="font-size:11px; letter-spacing:0.1em; text-transform:uppercase; color:var(--n-500); font-family:var(--mono); margin-bottom:6px;">COMMERCE & DETTES</div>
          <div class="zk-field"><span class="l">Stock marchand</span><span><input type="number" data-f="inventory" value="${v.inventory||''}" placeholder="0" /> MAD</span></div>
          <div class="zk-field"><span class="l">Créances</span><span><input type="number" data-f="receivables" value="${v.receivables||''}" placeholder="0" /> MAD</span></div>
          <div class="zk-field"><span class="l">Dettes (à déduire)</span><span><input type="number" data-f="debts" value="${v.debts||''}" placeholder="0" /> MAD</span></div>
          <div class="zk-total"><span>Total taxable</span><span>${tot.toLocaleString('fr-FR',{maximumFractionDigits:0})} MAD</span></div>
        </div>
        ${due > 0 ? `
        <div style="margin-top:20px;">
          <div style="font-size:11px; letter-spacing:0.1em; text-transform:uppercase; color:var(--n-500); font-family:var(--mono); margin-bottom:10px;">BÉNÉFICIAIRE (CNDH-AGRÉÉ)</div>
          <div class="zk-recipients">
            <div class="zk-recipient ${recipient==='amc'?'selected':''}" data-r="amc">
              <div class="n">Caritas Maroc</div>
              <div class="d">Aide aux familles démunies · 8 régions</div>
            </div>
            <div class="zk-recipient ${recipient==='beni'?'selected':''}" data-r="beni">
              <div class="n">Association Bayti</div>
              <div class="d">Enfants en situation de rue · Casablanca</div>
            </div>
            <div class="zk-recipient ${recipient==='fond'?'selected':''}" data-r="fond">
              <div class="n">Fondation Mohammed V</div>
              <div class="d">Solidarité nationale · présente partout</div>
            </div>
            <div class="zk-recipient ${recipient==='custom'?'selected':''}" data-r="custom">
              <div class="n">Autre bénéficiaire</div>
              <div class="d">Saisir le RIB / ICE d'une association</div>
            </div>
          </div>
        </div>` : ''}
        <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:22px;">
          <button class="kb ghost" data-close>Fermer</button>
          ${due > 0 ? '<button class="kb atlas" data-pay>Verser la Zakat →</button>' : ''}
        </div>
      `;
    }
    m.el.addEventListener('input', (e) => {
      const f = e.target.closest('[data-f]')?.dataset?.f;
      if (f) { v[f] = Number(e.target.value) || 0; m.el.querySelector('.kiwi-modal-body').innerHTML = render(); m.el.querySelector(`[data-f="${f}"]`)?.focus(); }
    });
    m.el.addEventListener('click', (e) => {
      const r = e.target.closest('[data-r]');
      if (r) { recipient = r.dataset.r; m.el.querySelector('.kiwi-modal-body').innerHTML = render(); }
      if (e.target.closest('[data-close]')) m.close();
      if (e.target.closest('[data-pay]')) {
        if (!recipient) { toast('Choisissez un bénéficiaire', {type: 'warn'}); return; }
        m.close();
        confetti();
        toast('Zakat versée · reçu envoyé par WhatsApp', {type: 'success', desc: 'Que Dieu accepte votre aumône.'});
      }
    });
  };

  /* ═══════════════════ SADAQA ROUND-UP ═══════════════════ */
  handlers['sadaqa'] = () => {
    let enabled = true;
    let roundTo = 5;
    let cap = 100;
    let recipient = 'amc';
    const m = modal({
      tag: 'ARRONDIS SOLIDAIRES · صدقة',
      title: 'Sadaqa round-up',
      desc: 'Arrondissez chaque achat à la valeur supérieure et reversez la différence à une association.',
      width: 500,
      body: render()
    });
    function render() {
      return `
        <div style="background: var(--paper-soft); border-radius: 14px; padding: 18px; margin-bottom: 18px; display: flex; align-items: center; gap: 14px;">
          <label style="position:relative; display:inline-block; width:48px; height:28px;">
            <input type="checkbox" ${enabled?'checked':''} data-en style="opacity:0; width:0; height:0;" />
            <span style="position:absolute; inset:0; background:${enabled?'var(--atlas)':'var(--n-300)'}; border-radius:14px; cursor:pointer; transition: background 200ms;"></span>
            <span style="position:absolute; top:3px; left:${enabled?'23px':'3px'}; width:22px; height:22px; background:#fff; border-radius:50%; transition: left 200ms;"></span>
          </label>
          <div style="flex:1;">
            <div style="font-weight:500;">Arrondis activés</div>
            <div style="font-size:12.5px; color: var(--n-500); margin-top:2px;">Chaque paiement Kiwi Card est arrondi et la différence est reversée.</div>
          </div>
        </div>
        <div class="kf-group">
          <label class="kf-label">Arrondir au multiple de</label>
          <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:6px;">
            ${[1,5,10].map(n => `<button class="kb ${roundTo===n?'atlas':'ghost'}" data-r="${n}" style="justify-content:center;">${n} MAD</button>`).join('')}
          </div>
        </div>
        <div class="kf-group">
          <label class="kf-label">Plafond mensuel · ${cap} MAD</label>
          <input type="range" min="20" max="500" step="10" value="${cap}" data-cap style="width:100%; accent-color: var(--atlas);" />
          <div class="kf-help">Protégez-vous contre les mois à gros volume.</div>
        </div>
        <div class="kf-group">
          <label class="kf-label">Bénéficiaire</label>
          <select class="kf-input" data-rec>
            <option value="amc" ${recipient==='amc'?'selected':''}>AMC · Aide aux familles démunies</option>
            <option value="beni" ${recipient==='beni'?'selected':''}>Bayti · Enfants de la rue</option>
            <option value="fond" ${recipient==='fond'?'selected':''}>Fondation Mohammed V · Solidarité nationale</option>
            <option value="rotation" ${recipient==='rotation'?'selected':''}>Rotation mensuelle (toutes)</option>
          </select>
        </div>
        <div style="margin-top:18px; padding:14px 16px; background: var(--mint-soft); border-radius: 10px; font-size: 13px; color: var(--riad);">
          <b>Exemple :</b> achat de 137,60 MAD arrondi à 140 MAD → 2,40 MAD de sadaqa.<br/>
          <b>Estimation :</b> ~47 MAD de sadaqa ce mois-ci selon votre activité.
        </div>
        <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:20px;">
          <button class="kb ghost" data-close>Annuler</button>
          <button class="kb atlas" data-save>Enregistrer</button>
        </div>
      `;
    }
    m.el.addEventListener('click', (e) => {
      const r = e.target.closest('[data-r]');
      if (r) { roundTo = Number(r.dataset.r); m.el.querySelector('.kiwi-modal-body').innerHTML = render(); }
      if (e.target.matches('[data-en]')) { enabled = e.target.checked; m.el.querySelector('.kiwi-modal-body').innerHTML = render(); }
      if (e.target.closest('[data-close]')) m.close();
      if (e.target.closest('[data-save]')) { m.close(); toast('Arrondis solidaires activés', {type:'success', desc:`Rôle : ${roundTo} MAD · ${cap} MAD/mois max`}); }
    });
    m.el.addEventListener('input', (e) => {
      if (e.target.matches('[data-cap]')) { cap = Number(e.target.value); m.el.querySelector('.kiwi-modal-body').innerHTML = render(); }
      if (e.target.matches('[data-rec]')) { recipient = e.target.value; }
    });
  };

  /* ═══════════════════ RAMADAN MODE ═══════════════════ */
  let ramadanActive = localStorage.getItem('kiwiRamadan') === '1';
  function renderRamadanBanner() {
    let b = document.querySelector('.ramadan-banner');
    if (!ramadanActive) { b?.remove(); return; }
    if (!b) {
      b = document.createElement('div');
      b.className = 'ramadan-banner';
      const isDash = !!document.querySelector('.app .sidebar');
      if (isDash) document.querySelector('.app').appendChild(b);
      b.innerHTML = `
        <div class="left-s">
          <div class="moon"></div>
          <div>
            <b>Mode Ramadan activé</b> · horaires iftar, scheduling staff adapté, prompts pourboire activés 19h-21h
          </div>
        </div>
        <div style="display:flex; align-items:center; gap:12px;">
          <div class="countdown" data-iftar>Iftar dans 04h 12m · 18:49</div>
          <button class="close" data-close-ramadan>×</button>
        </div>
      `;
      if (!b.parentElement) document.body.appendChild(b);
    }
  }
  handlers['ramadan-toggle'] = () => {
    ramadanActive = !ramadanActive;
    localStorage.setItem('kiwiRamadan', ramadanActive ? '1' : '0');
    renderRamadanBanner();
    toast(ramadanActive ? 'Mode Ramadan activé' : 'Mode Ramadan désactivé', {
      type: 'info',
      desc: ramadanActive ? 'Horaires iftar, staff Ramadan, prompts pourboire soir activés' : 'Retour aux paramètres standards'
    });
  };
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-close-ramadan]')) {
      ramadanActive = false;
      localStorage.setItem('kiwiRamadan', '0');
      document.querySelector('.ramadan-banner')?.remove();
    }
  });
  if (ramadanActive) setTimeout(renderRamadanBanner, 300);

  /* ═══════════════════ KIWI COMPTE (Business account) ═══════════════════ */
  handlers['kiwi-compte'] = () => {
    drawer({
      title: 'Kiwi Compte',
      subtitle: 'Compte pro · IBAN marocain · carte commerçant',
      width: 480,
      body: `
        <div class="kc-card">
          <div class="brand">kiwi<i></i></div>
          <div class="chip-s"></div>
          <div class="num">4982 •••• •••• 3291</div>
          <div class="row">
            <div>
              <div class="t">SOLDE</div>
              <div class="v">47 281,90 MAD</div>
            </div>
            <div>
              <div class="t">IBAN</div>
              <div class="v">MA64 0071 ••••</div>
            </div>
          </div>
        </div>
        <div class="kc-stats">
          <div class="kc-stat"><div class="l">Ce mois</div><div class="v">+186 k</div></div>
          <div class="kc-stat"><div class="l">Dépenses</div><div class="v">−138 k</div></div>
          <div class="kc-stat"><div class="l">Net</div><div class="v" style="color:var(--atlas);">+48 k</div></div>
        </div>
        <div style="font-size:11px; letter-spacing:0.1em; text-transform:uppercase; color:var(--n-500); font-family:var(--mono); margin-bottom:10px;">ACTIONS RAPIDES</div>
        <div style="display:grid; grid-template-columns:repeat(2,1fr); gap:8px; margin-bottom: 18px;">
          <button class="kb ghost" style="justify-content:flex-start; padding:14px;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M13 5l7 7-7 7"/></svg>Virer vers IBAN</button>
          <button class="kb ghost" style="justify-content:flex-start; padding:14px;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>Ajouter une carte</button>
          <button class="kb ghost" style="justify-content:flex-start; padding:14px;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>Geler la carte</button>
          <button class="kb ghost" style="justify-content:flex-start; padding:14px;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M8 12l3 3 5-6"/></svg>Payer CNSS</button>
        </div>
        <div style="font-size:11px; letter-spacing:0.1em; text-transform:uppercase; color:var(--n-500); font-family:var(--mono); margin-bottom:10px;">DERNIERS MOUVEMENTS</div>
        <div style="display:flex; flex-direction:column; gap:2px; font-size:13px;">
          ${[['Règlement Kiwi POS','Aujourd\'hui 09:00','+23 091,50','success'],['Facture Mercado Supplier','Hier','−4 280,00',''],['Salaire Fatima K.','15 avril','−6 800,00',''],['IGR 2e trimestre','10 avril','−12 400,00',''],['Règlement Kiwi POS','Lundi','+21 445,00','success']].map(([n,d,a,s]) => `
            <div style="display:flex; gap:12px; padding:10px 0; border-bottom:1px solid var(--n-200); align-items:center;">
              <div style="width:32px; height:32px; background:var(--paper-soft); border-radius:10px; display:flex; align-items:center; justify-content:center; color:var(--n-500); flex-shrink:0;">${s==='success'?'↓':'↑'}</div>
              <div style="flex:1; min-width:0;"><div style="font-weight:500;">${n}</div><div style="font-size:11.5px; color:var(--n-500); margin-top:1px;">${d}</div></div>
              <div class="mono" style="font-family:var(--mono); font-weight:500; color:${s==='success'?'var(--atlas)':'var(--ink)'};">${a}</div>
            </div>
          `).join('')}
        </div>
      `,
      foot: `
        <button class="kb atlas" style="flex:1; justify-content:center;" data-action="capital">Demander une avance de trésorerie →</button>
      `
    });
  };

  /* ═══════════════════ CAPITAL / CASH ADVANCE ═══════════════════ */
  handlers['capital'] = () => {
    let amount = 45000;
    const max = 120000;
    const min = 5000;
    const m = modal({
      tag: 'KIWI CAPITAL · AVANCE DE TRÉSORERIE',
      title: 'Financement basé sur vos ventes',
      desc: 'Remboursement automatique via 8 % de vos encaissements quotidiens. Sans dossier bancaire.',
      width: 540,
      body: render()
    });
    function render() {
      const fee = amount * 0.06;
      const dailyPct = 8;
      const daily = 6900; // avg daily take MAD (matches ~200k MAD/mois demo)
      const days = Math.ceil((amount + fee) / (daily * dailyPct / 100));
      const durationLabel = days < 45 ? `~${days} jours` : `~${Math.ceil(days / 30)} mois (${days} jours)`;
      return `
        <div class="cap-slider">
          <div class="cap-amount"><span style="color:var(--atlas); font-weight:700;">${amount.toLocaleString('fr-FR')}</span> <span style="font-size:16px; color:var(--n-500);">MAD</span></div>
          <input type="range" min="${min}" max="${max}" step="1000" value="${amount}" data-amt />
          <div class="cap-range"><span>${min.toLocaleString('fr-FR')} MAD</span><span>Pré-qualifié jusqu'à ${max.toLocaleString('fr-FR')} MAD</span></div>
        </div>
        <div style="background: var(--paper-soft); border-radius: 12px; padding: 16px 20px;">
          <div class="cap-metric"><span style="color: var(--n-600);">Montant reçu</span><span class="v">${amount.toLocaleString('fr-FR')} MAD</span></div>
          <div class="cap-metric"><span style="color: var(--n-600);">Frais fixes (6 %)</span><span class="v">${fee.toLocaleString('fr-FR',{maximumFractionDigits:0})} MAD</span></div>
          <div class="cap-metric"><span style="color: var(--n-600);">Total à rembourser</span><span class="v">${(amount+fee).toLocaleString('fr-FR',{maximumFractionDigits:0})} MAD</span></div>
          <div class="cap-metric"><span style="color: var(--n-600);">Prélèvement quotidien</span><span class="v">${dailyPct} % des ventes carte</span></div>
          <div class="cap-metric"><span style="color: var(--n-600);">Durée estimée</span><span class="v" style="color: var(--atlas);">${durationLabel}</span></div>
        </div>
        <div style="margin-top:18px; padding: 14px 16px; background: var(--mint-soft); border-radius: 10px; font-size: 12.5px; color: var(--riad); display:flex; gap:10px;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0;"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
          <div><b>Conforme Murabaha :</b> frais fixes non-usuraires, pas de taux variable. Agréé AAOIFI.</div>
        </div>
        <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:22px;">
          <button class="kb ghost" data-close>Fermer</button>
          <button class="kb atlas" data-confirm>Confirmer · fonds d'ici 24h →</button>
        </div>
      `;
    }
    m.el.addEventListener('input', (e) => {
      if (e.target.matches('[data-amt]')) { amount = Number(e.target.value); m.el.querySelector('.kiwi-modal-body').innerHTML = render(); m.el.querySelector('[data-amt]')?.focus(); }
    });
    m.el.addEventListener('click', (e) => {
      if (e.target.closest('[data-close]')) m.close();
      if (e.target.closest('[data-confirm]')) {
        m.close();
        confetti();
        toast('Kiwi Capital · demande acceptée', {type:'success', desc:`${amount.toLocaleString('fr-FR')} MAD seront crédités sur votre Kiwi Compte d'ici 24h`});
      }
    });
  };

  /* ═══════════════════ DIASPORA FX ═══════════════════ */
  handlers['diaspora'] = () => {
    let from = 100;
    const rate = 10.812; // live-ish interbank
    const kiwiRate = rate * (1 - 0.005); // 0.5% markup
    let method = 'wallet';
    const m = modal({
      tag: 'TRANSFERT DIASPORA · FRANCE → MAROC',
      title: 'Au taux interbancaire, ou presque.',
      desc: 'Taux EUR/MAD en temps réel · frais fixes transparents · livraison en 10 secondes.',
      width: 560,
      body: render()
    });
    function render() {
      const received = from * kiwiRate;
      const wiseReceived = from * rate * (1 - 0.008);
      const wafacashReceived = from * rate * (1 - 0.028);
      return `
        <div class="dx-row">
          <div class="flag fr"></div>
          <div class="info">
            <div class="l">VOUS ENVOYEZ DE</div>
            <div style="display:flex; align-items:baseline; gap:8px;"><input type="number" value="${from}" data-from /><span style="font-size:13px; color: var(--n-500);">EUR</span></div>
          </div>
        </div>
        <div style="text-align:center; margin:8px 0;"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--atlas)" stroke-width="2"><path d="M7 10l5 5 5-5"/></svg></div>
        <div class="dx-row">
          <div class="flag ma"></div>
          <div class="info">
            <div class="l">RÉCIPIENT REÇOIT</div>
            <div class="amount">${received.toLocaleString('fr-FR',{maximumFractionDigits:2})} <span class="u">MAD</span></div>
          </div>
        </div>
        <div class="dx-cmp">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0; margin-top:2px;"><path d="M12 2l2 4 4 2-4 2-2 4-2-4-4-2 4-2z" fill="currentColor"/></svg>
          <div><b>Kiwi :</b> ${received.toLocaleString('fr-FR',{maximumFractionDigits:0})} MAD (${kiwiRate.toFixed(3)}) · <b>Wafacash :</b> ${wafacashReceived.toLocaleString('fr-FR',{maximumFractionDigits:0})} MAD · <b>Wise :</b> ${wiseReceived.toLocaleString('fr-FR',{maximumFractionDigits:0})} MAD</div>
        </div>
        <div style="font-size:11px; letter-spacing:0.1em; text-transform:uppercase; color:var(--n-500); font-family:var(--mono); margin-top:18px; margin-bottom:8px;">MÉTHODE DE LIVRAISON</div>
        <div class="dx-methods">
          <div class="dx-method ${method==='wallet'?'selected':''}" data-m="wallet">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--atlas)" stroke-width="2" style="margin:0 auto;"><rect x="2" y="6" width="20" height="12" rx="2"/></svg>
            <strong>Kiwi Wallet</strong>
            <div class="time">~10 sec</div>
          </div>
          <div class="dx-method ${method==='iban'?'selected':''}" data-m="iban">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--atlas)" stroke-width="2" style="margin:0 auto;"><path d="M3 3v18h18M7 14l4-4 4 4 5-5"/></svg>
            <strong>Sur IBAN</strong>
            <div class="time">T+1</div>
          </div>
          <div class="dx-method ${method==='cash'?'selected':''}" data-m="cash">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--atlas)" stroke-width="2" style="margin:0 auto;"><rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2"/></svg>
            <strong>Cash · 4 000 agences</strong>
            <div class="time">30 min</div>
          </div>
        </div>
        <div style="margin-top:18px; padding: 12px 14px; background: var(--paper-soft); border-radius: 10px; font-size: 12.5px; color: var(--n-600); display:flex; justify-content:space-between;">
          <span>Frais Kiwi</span><b>0,50 EUR</b>
        </div>
        <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:22px;">
          <button class="kb ghost" data-close>Annuler</button>
          <button class="kb atlas" data-send>Envoyer ${from.toLocaleString('fr-FR')} EUR →</button>
        </div>
      `;
    }
    m.el.addEventListener('input', (e) => {
      if (e.target.matches('[data-from]')) { from = Math.max(1, Number(e.target.value) || 0); m.el.querySelector('.kiwi-modal-body').innerHTML = render(); setTimeout(()=>m.el.querySelector('[data-from]')?.focus(),0); }
    });
    m.el.addEventListener('click', (e) => {
      const mm = e.target.closest('[data-m]');
      if (mm) { method = mm.dataset.m; m.el.querySelector('.kiwi-modal-body').innerHTML = render(); }
      if (e.target.closest('[data-close]')) m.close();
      if (e.target.closest('[data-send]')) {
        m.close();
        confetti();
        toast('Transfert initié · ' + from + ' EUR', {type:'success', desc: method === 'wallet' ? 'Arrivée attendue dans 10 secondes' : method === 'iban' ? 'IBAN crédité demain matin' : 'Disponible en agence dans 30 min'});
      }
    });
  };

  /* ═══════════════════ LOYALTY ═══════════════════ */
  handlers['loyalty'] = () => {
    const m = modal({
      tag: 'FIDÉLITÉ · KIWI LOYALTY',
      title: 'Remplacez la carte de fidélité papier.',
      desc: 'Vos clients s\'inscrivent avec leur numéro. 10 visites = 1 offert. Ou adaptez la mécanique à votre commerce.',
      width: 540,
      body: `
        <div class="loy-preview">
          <div style="font-size:11px; letter-spacing:0.1em; font-family:var(--mono); color:var(--mint);">PROGRAMME FIDÉLITÉ · CAFÉ ATLAS</div>
          <div style="font-size:22px; font-weight:600; margin-top:6px; letter-spacing:-0.02em;">10 cafés achetés = 1 offert</div>
          <div class="loy-dots">
            <i class="active">✓</i><i class="active">✓</i><i class="active">✓</i><i class="active">✓</i><i class="current">5</i><i>6</i><i>7</i><i>8</i><i>9</i><i>🎁</i>
          </div>
          <div style="margin-top:14px; font-size:12.5px; color:#d0eed9;">456 clients inscrits · 24 % reviennent dans la semaine · +18 % de fréquentation</div>
        </div>
        <div style="font-size:11px; letter-spacing:0.1em; text-transform:uppercase; color:var(--n-500); font-family:var(--mono); margin-top:18px; margin-bottom:10px;">MODÈLE DE FIDÉLITÉ</div>
        <div style="display:flex; flex-direction:column; gap:8px;">
          <label style="display:flex; gap:12px; padding:12px 14px; border:1px solid var(--atlas); background: var(--mint-soft); border-radius: 10px; cursor:pointer;"><input type="radio" name="m" checked /><div><b>Par visite</b><div style="font-size:12px; color:var(--n-600); margin-top:2px;">X visites = Y offert · idéal café/salon</div></div></label>
          <label style="display:flex; gap:12px; padding:12px 14px; border:1px solid var(--n-200); border-radius: 10px; cursor:pointer;"><input type="radio" name="m" /><div><b>Par montant dépensé</b><div style="font-size:12px; color:var(--n-500); margin-top:2px;">1 point par MAD · conversion à 100 pts</div></div></label>
          <label style="display:flex; gap:12px; padding:12px 14px; border:1px solid var(--n-200); border-radius: 10px; cursor:pointer;"><input type="radio" name="m" /><div><b>Par produit</b><div style="font-size:12px; color:var(--n-500); margin-top:2px;">Stamp sur un item spécifique · idéal restaurant</div></div></label>
        </div>
        <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:22px;">
          <button class="kb ghost" data-close>Fermer</button>
          <button class="kb atlas" data-activate>Activer le programme →</button>
        </div>
      `
    });
    m.el.addEventListener('click', (e) => {
      if (e.target.closest('[data-close]')) m.close();
      if (e.target.closest('[data-activate]')) { m.close(); toast('Programme fidélité activé', {type:'success', desc:'Vos prochains clients verront le prompt d\'inscription sur le reçu.'}); }
    });
  };

  /* ═══════════════════ AGENT MODE (enhanced AI) ═══════════════════ */
  handlers['agent-mode'] = () => {
    drawer({
      title: 'Kiwi AI · mode agent',
      subtitle: 'Actions proposées · validation requise',
      width: 460,
      body: `
        <div class="agent-action">
          <div class="ic"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/></svg></div>
          <div class="b">
            <div class="n">Relancer 5 impayés &gt; 500 MAD</div>
            <div class="d">Total bloqué : 3 280 MAD. Brouillon WhatsApp prêt pour chaque client.</div>
            <div class="t">DÉTECTÉ · IL Y A 4 MIN</div>
            <div class="acts"><button class="approve" data-agent-approve>Approuver</button><button class="dismiss" data-agent-dismiss>Ignorer</button></div>
          </div>
        </div>
        <div class="agent-action">
          <div class="ic"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="6" width="18" height="12" rx="2"/></svg></div>
          <div class="b">
            <div class="n">Régler la CNSS · 4 280 MAD</div>
            <div class="d">Échéance dans 3 jours. Avance via Kiwi Capital disponible si besoin.</div>
            <div class="t">ÉCHÉANCE PROCHE</div>
            <div class="acts"><button class="approve" data-agent-approve>Payer maintenant</button><button class="dismiss" data-agent-dismiss>Planifier</button></div>
          </div>
        </div>
        <div class="agent-action">
          <div class="ic"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l2 4 4 2-4 2-2 4-2-4-4-2 4-2z" fill="currentColor"/></svg></div>
          <div class="b">
            <div class="n">Activer prompt pourboire +10 % après 20h</div>
            <div class="d">Gain estimé : +380 MAD/soir selon votre historique.</div>
            <div class="t">RECOMMANDATION</div>
            <div class="acts"><button class="approve" data-agent-approve>Activer</button><button class="dismiss" data-agent-dismiss>Ignorer</button></div>
          </div>
        </div>
        <div class="agent-action">
          <div class="ic"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M3 12h18M3 18h10"/></svg></div>
          <div class="b">
            <div class="n">Commander 30 kg tomates · fournisseur habituel</div>
            <div class="d">Stock bas détecté · livraison demain 7h si confirmé avant 17h.</div>
            <div class="t">INVENTAIRE · STOCK BAS</div>
            <div class="acts"><button class="approve" data-agent-approve>Confirmer commande</button><button class="dismiss" data-agent-dismiss>Choisir autre fournisseur</button></div>
          </div>
        </div>
        <div class="agent-action">
          <div class="ic"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 14s1.5 2 4 2 4-2 4-2"/><circle cx="9" cy="9" r="1" fill="currentColor"/><circle cx="15" cy="9" r="1" fill="currentColor"/><circle cx="12" cy="12" r="10"/></svg></div>
          <div class="b">
            <div class="n">Répondre à 2 avis Google négatifs</div>
            <div class="d">Brouillons de réponse professionnelle générés · ton mesuré.</div>
            <div class="t">RÉPUTATION</div>
            <div class="acts"><button class="approve" data-agent-approve>Relire et envoyer</button><button class="dismiss" data-agent-dismiss>Traiter moi-même</button></div>
          </div>
        </div>
      `,
      foot: `<button class="kb atlas" style="flex:1; justify-content:center;" data-agent-run-all>Exécuter toutes les actions approuvées →</button>`
    });
    const agentHandler = (e) => {
      const a = e.target.closest('[data-agent-approve]');
      const d = e.target.closest('[data-agent-dismiss]');
      const r = e.target.closest('[data-agent-run-all]');
      if (a) { a.textContent = 'Approuvé ✓'; a.disabled = true; a.style.opacity = '0.6'; toast('Action approuvée', {type:'success', duration:1400}); }
      if (d) { const card = d.closest('.agent-action'); card.style.opacity = '0.4'; card.style.pointerEvents = 'none'; }
      if (r) { document.querySelector('.kiwi-drawer-close')?.click(); setTimeout(()=> { toast('Agent Kiwi · 5 actions exécutées', {type:'success', desc:'Consultez les détails dans l\'historique.'}); confetti(); }, 300); }
    };
    // Cleanup prior listener, then attach fresh one bound to this drawer instance
    if (window._kiwiAgentHandler) document.body.removeEventListener('click', window._kiwiAgentHandler);
    window._kiwiAgentHandler = agentHandler;
    document.body.addEventListener('click', agentHandler);
    // Clean up when drawer closes
    const drawerBack = document.querySelector('.kiwi-drawer-backdrop');
    if (drawerBack) {
      const origClose = drawerBack.querySelector('.kiwi-drawer-close');
      origClose?.addEventListener('click', () => {
        document.body.removeEventListener('click', agentHandler);
        window._kiwiAgentHandler = null;
      }, { once: true });
    }
  };

  /* ═══════════════════ Extra command-palette entries ═══════════════════ */
  // Expose globals for palette to read
  window.KiwiFeatures = {
    paymentLink: () => handlers['payment-link'](),
    zakat: () => handlers['zakat'](),
    sadaqa: () => handlers['sadaqa'](),
    compte: () => handlers['kiwi-compte'](),
    capital: () => handlers['capital'](),
    diaspora: () => handlers['diaspora'](),
    loyalty: () => handlers['loyalty'](),
    ramadan: () => handlers['ramadan-toggle'](),
    agent: () => handlers['agent-mode'](),
  };

})();
