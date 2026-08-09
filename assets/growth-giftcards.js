/* Kiwi · Croissance — Cartes cadeaux (gift cards · issue & redeem).
 * Premium surface on the growth-kit. Requires interactive.js + growth-kit.js. */
(() => {
  'use strict';
  if (!window.Kiwi) { console.warn('growth-giftcards.js loaded before interactive.js'); return; }
  const { drawer, toast, confetti } = window.Kiwi;
  const lang = () => (window.KiwiI18n?.getLang?.() || 'fr');
  const fmt = (n) => Math.round(n).toLocaleString('fr-FR');

  const CARDS = [
    { code: '4821', to: 'Yasmine Benali', bal: 120, tot: 200, exp: '12/2026', st: 'active' },
    { code: '7390', to: 'Karim Tazi',     bal: 500, tot: 500, exp: '03/2027', st: 'active' },
    { code: '2654', to: 'Sofia Amrani',   bal: 0,   tot: 200, exp: '11/2026', st: 'used' },
    { code: '9182', to: 'Omar Cherkaoui', bal: 80,  tot: 100, exp: '09/2026', st: 'active' },
    { code: '5037', to: 'Lina Saadi',     bal: 200, tot: 200, exp: '01/2027', st: 'active' },
    { code: '1148', to: 'Hamza El Fassi', bal: 0,   tot: 300, exp: '05/2026', st: 'expired' },
  ];

  const STR = {
    fr: { title: 'Cartes cadeaux', sub: 'Émettez une carte en quelques secondes, encaissée d\'avance, dépensée chez vous.',
      issue: 'ÉMETTRE UNE CARTE', amount: 'Montant', free: 'Libre', recipient: 'Destinataire',
      namePh: 'Nom', phonePh: 'Téléphone (WhatsApp)', send: 'Envoyer par WhatsApp',
      statsEm: 'Émises ce mois', statsCirc: 'En circulation', statsUse: 'Taux d\'utilisation',
      active: 'CARTES ACTIVES', th: { code: 'Carte', to: 'Bénéficiaire', bal: 'Solde', exp: 'Expire', st: 'Statut' },
      stL: { active: 'Active', used: 'Utilisée', expired: 'Expirée' },
      redeem: 'Vérifier un solde', redeemPh: 'Saisir un code cadeau', check: 'Vérifier',
      sent: 'Carte cadeau envoyée', sentD: (a) => `${fmt(a)} MAD · lien WhatsApp prêt à partager.`,
      bal: (b) => `Solde : ${fmt(b)} MAD · valable jusqu'au 31/12/2026`, close: 'Fermer' },
    en: { title: 'Gift cards', sub: 'Issue a card in seconds, paid upfront, spent with you.',
      issue: 'ISSUE A CARD', amount: 'Amount', free: 'Custom', recipient: 'Recipient',
      namePh: 'Name', phonePh: 'Phone (WhatsApp)', send: 'Send via WhatsApp',
      statsEm: 'Issued this month', statsCirc: 'In circulation', statsUse: 'Redemption rate',
      active: 'ACTIVE CARDS', th: { code: 'Card', to: 'Recipient', bal: 'Balance', exp: 'Expires', st: 'Status' },
      stL: { active: 'Active', used: 'Used', expired: 'Expired' },
      redeem: 'Check a balance', redeemPh: 'Enter a gift code', check: 'Check',
      sent: 'Gift card sent', sentD: (a) => `${fmt(a)} MAD · WhatsApp link ready to share.`,
      bal: (b) => `Balance: ${fmt(b)} MAD · valid until 31/12/2026`, close: 'Close' },
    ar: { title: 'بطاقات الهدايا', sub: 'أصدر بطاقة في ثوانٍ، مدفوعة مسبقًا، تُنفق عندك.',
      issue: 'إصدار بطاقة', amount: 'المبلغ', free: 'مبلغ حر', recipient: 'المستفيد',
      namePh: 'الاسم', phonePh: 'الهاتف (واتساب)', send: 'إرسال عبر واتساب',
      statsEm: 'صادرة هذا الشهر', statsCirc: 'قيد التداول', statsUse: 'معدل الاستخدام',
      active: 'البطاقات النشطة', th: { code: 'البطاقة', to: 'المستفيد', bal: 'الرصيد', exp: 'تنتهي', st: 'الحالة' },
      stL: { active: 'نشطة', used: 'مستخدمة', expired: 'منتهية' },
      redeem: 'التحقق من رصيد', redeemPh: 'أدخل رمز هدية', check: 'تحقّق',
      sent: 'تم إرسال البطاقة', sentD: (a) => `${fmt(a)} درهم · رابط واتساب جاهز للمشاركة.`,
      bal: (b) => `الرصيد: ${fmt(b)} درهم · صالحة حتى 31/12/2026`, close: 'إغلاق' },
  };

  const CSS = `
  .gft-grid { display:grid; grid-template-columns:330px 1fr; gap:20px; align-items:start; }
  .gft-colt { font-family:var(--mono); font-size:11px; letter-spacing:.12em; text-transform:uppercase; color:var(--n-500); margin-bottom:12px; }

  /* The gift card */
  .gft-card { position:relative; overflow:hidden; aspect-ratio:1.6/1; border-radius:18px; color:var(--paper);
    background:linear-gradient(135deg, var(--riad) 0%, var(--atlas) 70%); padding:20px; display:flex; flex-direction:column; justify-content:space-between;
    box-shadow:0 24px 48px -22px rgba(11,110,79,.7); }
  .gft-card::before { content:''; position:absolute; inset:0; background:radial-gradient(110% 80% at 85% -15%, rgba(125,242,176,.28), transparent 55%); }
  .gft-card::after { content:''; position:absolute; top:-60%; left:-20%; width:60%; height:220%; transform:rotate(18deg); background:linear-gradient(90deg, transparent, rgba(255,255,255,.10), transparent); }
  .gft-card > * { position:relative; }
  .gft-card .top { display:flex; align-items:center; justify-content:space-between; }
  .gft-card .brand { display:inline-flex; align-items:center; } .gft-card .brand img { display:block; width:auto; height:23px; }
  .gft-card .chip { width:34px; height:26px; border-radius:6px; background:linear-gradient(135deg,#d9c47a,#b89a3e); opacity:.85; }
  .gft-card .code { font-family:var(--mono); font-size:15px; letter-spacing:.18em; }
  .gft-card .amt { font-family:var(--serif); font-size:34px; line-height:1; }

  .gft-amts { display:flex; gap:8px; margin:16px 0 12px; flex-wrap:wrap; }
  .gft-amt { font-family:var(--mono); font-size:13px; padding:9px 14px; border-radius:11px; border:1px solid var(--n-200); background:var(--surface); cursor:pointer; transition: background-color 150ms cubic-bezier(0.32,0.72,0,1), border-color 150ms cubic-bezier(0.32,0.72,0,1), color 150ms ease, transform 150ms cubic-bezier(0.34, 1.45, 0.5, 1); }
  .gft-amt:hover:not(.on) { border-color:var(--n-300); background:var(--paper-soft); }
  .gft-amt:active { transform:scale(0.96); }
  .gft-amt.on { background:var(--atlas); color:#fff; border-color:var(--atlas); }
  .gft-in { width:100%; font-size:13px; padding:10px 12px; border:1px solid var(--n-200); border-radius:10px; margin-bottom:9px; background:var(--surface); color:var(--ink); font-family:inherit; }
  .gft-send { width:100%; margin-top:4px; }

  .gft-stats { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; }
  .gft-stat { background:var(--surface); border:1px solid var(--n-200); border-radius:15px; padding:15px 16px; }
  .gft-stat .v { font-family:var(--serif); font-size:26px; line-height:1; } .gft-stat .l { font-size:11.5px; color:var(--n-500); margin-top:6px; }

  .gft-tbl { width:100%; border-collapse:collapse; background:var(--surface); border:1px solid var(--n-200); border-radius:16px; overflow:hidden; margin-top:14px; }
  .gft-tbl th { font-family:var(--mono); font-size:10px; letter-spacing:.08em; text-transform:uppercase; color:var(--n-500); text-align:start; padding:11px 14px; background:var(--paper-soft); font-weight:500; }
  .gft-tbl td { padding:12px 14px; font-size:13px; border-top:1px solid var(--n-200); transition: background-color 180ms cubic-bezier(0.32, 0.72, 0, 1); } .gft-tbl td.mono { font-family:var(--mono); font-size:12px; }
  .gft-tbl tr:hover td { background:var(--paper-soft); }
  .gft-bal { display:flex; align-items:center; gap:8px; } .gft-bal .track { width:54px; height:5px; border-radius:3px; background:var(--n-200); overflow:hidden; } .gft-bal .fill { height:100%; background:var(--atlas); }
  .gft-stt { font-size:10.5px; font-family:var(--mono); padding:3px 9px; border-radius:999px; } .gft-stt.active { background:var(--mint-soft); color:#075238; } .gft-stt.used { background:var(--paper-soft); color:var(--n-500); } .gft-stt.expired { background:#FBE3DD; color:#C0492F; }

  .gft-redeem { margin-top:16px; display:flex; gap:9px; } .gft-redeem .gft-in { margin:0; flex:1; }
  .gft-foot { display:flex; justify-content:flex-end; margin-top:22px; }
  html[data-theme="dark"] .gft-amt, html[data-theme="dark"] .gft-in, html[data-theme="dark"] .gft-stat, html[data-theme="dark"] .gft-tbl { background:#131916; border-color:#26302b; color:var(--paper); }
  html[data-theme="dark"] .gft-amt.on { background:var(--atlas); border-color:var(--atlas); color:#fff; }
  html[data-theme="dark"] .gft-stt.active { color:var(--mint); }
  html[data-theme="dark"] .gft-tbl th { background:#0f1714; } html[data-theme="dark"] .gft-tbl td { border-color:#26302b; } html[data-theme="dark"] .gft-tbl tr:hover td { background:#0f1714; }
  @media (max-width:820px){ .gft-grid{grid-template-columns:1fr;} .gft-stats{grid-template-columns:1fr 1fr;} }
  `;
  const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);

  const gcReal = () => { try { return !!(window.KiwiEnv?.isReal?.() || window.KiwiVenue?.isCustom?.()); } catch (_) { return false; } };

  window.Kiwi.handlers['growth-giftcards'] = () => {
    const T = STR[lang()] || STR.fr;
    let amt = 200;
    // A real merchant hasn't issued any cards yet — empty table + zeroed stats,
    // never the demo cardholders (Yasmine Benali, Karim Tazi…).
    const cards = gcReal() ? [] : CARDS;
    const stEm = gcReal() ? '0' : '38', stCirc = gcReal() ? '0' : '7 250', stUse = gcReal() ? '—' : '71 %';

    const body = `<div class="gk-reveal-root">
      <div class="gft-grid">
        <div>
          <div class="gft-colt">${T.issue}</div>
          <div class="gft-card">
            <div class="top"><div class="brand"><img src="assets/kiwi-newlogo-inverse.svg" alt="Kiwi"></div><div class="chip"></div></div>
            <div>
              <div class="code">KIWI ···· <span data-gft-code>4821</span></div>
              <div class="amt gk-serif" data-gft-cardamt>${fmt(amt)} <span style="font-size:15px;font-family:var(--sans);">MAD</span></div>
            </div>
          </div>
          <div class="gft-amts">
            ${[100, 200, 500].map(a => `<button class="gft-amt ${a === amt ? 'on' : ''}" data-gft-amt="${a}">${a} MAD</button>`).join('')}
            <button class="gft-amt" data-gft-amt="free">${T.free}</button>
          </div>
          <input class="gft-in" placeholder="${T.namePh}" />
          <input class="gft-in" placeholder="${T.phonePh}" />
          <button class="kb atlas gft-send" data-gft-send>${T.send}</button>
        </div>

        <div>
          <div class="gft-stats">
            <div class="gft-stat"><div class="v">${stEm}</div><div class="l">${T.statsEm}</div></div>
            <div class="gft-stat"><div class="v">${stCirc}</div><div class="l">${T.statsCirc} (MAD)</div></div>
            <div class="gft-stat"><div class="v">${stUse}</div><div class="l">${T.statsUse}</div></div>
          </div>
          <div class="gft-colt" style="margin-top:20px;">${T.active}</div>
          <table class="gft-tbl"><thead><tr><th>${T.th.code}</th><th>${T.th.to}</th><th>${T.th.bal}</th><th>${T.th.exp}</th><th>${T.th.st}</th></tr></thead>
          <tbody>${cards.map(c => `<tr>
            <td class="mono">···· ${c.code}</td><td style="font-weight:500">${c.to}</td>
            <td><div class="gft-bal"><span class="track"><span class="fill" style="width:${Math.round(c.bal / c.tot * 100)}%"></span></span><span class="mono" style="font-size:11.5px">${fmt(c.bal)}/${fmt(c.tot)}</span></div></td>
            <td class="mono" style="color:var(--n-500)">${c.exp}</td><td><span class="gft-stt ${c.st}">${T.stL[c.st]}</span></td></tr>`).join('')}</tbody></table>
          <div class="gft-redeem"><input class="gft-in" placeholder="${T.redeemPh}" data-gft-redeem /><button class="kb ghost" data-gft-check>${T.check}</button></div>
        </div>
      </div>
      <div class="gft-foot"><button class="kb ghost" data-dismiss>${T.close}</button></div>
    </div>`;

    const d = drawer({ title: T.title, subtitle: T.sub, fullpage: true, body });
    if (window.KiwiKit) window.KiwiKit.reveal(d.el.querySelector('.gk-reveal-root'));
    const root = d.el;
    d.el.addEventListener('click', (e) => {
      const a = e.target.closest('[data-gft-amt]');
      if (a) {
        root.querySelectorAll('[data-gft-amt]').forEach(x => x.classList.toggle('on', x === a));
        if (a.dataset.gftAmt !== 'free') { amt = +a.dataset.gftAmt; root.querySelector('[data-gft-cardamt]').innerHTML = `${fmt(amt)} <span style="font-size:15px;font-family:var(--sans);">MAD</span>`; }
      } else if (e.target.closest('[data-gft-send]')) {
        confetti && confetti(); toast(T.sent, { type: 'success', desc: T.sentD(amt) });
      } else if (e.target.closest('[data-gft-check]')) {
        toast(T.redeem, { type: 'info', desc: T.bal(200) });
      }
    });
  };
})();
