/* Kiwi · Croissance — Commander à table (QR Order & Pay).
 * The guest scans the table QR, browses the menu, orders and pays from their
 * phone — no waiter. Premium surface on the growth-kit. Requires
 * interactive.js + growth-kit.js. */
(() => {
  'use strict';
  if (!window.Kiwi) { console.warn('growth-qr.js loaded before interactive.js'); return; }
  const { drawer, toast, confetti } = window.Kiwi;
  const lang = () => (window.KiwiI18n?.getLang?.() || 'fr');
  const fmt = (n) => Math.round(n).toLocaleString('fr-FR');

  const TABLES = [
    { t: 'T1', s: 'free' }, { t: 'T2', s: 'busy' }, { t: 'T3', s: 'ordering' }, { t: 'T4', s: 'free' },
    { t: 'T5', s: 'busy' }, { t: 'T6', s: 'free' }, { t: 'T7', s: 'ordering' }, { t: 'T8', s: 'free' },
    { t: 'T9', s: 'busy' }, { t: 'T10', s: 'free' }, { t: 'T11', s: 'free' }, { t: 'T12', s: 'ordering' },
  ];

  const STR = {
    fr: { title: 'Commander à table', sub: 'Le client scanne, commande et paie depuis son téléphone, sans attendre.',
      eyebrow: 'EXPÉRIENCE SANS CONTACT', head: 'Sans serveur, sans attente',
      lede: 'Chaque table porte son QR. Le client parcourt votre carte, commande et règle en quelques secondes, la commande tombe directement en cuisine.',
      s1: 'des tables via QR', s2: 'panier QR', s3: 'sur le service',
      preview: 'APERÇU CLIENT', tables: 'TABLES', tablesHint: '1 QR par table',
      menu: 'Carte', add: 'Ajouter', cart: (n, m) => `${n} articles · ${fmt(m)} MAD`, pay: 'Payer',
      free: 'Libre', busy: 'Occupée', ordering: 'Commande',
      print: 'Imprimer les QR', cta: 'Activer la commande à table', close: 'Fermer',
      toastP: 'QR des tables envoyés à l\'impression', toastA: 'Commande à table activée', toastAD: '12 tables · paiement Kiwi · commande en cuisine en direct.' },
    en: { title: 'Order at the table', sub: 'The guest scans, orders and pays from their phone, no waiting.',
      eyebrow: 'CONTACTLESS EXPERIENCE', head: 'No waiter, no waiting',
      lede: 'Every table carries its QR. The guest browses your menu, orders and pays in seconds, the order drops straight into the kitchen.',
      s1: 'of tables via QR', s2: 'QR basket', s3: 'on service time',
      preview: 'GUEST PREVIEW', tables: 'TABLES', tablesHint: '1 QR per table',
      menu: 'Menu', add: 'Add', cart: (n, m) => `${n} items · ${fmt(m)} MAD`, pay: 'Pay',
      free: 'Free', busy: 'Seated', ordering: 'Ordering',
      print: 'Print the QR codes', cta: 'Turn on order at the table', close: 'Close',
      toastP: 'Table QR codes sent to print', toastA: 'Order at the table activated', toastAD: '12 tables · Kiwi payment · live kitchen orders.' },
    ar: { title: 'الطلب من الطاولة', sub: 'الزبون يمسح، يطلب ويدفع من هاتفه، بدون انتظار.',
      eyebrow: 'تجربة بدون تلامس', head: 'بدون نادل، بدون انتظار',
      lede: 'كل طاولة تحمل رمزها. يتصفّح الزبون قائمتك، يطلب ويدفع في ثوانٍ، ويصل الطلب مباشرة إلى المطبخ.',
      s1: 'من الطاولات عبر QR', s2: 'سلة QR', s3: 'على وقت الخدمة',
      preview: 'معاينة الزبون', tables: 'الطاولات', tablesHint: 'رمز لكل طاولة',
      menu: 'القائمة', add: 'إضافة', cart: (n, m) => `${n} أصناف · ${fmt(m)} درهم`, pay: 'الدفع',
      free: 'فارغة', busy: 'مشغولة', ordering: 'تطلب',
      print: 'طباعة رموز QR', cta: 'تفعيل الطلب من الطاولة', close: 'إغلاق',
      toastP: 'تم إرسال رموز الطاولات للطباعة', toastA: 'تم تفعيل الطلب من الطاولة', toastAD: '12 طاولة · دفع كيوي · طلبات مباشرة للمطبخ.' },
  };

  const CSS = `
  .qro-hero { padding:24px 26px; }
  .qro-eyebrow { font-family:var(--mono); font-size:10.5px; letter-spacing:.16em; color:var(--mint); }
  .qro-head { font-size:30px; line-height:1.08; color:var(--paper); margin:8px 0 10px; }
  .qro-lede { font-size:13.5px; color:#cdeed9; line-height:1.55; max-width:62ch; }
  .qro-stats { display:flex; gap:26px; margin-top:20px; flex-wrap:wrap; }
  .qro-stat .v { font-size:26px; color:var(--paper); } .qro-stat .v.serif { font-family:var(--serif); }
  .qro-stat .l { font-size:11.5px; color:#cdeed9; margin-top:2px; }

  .qro-grid { display:grid; grid-template-columns:300px 1fr; gap:22px; margin-top:20px; align-items:start; }
  .qro-col-t { font-family:var(--mono); font-size:11px; letter-spacing:.12em; text-transform:uppercase; color:var(--n-500); display:flex; justify-content:space-between; }

  /* Phone */
  /* Theme-locked device mockup — a phone bezel stays dark in every theme
   * (var(--ink) would invert it to a white phone in dark mode). */
  .qro-phone { margin-top:12px; width:300px; border-radius:34px; background:#0A0F0D; padding:11px; box-shadow:0 30px 60px -28px rgba(10,15,13,.5); }
  .qro-screen { background:var(--paper); border-radius:25px; overflow:hidden; }
  .qro-ph-head { background:linear-gradient(150deg,var(--riad),var(--atlas)); color:var(--paper); padding:18px 18px 16px; text-align:center; }
  .qro-ph-name { font-family:var(--serif); font-size:19px; } .qro-ph-tbl { font-size:11px; color:#cdeed9; margin-top:2px; font-family:var(--mono); letter-spacing:.06em; }
  .qro-ph-body { padding:14px 16px 0; max-height:300px; overflow:hidden; }
  .qro-ph-cat { font-family:var(--mono); font-size:10px; letter-spacing:.12em; color:var(--n-500); margin:10px 0 8px; }
  .qro-ph-item { display:flex; align-items:center; gap:10px; padding:9px 0; border-bottom:1px solid var(--n-200); }
  .qro-ph-item .nm { flex:1; font-size:13px; } .qro-ph-item .pr { font-family:var(--mono); font-size:12px; color:var(--n-600); }
  .qro-ph-add { width:24px; height:24px; border-radius:8px; background:var(--mint-soft); color:var(--atlas); border:0; font-size:15px; line-height:1; cursor:pointer; flex:0 0 auto; }
  .qro-ph-cart { background:#0A0F0D; color:#F7F5F0; margin:14px; border-radius:14px; padding:12px 16px; display:flex; align-items:center; justify-content:space-between; }
  .qro-ph-cart .c { font-size:12.5px; } .qro-ph-cart .pay { background:var(--mint); color:var(--riad); font-weight:600; font-size:13px; padding:7px 16px; border-radius:9px; }

  .qro-tables { margin-top:12px; display:grid; grid-template-columns:repeat(auto-fill,minmax(118px,1fr)); gap:12px; }
  .qro-tile { background:var(--surface); border:1px solid var(--n-200); border-radius:16px; padding:14px 12px 12px; text-align:center; transition:border-color .15s, box-shadow .15s, transform .15s; }
  .qro-tile:hover { border-color:var(--n-300); box-shadow:0 10px 24px -16px rgba(10,15,13,.3); transform:translateY(-2px); }
  .qro-tile .t { font-family:var(--mono); font-size:12px; color:var(--n-600); margin-bottom:9px; }
  .qro-tile .gk-qr { padding:7px; border-radius:12px; }
  .qro-st { display:inline-block; margin-top:10px; font-size:10.5px; font-family:var(--mono); padding:3px 9px; border-radius:999px; }
  .qro-st.free { background:var(--paper-soft); color:var(--n-600); } .qro-st.busy { background:#FFF2D6; color:#8A6210; } .qro-st.ordering { background:var(--mint-soft); color:#075238; }

  .qro-foot { display:flex; justify-content:flex-end; gap:10px; margin-top:24px; }

  html[data-theme="dark"] .qro-tile { background:#131916; border-color:#26302b; }
  html[data-theme="dark"] .qro-st.ordering { color:var(--mint); }
  html[data-theme="dark"] .qro-screen { background:#0f1714; } html[data-theme="dark"] .qro-ph-item { border-color:#26302b; }
  @media (max-width:820px){ .qro-grid{grid-template-columns:1fr;} .qro-phone{margin:12px auto 0;} }
  `;
  const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);

  const realTenant = () => {
    try {
      if (window.KiwiEnv?.isReal?.() || window.KiwiMe || window.KiwiVenue?.isCustom?.()) return true;
      const P = window.KiwiCaissePairing;
      if (P?.isPaired?.() && P?.pairedVenue?.()?.merchant) return true;
      if (localStorage.getItem('kiwiPaired') === '1') {
        const pv = JSON.parse(localStorage.getItem('kiwiPairedVenue') || 'null');
        return !!(pv?.merchant || localStorage.getItem('kiwiLiveMerchant'));
      }
    } catch (_) {}
    return false;
  };
  const bizLabel = () => {
    try {
      // Label the STORE on screen, not the account — two shops on one account
      // would otherwise both be captioned with the same name.
      if (window.KiwiVenue?.isCustom?.()) { const vd = window.KiwiVenue.getCurrentVenueData?.(); if (vd && (vd.fullDisplay || vd.name)) return vd.fullDisplay || vd.name; }
      const b = (window.KiwiMe && window.KiwiMe.business || '').trim();
      if (b) return b;
    } catch (_) {}
    return realTenant() ? 'Votre établissement' : 'Café Atlas · Maarif';
  };

  window.Kiwi.handlers['growth-qr'] = () => {
    const T = STR[lang()] || STR.fr;
    const KIT = window.KiwiKit;
    const items = (window.KiwiVenue?.getMenuItems?.() || []).filter(i => i.price > 0);
    const byCat = (cat, n) => items.filter(i => i.category === cat).slice(0, n);
    const menu = [
      { c: lang() === 'ar' ? 'مقبلات' : 'Entrées', items: byCat('entrees', 3) },
      { c: lang() === 'ar' ? 'أطباق' : 'Plats', items: byCat('tajines', 3) },
    ];
    const menuHtml = menu.map(g => `<div class="qro-ph-cat">${g.c}</div>` + g.items.map(it =>
      `<div class="qro-ph-item"><span class="nm">${it.name}</span><span class="pr">${fmt(it.price)}</span><button class="qro-ph-add" data-qro-add>+</button></div>`).join('')).join('');

    const body = `<div class="gk-reveal-root">
      <div class="gk-hero qro-hero">
        <div class="qro-eyebrow">${T.eyebrow}</div>
        <div class="qro-head gk-serif">${T.head}</div>
        <div class="qro-lede">${T.lede}</div>
        <div class="qro-stats">
          <div class="qro-stat"><div class="v serif">32 %</div><div class="l">${T.s1}</div></div>
          <div class="qro-stat"><div class="v serif">+18 %</div><div class="l">${T.s2}</div></div>
          <div class="qro-stat"><div class="v serif">−7 min</div><div class="l">${T.s3}</div></div>
        </div>
      </div>

      <div class="qro-grid">
        <div>
          <div class="qro-col-t"><span>${T.preview}</span></div>
          <div class="qro-phone"><div class="qro-screen">
            <div class="qro-ph-head"><div class="qro-ph-name">${bizLabel()}</div><div class="qro-ph-tbl">T4, ${T.menu}</div></div>
            <div class="qro-ph-body">${menuHtml}</div>
            <div class="qro-ph-cart"><span class="c">${T.cart(2, 95)}</span><span class="pay">${T.pay}</span></div>
          </div></div>
        </div>
        <div>
          <div class="qro-col-t"><span>${T.tables}</span><span style="text-transform:none;letter-spacing:0;color:var(--n-500);">${T.tablesHint}</span></div>
          <div class="qro-tables">${TABLES.map(tb => `<div class="qro-tile">
            <div class="t">${tb.t}</div>${KIT ? KIT.qr(74) : ''}
            <div class="qro-st ${tb.s}">${T[tb.s]}</div></div>`).join('')}</div>
        </div>
      </div>

      <div class="qro-foot"><button class="kb ghost" data-dismiss>${T.close}</button><button class="kb ghost" data-qro-print>${T.print}</button><button class="kb atlas" data-qro-cta>${T.cta}</button></div>
    </div>`;

    const d = drawer({ title: T.title, subtitle: T.sub, fullpage: true, body });
    if (KIT) KIT.reveal(d.el.querySelector('.gk-reveal-root'));
    // The real generator lives in order-qr.js. The two action buttons here open
    // it (real, scannable QR + per-table sheets); the tease above stays the intro.
    const openGenerator = () => {
      const gen = window.Kiwi.handlers['order-qr'];
      if (gen) { if (d.close) d.close(); gen(); }
      else { toast(T.toastP, { type: 'info' }); } // fail-soft if the module didn't load
    };
    d.el.addEventListener('click', (e) => {
      if (e.target.closest('[data-qro-add]')) { toast(T.add, { type: 'success' }); }
      else if (e.target.closest('[data-qro-print]') || e.target.closest('[data-qro-cta]')) { openGenerator(); }
    });
  };
})();
