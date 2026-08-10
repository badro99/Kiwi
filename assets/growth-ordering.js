/* Kiwi · Croissance — Commande en ligne (commission-free online ordering).
 * The anti-aggregator wedge: your own branded storefront at 0 % commission.
 * Premium surface built on the growth-kit (branded QR, hero atmosphere, serif,
 * staggered reveal). Requires interactive.js + growth-kit.js. */
(() => {
  'use strict';
  if (!window.Kiwi) { console.warn('growth-ordering.js loaded before interactive.js'); return; }
  const { drawer, toast, confetti } = window.Kiwi;
  const lang = () => (window.KiwiI18n?.getLang?.() || 'fr');
  const fmt = (n) => Math.round(n).toLocaleString('fr-FR');

  const BASE = 48200;                              // online sales / month (MAD)
  const CH = [
    { id: 'kiwi',  label: 'Kiwi Direct', sub: { fr: '0 % commission · paiement Kiwi', en: '0 % commission · Kiwi payment', ar: '0٪ عمولة · دفع كيوي' }, state: 'on' },
    /* Glovo était marqué `linked`. Il ne l'a jamais été : aucun code n'a jamais
       parlé à Glovo. « Connecter » ouvre maintenant le vrai connecteur
       (assets/channel-link.js → /api/channel/order), qui remet au commerçant
       l'adresse et la clé que le programme POS de Delivery Hero réclame.
       Jumia Food a été retiré : l'enseigne a quitté le Maroc fin 2023. La
       laisser dans une liste d'intégrations, c'est dater le produit de trois
       ans devant le premier restaurateur qui la lit. */
    { id: 'glovo',  label: 'Glovo',          sub: { fr: 'Agrégateur · ~30 %', en: 'Aggregator · ~30 %', ar: 'وسيط · ~30٪' }, state: 'connect' },
    { id: 'yassir', label: 'Yassir Express', sub: { fr: 'Agrégateur · commission variable', en: 'Aggregator · variable commission', ar: 'وسيط · عمولة متغيرة' }, state: 'connect' },
    { id: 'cc',    label: 'Click & Collect', sub: { fr: 'Retrait en boutique', en: 'In-store pickup', ar: 'الاستلام من المتجر' }, state: 'on' },
    { id: 'liv',   label: 'Livraison Kiwi', sub: { fr: 'Flotte Kiwi · tarif fixe', en: 'Kiwi fleet · flat fee', ar: 'أسطول كيوي · سعر ثابت' }, state: 'connect' },
  ];

  const STR = {
    fr: { title: 'Commande en ligne', sub: 'Votre boutique à 0 % de commission, la parade aux agrégateurs.',
      eyebrow: 'VOTRE BOUTIQUE KIWI', tagline: 'Commande, paiement et retrait en ligne. Aucun intermédiaire, aucune commission.',
      copy: 'Copier', copied: 'Lien copié', online: 'En ligne · visible par vos clients', scan: 'Scannez pour commander',
      keepEyebrow: 'CE QUE VOUS GARDEZ', keepUnit: 'MAD/mois',
      keepNote: () => `de plus qu'avec Glovo, chaque mois. Kiwi Direct ne prélève rien, les agrégateurs gardent près du tiers de chaque commande.`,
      onBase: (b) => `Sur ${fmt(b)} MAD/mois en ligne`,
      channels: 'Canaux de vente', channelsHint: 'Connectez vos points de vente',
      on: 'Activé', linked: 'Connecté', connect: 'Connecter', waiting: 'Clé remise · en attente',
      inbox: 'Commandes en ligne', inboxHint: (n) => `${n} aujourd'hui`,
      st: { new: 'Nouveau', prep: 'En préparation', ready: 'Prêt' },
      cta: 'Activer la boutique en ligne', close: 'Fermer', toastT: 'Boutique en ligne activée', toastD: 'kiwi.shop/cafe-atlas est en ligne · 0 % de commission.', sent: 'Commande envoyée en cuisine' },
    en: { title: 'Online ordering', sub: 'Your storefront at 0 % commission, the counter to aggregators.',
      eyebrow: 'YOUR KIWI STOREFRONT', tagline: 'Order, pay and pick up online. No middleman, no commission.',
      copy: 'Copy', copied: 'Link copied', online: 'Live · visible to your customers', scan: 'Scan to order',
      keepEyebrow: 'WHAT YOU KEEP', keepUnit: 'MAD/mo',
      keepNote: () => `more than with Glovo, every month. Kiwi Direct takes nothing, aggregators keep nearly a third of every order.`,
      onBase: (b) => `On ${fmt(b)} MAD/mo online`,
      channels: 'Sales channels', channelsHint: 'Connect your points of sale',
      on: 'On', linked: 'Connected', connect: 'Connect', waiting: 'Key issued · waiting',
      inbox: 'Online orders', inboxHint: (n) => `${n} today`,
      st: { new: 'New', prep: 'Preparing', ready: 'Ready' },
      cta: 'Turn on the online store', close: 'Close', toastT: 'Online store activated', toastD: 'kiwi.shop/cafe-atlas is live · 0 % commission.', sent: 'Order sent to the kitchen' },
    ar: { title: 'الطلب عبر الإنترنت', sub: 'متجرك بعمولة 0٪، الرد على الوسطاء.',
      eyebrow: 'متجرك على كيوي', tagline: 'الطلب والدفع والاستلام عبر الإنترنت. بدون وسيط، بدون عمولة.',
      copy: 'نسخ', copied: 'تم نسخ الرابط', online: 'مباشر · ظاهر لعملائك', scan: 'امسح للطلب',
      keepEyebrow: 'ما تحتفظ به', keepUnit: 'درهم/شهر',
      keepNote: () => `أكثر من Glovo، كل شهر. كيوي دايركت لا يأخذ شيئًا، الوسطاء يحتفظون بقرابة ثلث كل طلب.`,
      onBase: (b) => `على ${fmt(b)} درهم/شهر عبر الإنترنت`,
      channels: 'قنوات البيع', channelsHint: 'اربط نقاط بيعك',
      on: 'مفعّل', linked: 'متصل', connect: 'ربط', waiting: 'تم تسليم المفتاح · في الانتظار',
      inbox: 'الطلبات عبر الإنترنت', inboxHint: (n) => `${n} اليوم`,
      st: { new: 'جديد', prep: 'قيد التحضير', ready: 'جاهز' },
      cta: 'تفعيل المتجر الإلكتروني', close: 'إغلاق', toastT: 'تم تفعيل المتجر', toastD: 'kiwi.shop/cafe-atlas مباشر · عمولة 0٪.', sent: 'أُرسل الطلب إلى المطبخ' },
  };

  const CSS = `
  .ord-grid { display:grid; grid-template-columns:1.05fr .95fr; gap:16px; }
  .ord-hero { padding:24px; display:flex; gap:22px; align-items:center; }
  .ord-hero-l { flex:1; min-width:0; }
  .ord-eyebrow { font-family:var(--mono); font-size:10.5px; letter-spacing:.16em; color:var(--mint); }
  .ord-name { font-size:30px; line-height:1.05; margin:7px 0 9px; color:var(--paper); }
  .ord-tag { font-size:13px; color:#cdeed9; line-height:1.5; max-width:34ch; }
  .ord-link { margin-top:16px; display:flex; align-items:center; gap:10px; background:rgba(255,255,255,.10); border:1px solid rgba(255,255,255,.16); border-radius:12px; padding:11px 14px; }
  .ord-link .u { font-family:var(--mono); font-size:13px; color:var(--paper); flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .ord-link .cp { font-size:12.5px; color:var(--mint); font-weight:600; cursor:pointer; background:none; border:0; white-space:nowrap; transition: color 150ms cubic-bezier(0.32,0.72,0,1), transform 150ms cubic-bezier(0.34, 1.45, 0.5, 1); }
  .ord-link .cp:hover { color:#fff; }
  .ord-link .cp:active { transform:scale(0.95); }
  .ord-statusrow { margin-top:14px; display:flex; align-items:center; gap:12px; }
  .ord-status { display:flex; align-items:center; gap:7px; font-size:12px; color:#cdeed9; }
  .ord-status .dot { width:7px; height:7px; border-radius:50%; background:var(--mint); box-shadow:0 0 0 3px rgba(125,242,176,.18); }
  .ord-hero-r { text-align:center; flex:0 0 auto; }
  .ord-scan { font-family:var(--mono); font-size:10px; letter-spacing:.12em; color:#cdeed9; margin-top:10px; }

  .ord-keep { padding:22px; background:var(--mint-soft); border:1px solid rgba(11,110,79,.14); border-radius:20px; }
  .ord-keep-top { display:flex; justify-content:space-between; align-items:baseline; gap:10px; }
  .ord-keep-eyebrow { font-family:var(--mono); font-size:10.5px; letter-spacing:.14em; color:var(--atlas); }
  .ord-keep-base { font-size:11.5px; color:var(--n-600); }
  .ord-keep-big { font-size:42px; color:var(--riad); margin:8px 0 4px; line-height:1; }
  .ord-keep-big .un { font-size:15px; font-family:var(--sans); color:var(--atlas); font-weight:600; margin-inline-start:6px; }
  .ord-keep-note { font-size:12.5px; color:var(--n-700); line-height:1.5; }
  .ord-bars { margin-top:16px; display:flex; flex-direction:column; gap:11px; }
  .ord-bar-row { display:grid; grid-template-columns:96px 1fr auto; gap:12px; align-items:center; }
  .ord-bar-lbl { font-size:12.5px; color:var(--ink); font-weight:500; }
  .ord-bar-lbl .r { font-family:var(--mono); font-size:11px; color:var(--n-500); margin-inline-start:4px; }
  .ord-bar { height:12px; border-radius:6px; background:#dfeee5; overflow:hidden; display:flex; }
  .ord-bar .keep { background:var(--atlas); height:100%; }
  .ord-bar .lost { background:#E06A52; height:100%; }
  .ord-bar-val { font-family:var(--mono); font-size:12px; text-align:end; min-width:62px; }
  .ord-bar-val.good { color:var(--atlas); } .ord-bar-val.bad { color:#C0492F; }

  .ord-sec { margin-top:26px; display:flex; align-items:baseline; justify-content:space-between; }
  .ord-sec-t { font-family:var(--mono); font-size:11px; letter-spacing:.12em; text-transform:uppercase; color:var(--n-500); }
  .ord-sec-h { font-size:11.5px; color:var(--n-500); }
  .ord-chs { margin-top:12px; display:grid; grid-template-columns:1fr 1fr; gap:10px; }
  .ord-ch { display:flex; align-items:center; gap:12px; background:var(--surface); border:1px solid var(--n-200); border-radius:14px; padding:13px 15px; transition:border-color .15s, box-shadow .15s; }
  .ord-ch:hover { border-color:var(--n-300); box-shadow:0 6px 18px -12px rgba(10,15,13,.25); }
  .ord-ch-ic { width:38px; height:38px; border-radius:11px; flex:0 0 auto; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:13px; }
  .ord-ch-b { flex:1; min-width:0; } .ord-ch-n { font-size:13.5px; font-weight:600; } .ord-ch-s { font-size:11.5px; color:var(--n-500); margin-top:1px; }
  .ord-pill { font-size:10.5px; font-family:var(--mono); padding:3px 9px; border-radius:999px; background:var(--mint-soft); color:#075238; white-space:nowrap; }
  .ord-connect { font-size:12px; font-weight:600; color:var(--atlas); background:var(--mint-soft); border:0; border-radius:9px; padding:7px 13px; cursor:pointer; transition:background .15s; white-space:nowrap; }
  .ord-connect:hover { background:#c8ecd6; }

  .ord-feed { margin-top:12px; border:1px solid var(--n-200); border-radius:16px; overflow:hidden; background:var(--surface); }
  .ord-o { display:grid; grid-template-columns:auto 1fr auto auto; gap:14px; align-items:center; padding:13px 16px; cursor:pointer; transition: background-color 180ms cubic-bezier(0.32,0.72,0,1); }
  .ord-o:active { background:var(--paper-muted, var(--paper-soft)); }
  .ord-o + .ord-o { border-top:1px solid var(--n-200); }
  .ord-o:hover { background:var(--paper-soft); }
  .ord-o-ch { font-size:10px; font-family:var(--mono); letter-spacing:.04em; padding:4px 9px; border-radius:7px; white-space:nowrap; }
  .ord-o-ch.kiwi { background:var(--mint-soft); color:#075238; } .ord-o-ch.glovo { background:#FFE9D6; color:#B5651D; } .ord-o-ch.yassir { background:#E6F0FF; color:#2B5AA8; }
  .ord-o-m { min-width:0; } .ord-o-who { font-size:13px; font-weight:500; } .ord-o-it { font-size:11.5px; color:var(--n-500); margin-top:1px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .ord-o-amt { font-family:var(--mono); font-size:13px; font-weight:500; }
  .ord-o-st { font-size:10.5px; font-family:var(--mono); padding:3px 8px; border-radius:6px; white-space:nowrap; }
  .ord-o-st.new { background:var(--atlas); color:#fff; } .ord-o-st.prep { background:#FFF2D6; color:#8A6210; } .ord-o-st.ready { background:var(--mint-soft); color:#075238; }

  .ord-foot { display:flex; justify-content:flex-end; gap:10px; margin-top:24px; }

  html[data-theme="dark"] .ord-ch, html[data-theme="dark"] .ord-feed { background:#131916; border-color:#26302b; }
  /* mint-soft chips carry hardcoded dark-green text — brighten to mint on dark so they stay legible */
  html[data-theme="dark"] .ord-pill, html[data-theme="dark"] .ord-o-ch.kiwi, html[data-theme="dark"] .ord-o-st.ready, html[data-theme="dark"] .ord-bar-val.good, html[data-theme="dark"] .ord-connect { color:var(--mint); }
  html[data-theme="dark"] .ord-connect { background:rgba(125,242,176,.12); }
  html[data-theme="dark"] .ord-ch:hover { border-color:#34403a; }
  html[data-theme="dark"] .ord-o:hover { background:#0f1714; }
  html[data-theme="dark"] .ord-keep { background:rgba(125,242,176,.07); border-color:rgba(125,242,176,.16); }
  html[data-theme="dark"] .ord-keep-big { color:var(--paper); } html[data-theme="dark"] .ord-keep-note { color:#b8c2bc; }
  html[data-theme="dark"] .ord-bar { background:#26302b; }
  @media (max-width:880px){ .ord-grid{grid-template-columns:1fr;} .ord-chs{grid-template-columns:1fr;} .ord-hero{flex-direction:column; text-align:center;} .ord-hero-l{text-align:center;} }
  `;
  const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);

  const ordReal = () => {
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
  const ordBiz = () => {
    try {
      // Store before account: ordSlug() feeds the customer-facing link, and one
      // account can run several stores that must not share it.
      if (window.KiwiVenue?.isCustom?.()) { const vd = window.KiwiVenue.getCurrentVenueData?.(); if (vd && (vd.fullDisplay || vd.name)) return vd.fullDisplay || vd.name; }
      const b = (window.KiwiMe && window.KiwiMe.business || '').trim();
      if (b) return b;
    } catch (_) {}
    return ordReal() ? 'Votre établissement' : 'Café Atlas · Maarif';
  };
  const ordSlug = () => String(ordBiz()).split('·')[0].normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'boutique';

  window.Kiwi.handlers['growth-ordering'] = () => {
    const T = STR[lang()] || STR.fr;
    const items = (window.KiwiVenue?.getMenuItems?.() || []).filter(i => i.price > 0);
    const pick = (i) => (items[i % items.length] || {}).name || (T.st ? '' : '');
    const KIT = window.KiwiKit;
    const real = ordReal();
    const base = real ? null : BASE;

    const bar = (rate, label) => {
      const keepPct = base == null ? 0 : (1 - rate) * 100;
      const lostPct = base == null ? 0 : rate * 100;
      const lostMad = base == null ? null : Math.round(base * rate);
      return `<div class="ord-bar-row">
        <div class="ord-bar-lbl">${label}<span class="r">${rate === 0 ? '0 %' : '−' + Math.round(rate * 100) + ' %'}</span></div>
        <div class="ord-bar"><span class="keep" style="width:${keepPct}%"></span>${lostPct ? `<span class="lost" style="width:${lostPct}%"></span>` : ''}</div>
        <div class="ord-bar-val ${rate === 0 ? 'good' : 'bad'}">${base == null ? '—' : rate === 0 ? fmt(base) + ' net' : '−' + fmt(lostMad)}</div>
      </div>`;
    };

    // No demo orders / demo customer names for a real merchant — their live feed
    // starts empty and fills from real online orders.
    const orders = real ? [] : [
      { ch: 'kiwi', who: 'Nawal K.', it: [0, 8], amt: 176, st: 'new' },
      { ch: 'glovo', who: 'Karim B.', it: [6], amt: 95, st: 'prep' },
      { ch: 'kiwi', who: 'Salma F.', it: [2, 9], amt: 142, st: 'prep' },
      { ch: 'yassir', who: 'Mehdi C.', it: [6, 8], amt: 88, st: 'ready' },
      { ch: 'kiwi', who: 'Imane S.', it: [2], amt: 50, st: 'ready' },
      { ch: 'kiwi', who: 'Youssef A.', it: [0], amt: 180, st: 'ready' },
    ];
    const chColor = { kiwi: 'background:var(--riad);color:var(--mint)', glovo: 'background:#FFE9D6;color:#B5651D', yassir: 'background:#E6F0FF;color:#2B5AA8', cc: 'background:var(--paper-soft);color:var(--n-600)', liv: 'background:var(--paper-soft);color:var(--n-600)' };
    const chState = (s) => (real ? 'connect' : s) === 'connect' ? `<button class="ord-connect" data-ord-connect>${T.connect}</button>`
      : `<span class="ord-pill">${s === 'on' ? T.on : T.linked}</span><button class="gk-tg on" data-ord-tg></button>`;

    const body = `<div class="gk-reveal-root">
      <div class="ord-grid">
        <div class="gk-hero ord-hero">
          <div class="ord-hero-l">
            <div class="ord-eyebrow">${T.eyebrow}</div>
            <div class="ord-name gk-serif">${ordBiz()}</div>
            <div class="ord-tag">${T.tagline}</div>
            <div class="ord-link"><span class="u">kiwi.shop/${ordSlug()}</span><button class="cp" data-ord-copy>${T.copy}</button></div>
            <div class="ord-statusrow"><span class="ord-status"><span class="dot"></span>${real ? (lang() === 'en' ? 'Not configured' : lang() === 'ar' ? 'غير مُعدّ' : 'Non configuré') : T.online}</span><button class="gk-tg${real ? '' : ' on'}" data-ord-tg></button></div>
          </div>
          <div class="ord-hero-r">${KIT ? KIT.qr(116) : ''}<div class="ord-scan">${T.scan}</div></div>
        </div>

        <div class="ord-keep">
          <div class="ord-keep-top"><span class="ord-keep-eyebrow">${T.keepEyebrow}</span><span class="ord-keep-base">${real ? (lang() === 'en' ? 'Online revenue not provided' : lang() === 'ar' ? 'لم يتم إدخال المداخيل عبر الإنترنت' : 'CA en ligne non renseigné') : T.onBase(BASE)}</span></div>
          <div class="ord-keep-big gk-serif">${real ? '—' : '+' + fmt(BASE * 0.30)}<span class="un">${real ? '' : T.keepUnit}</span></div>
          <div class="ord-keep-note">${real ? (lang() === 'en' ? 'No source currently identifies this merchant’s online revenue.' : lang() === 'ar' ? 'لا يوجد مصدر يحدّد حالياً مداخيل هذا التاجر عبر الإنترنت.' : 'Aucune source ne distingue encore le chiffre d’affaires en ligne de ce commerçant.') : T.keepNote()}</div>
          <div class="ord-bars">${bar(0, 'Kiwi Direct')}${bar(0.30, 'Glovo')}${bar(0.28, 'Yassir Express')}</div>
        </div>
      </div>

      <div class="ord-sec"><span class="ord-sec-t">${T.channels}</span><span class="ord-sec-h">${T.channelsHint}</span></div>
      <div class="ord-chs">${CH.map(c => `<div class="ord-ch" data-ord-ch="${c.id}">
        <div class="ord-ch-ic" style="${chColor[c.id]}">${c.label[0]}</div>
        <div class="ord-ch-b"><div class="ord-ch-n">${c.label}</div><div class="ord-ch-s">${c.sub[lang()] || c.sub.fr}</div></div>
        ${chState(c.state)}</div>`).join('')}</div>

      <div class="ord-sec"><span class="ord-sec-t">${T.inbox}</span><span class="ord-sec-h">${real
        ? (lang() === 'en' ? 'Data source not connected' : lang() === 'ar' ? 'مصدر البيانات غير متصل' : 'Source de données non connectée')
        : T.inboxHint(orders.length)}</span></div>
      <div class="ord-feed">${orders.map(o => `<div class="ord-o" data-ord-order>
        <div class="ord-o-ch ${o.ch}">${o.ch === 'kiwi' ? 'Kiwi' : o.ch === 'glovo' ? 'Glovo' : 'Yassir'}</div>
        <div class="ord-o-m"><div class="ord-o-who">${o.who}</div><div class="ord-o-it">${o.it.map(pick).join(' · ')}</div></div>
        <div class="ord-o-amt">${fmt(o.amt)} MAD</div>
        <div class="ord-o-st ${o.st}">${T.st[o.st]}</div></div>`).join('')}</div>

      <div class="ord-foot"><button class="kb ghost" data-dismiss>${T.close}</button><button class="kb atlas" data-ord-cta>${T.cta}</button></div>
    </div>`;

    const d = drawer({ title: T.title, subtitle: T.sub, fullpage: true, body });
    if (KIT) KIT.reveal(d.el.querySelector('.gk-reveal-root'));
    d.el.addEventListener('click', (e) => {
      const cp = e.target.closest('[data-ord-copy]');
      const cn = e.target.closest('[data-ord-connect]');
      if (cp) { cp.textContent = T.copied; toast(T.copied, { type: 'success' }); }
      else if (e.target.closest('[data-ord-tg]')) { e.target.closest('[data-ord-tg]').classList.toggle('on'); }
      /* Ce bouton remplaçait son propre libellé par « Connecté » et affichait un
         toast de succès. Rien d'autre. Le commerçant repartait convaincu que
         Glovo écrivait dans sa caisse, et rien ne viendrait jamais le
         détromper. Il ouvre maintenant le connecteur réel ; l'état ne bascule
         que si le serveur a bien créé la clé. */
      else if (cn) {
        const id = cn.closest('[data-ord-ch]') ? cn.closest('[data-ord-ch]').getAttribute('data-ord-ch') : 'generic';
        const row = cn.closest('.ord-ch');
        const name = row ? ((row.querySelector('.ord-ch-n') || {}).textContent || '') : '';
        if (!window.KiwiChannels) { toast(T.connect, { type: 'info' }); return; }
        cn.disabled = true;
        window.KiwiChannels.connect(id, (name || '').trim()).then((okd) => {
          cn.disabled = false;
          // « En attente » et non « Connecté » : la clé existe, le prestataire
          // n'a encore rien envoyé. La pastille verte se mérite.
          if (okd) cn.textContent = T.waiting;
        });
      }
      else if (e.target.closest('[data-ord-order]')) { toast(T.sent, { type: 'info' }); }
      else if (e.target.closest('[data-ord-cta]')) {
        if (real) toast(T.toastT, { type: 'info', desc: lang() === 'en' ? 'Activation status is not connected to a server source.' : lang() === 'ar' ? 'حالة التفعيل غير مرتبطة بمصدر على الخادم.' : 'L’état d’activation n’est relié à aucune source serveur.' });
        else { confetti && confetti(); toast(T.toastT, { type: 'success', desc: T.toastD.replace('cafe-atlas', ordSlug()) }); }
      }
    });
  };
})();
