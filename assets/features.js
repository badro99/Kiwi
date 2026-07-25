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
  const trLang = () => (window.KiwiI18n?.getLang?.() || 'fr');

  /* ─── Injected styles for feature-specific UI ─── */
  const CSS = `
  /* Payment link */
  .pl-preview { background: var(--paper-soft); border-radius: 14px; padding: 20px; text-align: center; border: 1px solid var(--n-200); }
  .pl-qr { width: 120px; height: 120px; background: var(--ink); padding: 8px; border-radius: 10px; margin: 0 auto; background-image: repeating-linear-gradient(0deg, var(--ink) 0 6px, transparent 6px 12px), repeating-linear-gradient(90deg, var(--ink) 0 6px, transparent 6px 12px); }
  .pl-link { font-family: var(--mono); font-size: 13px; background: var(--surface); border: 1px solid var(--n-200); border-radius: 10px; padding: 10px 14px; margin-top: 14px; display: flex; align-items: center; gap: 10px; }
  .pl-link .copy { margin-left: auto; color: var(--atlas); font-weight: 500; cursor: pointer; font-size: 12.5px; }
  .pl-share { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-top: 12px; }
  .pl-share button { padding: 12px 10px; background: var(--surface); border: 1px solid var(--n-200); border-radius: 10px; font-size: 12.5px; display: flex; flex-direction: column; align-items: center; gap: 6px; color: var(--ink); cursor: pointer; transition: border-color 150ms; }
  .pl-share button:hover { border-color: var(--atlas); }
  html[data-theme="dark"] .pl-link, html[data-theme="dark"] .pl-share button { background: var(--paper-soft); border-color: var(--n-200); }

  /* Zakat */
  .zk-hero { background: linear-gradient(135deg, var(--atlas), var(--riad-deep)); color: var(--paper); padding: 22px; border-radius: 14px; margin-bottom: 18px; }
  .zk-hero .big { font-size: 40px; font-weight: 600; letter-spacing: -0.035em; margin-top: 8px; font-feature-settings: "tnum" 1; }
  .zk-hero .sub { color: #c6ead4; font-size: 13px; margin-top: 8px; line-height: 1.45; }
  .zk-field { display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px solid var(--n-200); font-size: 14px; }
  .zk-field .l { color: var(--n-600); }
  .zk-field input { width: 140px; text-align: end; background: transparent; border: 0; outline: 0; font-family: var(--mono); font-size: 14px; color: var(--ink); font-weight: 500; border-bottom: 1px dashed var(--n-300); padding: 4px 6px; }
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
  .dx-row .info .amount .u { font-size: 13px; color: var(--n-500); margin-inline-start: 4px; font-weight: 500; }
  .dx-row input { flex: 1; background: transparent; border: 0; outline: 0; font-size: 26px; font-weight: 600; letter-spacing: -0.025em; font-feature-settings: "tnum" 1; color: var(--ink); text-align: end; font-family: var(--sans); max-width: 180px; }
  .dx-cmp { margin: 14px 0; padding: 14px 16px; background: var(--mint-soft); border-radius: 12px; font-size: 13px; display: flex; gap: 10px; align-items: flex-start; color: var(--riad); }
  html[data-theme="dark"] .dx-cmp { background: rgba(125,242,176,0.1); color: var(--mint); }
  .dx-methods { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-top: 14px; }
  .dx-method { padding: 14px 10px; border: 1px solid var(--n-200); border-radius: 12px; text-align: center; cursor: pointer; font-size: 12px; transition: transform 150ms, opacity 150ms, background-color 150ms, border-color 150ms, color 150ms, box-shadow 150ms; }
  .dx-method:hover, .dx-method.selected { border-color: var(--atlas); background: var(--mint-soft); }
  .dx-method strong { display: block; margin: 6px 0 3px; font-size: 13px; }
  .dx-method .time { color: var(--atlas); font-weight: 500; font-size: 11.5px; }

  /* Ramadan mode banner */
  .ramadan-banner { position: fixed; top: 0; left: 0; right: 0; z-index: var(--z-overlay, 600); background: linear-gradient(90deg, #7C4A1E, #D99A2B, #7C4A1E); color: #FFF4DD; padding: 10px 24px; display: flex; align-items: center; justify-content: space-between; font-size: 13px; animation: rb-glow 4s ease-in-out infinite; }
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
  .agent-action { border: 1px solid var(--n-200); border-radius: 12px; padding: 16px; margin-bottom: 10px; display: flex; gap: 12px; align-items: flex-start; background: var(--surface); }
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

  const PL_STR = {
    fr: {
      tag: 'LIENS DE PAIEMENT',
      title: 'Créer un lien Kiwi',
      desc: 'Pour paiements à distance, WhatsApp, email, SMS. Zéro terminal requis.',
      amountLabel: 'Montant (MAD)',
      amountPlaceholder: 'Ex. 250,00',
      amountHelp: 'Laissez vide pour permettre au client de choisir.',
      descLabel: 'Description',
      descPlaceholder: 'Ce pour quoi le client paie',
      expiryLabel: 'Expire dans',
      expiry24h: '24 heures',
      expiry7d: '7 jours',
      expiry30d: '30 jours',
      expiryNone: 'Jamais',
      methodsLabel: 'Méthodes',
      methodsAll: 'Carte + Wallet + QR',
      methodsCard: 'Carte uniquement',
      methodsWallet: 'Kiwi Wallet uniquement',
      info: "Payment Links inclus dans l'abonnement Kiwi · règlement T+1 automatique.",
      cancel: 'Annuler',
      generate: 'Générer le lien →',
      scanOrShare: 'Scannez ou partagez le lien',
      copy: 'Copier',
      amountResult: 'Montant',
      amountFree: 'Libre',
      descResult: 'Description',
      expiryResult: 'Expire',
      expiryValueNone: 'Jamais',
      expiryValue24h: 'Dans 24 heures',
      expiryValueDays: (d) => `Dans ${d} jours`,
      shareWA: 'WhatsApp',
      shareEmail: 'Email',
      shareSMS: 'SMS',
      close: 'Fermer',
      newLink: 'Nouveau lien',
      toastDesc: 'Ajoutez une description',
      toastCopied: 'Lien copié',
      toastWA: 'WhatsApp ouvert · prêt à partager',
      toastEmail: 'Email prêt · client@example.com',
      toastSMS: 'SMS envoyé',
    },
    en: {
      tag: 'PAYMENT LINKS',
      title: 'Create a Kiwi Link',
      desc: 'For remote payments, WhatsApp, email, SMS. No terminal required.',
      amountLabel: 'Amount (MAD)',
      amountPlaceholder: 'E.g. 250.00',
      amountHelp: 'Leave empty to let the customer choose.',
      descLabel: 'Description',
      descPlaceholder: 'What the customer is paying for',
      expiryLabel: 'Expires in',
      expiry24h: '24 hours',
      expiry7d: '7 days',
      expiry30d: '30 days',
      expiryNone: 'Never',
      methodsLabel: 'Methods',
      methodsAll: 'Card + Wallet + QR',
      methodsCard: 'Card only',
      methodsWallet: 'Kiwi Wallet only',
      info: 'Payment Links included in your Kiwi subscription · automatic T+1 settlement.',
      cancel: 'Cancel',
      generate: 'Generate Link →',
      scanOrShare: 'Scan or share the link',
      copy: 'Copy',
      amountResult: 'Amount',
      amountFree: 'Open',
      descResult: 'Description',
      expiryResult: 'Expires',
      expiryValueNone: 'Never',
      expiryValue24h: 'In 24 hours',
      expiryValueDays: (d) => `In ${d} days`,
      shareWA: 'WhatsApp',
      shareEmail: 'Email',
      shareSMS: 'SMS',
      close: 'Close',
      newLink: 'New Link',
      toastDesc: 'Please add a description',
      toastCopied: 'Link copied',
      toastWA: 'WhatsApp opened · ready to share',
      toastEmail: 'Email ready · customer@example.com',
      toastSMS: 'SMS sent',
    },
    ar: {
      tag: 'روابط الدفع',
      title: 'إنشاء رابط كيوي',
      desc: 'للمدفوعات عن بعد، واتساب، إيميل، رسائل نصية. لا يتطلب جهاز دفع.',
      amountLabel: 'المبلغ (درهم)',
      amountPlaceholder: 'مثال: 250,00',
      amountHelp: 'اتركه فارغًا للسماح للعميل بالاختيار.',
      descLabel: 'الوصف',
      descPlaceholder: 'ما الذي يدفعه العميل مقابله',
      expiryLabel: 'ينتهي في',
      expiry24h: '24 ساعة',
      expiry7d: '7 أيام',
      expiry30d: '30 يومًا',
      expiryNone: 'أبدًا',
      methodsLabel: 'طرق الدفع',
      methodsAll: 'بطاقة + محفظة + QR',
      methodsCard: 'البطاقة فقط',
      methodsWallet: 'محفظة كيوي فقط',
      info: 'روابط الدفع مشمولة في اشتراك كيوي · تسوية آلية في اليوم الموالي.',
      cancel: 'إلغاء',
      generate: 'إنشاء الرابط →',
      scanOrShare: 'امسح أو شارك الرابط',
      copy: 'نسخ',
      amountResult: 'المبلغ',
      amountFree: 'مفتوح',
      descResult: 'الوصف',
      expiryResult: 'ينتهي',
      expiryValueNone: 'أبدًا',
      expiryValue24h: 'في 24 ساعة',
      expiryValueDays: (d) => `في ${d} أيام`,
      shareWA: 'واتساب',
      shareEmail: 'الإيميل',
      shareSMS: 'SMS',
      close: 'إغلاق',
      newLink: 'رابط جديد',
      toastDesc: 'المرجو إضافة وصف',
      toastCopied: 'تم نسخ الرابط',
      toastWA: 'تم فتح واتساب · جاهز للمشاركة',
      toastEmail: 'الإيميل جاهز · client@example.com',
      toastSMS: 'تم إرسال SMS',
    }
  };

  const ZK_STR = {
    fr: {
      tag: 'FINANCE ISLAMIQUE · زكاة',
      title: 'Calculateur Zakat 2026',
      desc: (nisab) => `Nisab silver actuel : ${nisab} MAD. Taux Zakat : 2,5 % sur les avoirs qualifiés.`,
      zakatDue: 'ZAKAT DUE · 1447 AH',
      qualifiedAssets: (total) => `Avoirs qualifiés : ${total} MAD (au-dessus du nisab).`,
      belowNisab: 'Avoirs sous le nisab · aucune zakat due cette année.',
      liquidity: 'LIQUIDITÉS',
      cashHome: 'Espèces à la maison',
      bankBalances: 'Soldes bancaires',
      preciousMetals: 'MÉTAUX PRÉCIEUX',
      gold: 'Or (grammes)',
      silver: 'Argent (grammes)',
      tradeAndDebts: 'COMMERCE & DETTES',
      inventory: 'Stock marchand',
      receivables: 'Créances',
      debts: 'Dettes (à déduire)',
      taxableTotal: 'Total taxable',
      recipient: 'BÉNÉFICIAIRE (CNDH-AGRÉÉ)',
      caritasName: 'Caritas Maroc',
      caritasDesc: 'Aide aux familles démunies · 8 régions',
      baytiName: 'Association Bayti',
      baytiDesc: 'Enfants en situation de rue · Casablanca',
      fondaName: 'Fondation Mohammed V',
      fondaDesc: 'Solidarité nationale · présente partout',
      otherRecipient: 'Autre bénéficiaire',
      otherRecipientDesc: "Saisir le RIB / ICE d'une association",
      close: 'Fermer',
      payZakat: 'Verser la Zakat →',
      payoutSoon: 'Le versement direct depuis Kiwi n’est pas encore ouvert. Ce calcul est le vôtre : versez votre Zakat par votre canal habituel, et gardez ce montant comme référence.',
      chooseRecipient: 'Choisissez un bénéficiaire',
      zakatPaid: 'Zakat versée · reçu envoyé par WhatsApp',
      zakatAccepted: 'Que Dieu accepte votre aumône.',
    },
    en: {
      tag: 'ISLAMIC FINANCE · Zakat',
      title: 'Zakat Calculator 2026',
      desc: (nisab) => `Current silver nisab: ${nisab} MAD. Zakat rate: 2.5% on qualifying assets.`,
      zakatDue: 'ZAKAT DUE · 1447 AH',
      qualifiedAssets: (total) => `Qualifying assets: ${total} MAD (above nisab).`,
      belowNisab: 'Assets below nisab · no Zakat due this year.',
      liquidity: 'LIQUIDITY',
      cashHome: 'Cash at home',
      bankBalances: 'Bank balances',
      preciousMetals: 'PRECIOUS METALS',
      gold: 'Gold (grams)',
      silver: 'Silver (grams)',
      tradeAndDebts: 'TRADE & DEBTS',
      inventory: 'Inventory stock',
      receivables: 'Receivables',
      debts: 'Debts (to deduct)',
      taxableTotal: 'Taxable total',
      recipient: 'RECIPIENT (CNDH-ACCREDITED)',
      caritasName: 'Caritas Maroc',
      caritasDesc: 'Help for underprivileged families · 8 regions',
      baytiName: 'Bayti Association',
      baytiDesc: 'Children in street situations · Casablanca',
      fondaName: 'Mohammed V Foundation',
      fondaDesc: 'National solidarity · present everywhere',
      otherRecipient: 'Other recipient',
      otherRecipientDesc: 'Enter the IBAN / ICE of an association',
      close: 'Close',
      payZakat: 'Pay Zakat →',
      payoutSoon: 'Paying directly from Kiwi isn\'t open yet. This calculation is yours to keep: pay your Zakat through your usual channel and use this amount as the reference.',
      chooseRecipient: 'Choose a recipient',
      zakatPaid: 'Zakat paid · receipt sent via WhatsApp',
      zakatAccepted: 'May God accept your charity.',
    },
    ar: {
      tag: 'التمويل الإسلامي · زكاة',
      title: 'حاسبة الزكاة 2026',
      desc: (nisab) => `نصاب الفضة الحالي: ${nisab} درهم. نسبة الزكاة: 2.5% على الأصول المستوفية للشروط.`,
      zakatDue: 'الزكاة المستحقة · 1447 هـ',
      qualifiedAssets: (total) => `الأصول الخاضعة للزكاة: ${total} درهم (فوق النصاب).`,
      belowNisab: 'الأصول تحت النصاب · لا زكاة مستحقة هذا العام.',
      liquidity: 'السيولة',
      cashHome: 'النقد في المنزل',
      bankBalances: 'الأرصدة البنكية',
      preciousMetals: 'المعادن الثمينة',
      gold: 'الذهب (جرام)',
      silver: 'الفضة (جرام)',
      tradeAndDebts: 'التجارة والديون',
      inventory: 'مخزون البضائع',
      receivables: 'الديون المستحقة لك',
      debts: 'الديون (للطرح)',
      taxableTotal: 'المجموع الخاضع للزكاة',
      recipient: 'المستفيد (معتمد من CNDH)',
      caritasName: 'Caritas Maroc',
      caritasDesc: 'مساعدة الأسر المعوزة · 8 جهات',
      baytiName: 'جمعية بيتي',
      baytiDesc: 'أطفال في وضعية الشارع · الدار البيضاء',
      fondaName: 'مؤسسة محمد الخامس للتضامن',
      fondaDesc: 'التضامن الوطني · حاضرة في كل مكان',
      otherRecipient: 'مستفيد آخر',
      otherRecipientDesc: 'أدخل RIB / ICE لجمعية',
      close: 'إغلاق',
      payZakat: 'أداء الزكاة →',
      payoutSoon: 'الأداء المباشر من Kiwi غير متاح بعد. هذا الحساب لك: أدِّ زكاتك عبر قناتك المعتادة واعتمد هذا المبلغ مرجعًا.',
      chooseRecipient: 'اختر مستفيدًا',
      zakatPaid: 'تم أداء الزكاة · تم إرسال الإيصال عبر واتساب',
      zakatAccepted: 'تقبل الله منكم.',
    },
  };

  /* ═══════════════════ PAYMENT LINK ═══════════════════ */
  handlers['payment-link'] = () => {
    let step = 'form';
    /* The generated link is `kiwi.ma/p/<random>`, which nothing serves, the
     * "QR" is a CSS stripe pattern rather than a real code, and the WhatsApp /
     * email / SMS share buttons only raise a toast. This control sits in the
     * dashboard header for EVERY merchant, so a real client would send a paying
     * customer a URL that 404s. Honest "coming soon" until there is a rail
     * behind it; the pitch demo keeps the full flow. */
    if (window.KiwiEnv && window.KiwiEnv.isReal && window.KiwiEnv.isReal()) {
      const _T = PL_STR[trLang()] || PL_STR.fr;
      const c = ({
        fr: { h: 'Les liens de paiement arrivent bientôt', p: 'Encaisser à distance par lien WhatsApp, email ou SMS sera disponible ici. Nous vous préviendrons dès l’ouverture — en attendant, encaissez sur la caisse.' },
        en: { h: 'Payment links are coming soon', p: 'Getting paid remotely over WhatsApp, email or SMS will live here. We\'ll let you know the moment it opens — until then, take payment on the till.' },
        ar: { h: 'روابط الدفع قريبًا', p: 'سيتوفّر هنا التحصيل عن بُعد عبر واتساب أو البريد أو الرسائل. سنخبرك فور فتحه — وحتى ذلك الحين، حصّل عبر الصندوق.' },
      })[trLang()] || { h: 'Payment links are coming soon', p: '' };
      modal({
        tag: _T.tag, title: _T.title, width: 480,
        body: `<div style="padding:32px 12px;text-align:center;">
          <div style="font-size:15.5px;font-weight:640;letter-spacing:-.01em;">${c.h}</div>
          <div style="font-size:12.5px;color:var(--n-500);margin-top:8px;line-height:1.55;max-width:380px;margin-inline:auto;">${c.p}</div>
        </div>`,
      });
      return;
    }
    // Name the STORE the customer is paying, not the account behind it.
    let _plBiz = '';
    try { const _plVd = window.KiwiVenue?.isCustom?.() && window.KiwiVenue.getCurrentVenueData?.(); if (_plVd) _plBiz = String(_plVd.name || '').trim(); } catch (_) {}
    if (!_plBiz) _plBiz = (window.KiwiMe && window.KiwiMe.business || '').trim();
    let data = { amount: '', desc: _plBiz ? `Commande ${_plBiz}` : (window.KiwiEnv?.isReal?.() ? 'Nouvelle commande' : 'Commande Café Atlas'), expiry: '7j', method: 'all' };
    const T = PL_STR[trLang()] || PL_STR.fr;

    const m = modal({
      tag: T.tag,
      title: T.title,
      desc: T.desc,
      width: 520,
      body: form()
    });
    function form() {
      return `
        <div class="kf-group">
          <label class="kf-label">${T.amountLabel}</label>
          <input class="kf-input" placeholder="${T.amountPlaceholder}" data-f="amount" value="${data.amount}" style="font-size:18px; font-family: var(--mono); font-weight:500;" />
          <div class="kf-help">${T.amountHelp}</div>
        </div>
        <div class="kf-group">
          <label class="kf-label">${T.descLabel}</label>
          <input class="kf-input" placeholder="${T.descPlaceholder}" data-f="desc" value="${data.desc}" />
        </div>
        <div class="kf-row">
          <div class="kf-group">
            <label class="kf-label">${T.expiryLabel}</label>
            <select class="kf-input" data-f="expiry">
              <option value="24h" ${data.expiry==='24h'?'selected':''}>${T.expiry24h}</option>
              <option value="7j" ${data.expiry==='7j'?'selected':''}>${T.expiry7d}</option>
              <option value="30j" ${data.expiry==='30j'?'selected':''}>${T.expiry30d}</option>
              <option value="none" ${data.expiry==='none'?'selected':''}>${T.expiryNone}</option>
            </select>
          </div>
          <div class="kf-group">
            <label class="kf-label">${T.methodsLabel}</label>
            <select class="kf-input" data-f="method">
              <option value="all">${T.methodsAll}</option>
              <option value="card">${T.methodsCard}</option>
              <option value="wallet">${T.methodsWallet}</option>
            </select>
          </div>
        </div>
        <div style="margin-top:6px; padding:12px 14px; background: var(--paper-soft); border-radius: 10px; font-size: 12.5px; color: var(--n-600); display:flex; gap:10px;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--atlas)" stroke-width="2" style="flex-shrink:0;"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
          ${T.info}
        </div>
        <div style="display:flex; justify-content: flex-end; gap: 10px; margin-top: 20px;">
          <button class="kb ghost" data-close>${T.cancel}</button>
          <button class="kb atlas" data-gen>${T.generate}</button>
        </div>
      `;
    }
    function result() {
      const slug = Math.random().toString(36).slice(2, 9);
      const link = `kiwi.ma/p/${slug}`;
      let expiryText;
      switch(data.expiry) {
        case 'none': expiryText = T.expiryValueNone; break;
        case '24h': expiryText = T.expiryValue24h; break;
        case '7j': expiryText = T.expiryValueDays(7); break;
        case '30j': expiryText = T.expiryValueDays(30); break;
        default: expiryText = T.expiryValueDays(data.expiry.replace('j',''));
      }

      return `
        <div class="pl-preview">
          <div class="pl-qr"></div>
          <div style="margin-top: 14px; font-size: 13px; color: var(--n-500);">${T.scanOrShare}</div>
          <div class="pl-link"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--atlas)" stroke-width="2"><path d="M10 14a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71M14 10a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>${link}<span class="copy" data-copy="${link}">${T.copy}</span></div>
        </div>
        <div style="margin-top: 14px; padding: 14px; background: var(--paper-soft); border-radius: 10px; font-size: 13px;">
          <div style="display:flex; justify-content:space-between; padding: 3px 0;"><span style="color:var(--n-500);">${T.amountResult}</span><b>${data.amount||T.amountFree} ${data.amount?'MAD':''}</b></div>
          <div style="display:flex; justify-content:space-between; padding: 3px 0;"><span style="color:var(--n-500);">${T.descResult}</span><b>${data.desc}</b></div>
          <div style="display:flex; justify-content:space-between; padding: 3px 0;"><span style="color:var(--n-500);">${T.expiryResult}</span><b>${expiryText}</b></div>
        </div>
        <div class="pl-share">
          <button data-share="whatsapp"><svg width="18" height="18" viewBox="0 0 24 24" fill="#25D366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>${T.shareWA}</button>
          <button data-share="email"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 6l-10 7L2 6"/></svg>${T.shareEmail}</button>
          <button data-share="sms"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/></svg>${T.shareSMS}</button>
        </div>
        <div style="margin-top: 16px; display:flex; justify-content: space-between;">
          <button class="kb ghost" data-close>${T.close}</button>
          <button class="kb atlas" data-new>${T.newLink}</button>
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
        if (!data.desc) { toast(T.toastDesc, {type: 'warn'}); return; }
        step = 'result';
        m.el.querySelector('.kiwi-modal-body').innerHTML = result();
        confetti();
      }
      if (e.target.closest('[data-new]')) {
        step = 'form';
        m.el.querySelector('.kiwi-modal-body').innerHTML = form();
      }
      const copy = e.target.closest('[data-copy]');
      if (copy) { navigator.clipboard?.writeText('https://' + copy.dataset.copy); toast(T.toastCopied, {type: 'success', desc: copy.dataset.copy}); }
      const share = e.target.closest('[data-share]');
      if (share) {
        const ch = share.dataset.share;
        toast(ch === 'whatsapp' ? T.toastWA : ch === 'email' ? T.toastEmail : T.toastSMS, {type: 'success'});
      }
    });
  };

  /* ═══════════════════ ZAKAT CALCULATOR ═══════════════════ */
  handlers['zakat'] = () => {
    const nisab = 7438; // MAD (silver nisab as of 2026)
    let v = { cash: 0, bank: 0, gold: 0, silver: 0, inventory: 0, receivables: 0, debts: 0 };
    let recipient = null;
    const T = ZK_STR[trLang()] || ZK_STR.fr;
    /* The CALCULATION is real and useful — it fabricates nothing. The payout is
     * not: choosing "Fondation Mohammed V" / "Bayti" / "AMC" and confirming ends
     * in "Zakat versée · reçu envoyé par WhatsApp" with no payment rail behind
     * it, so a merchant could believe a religious obligation was discharged when
     * no money moved. For a real merchant, keep the calculator and replace the
     * recipient picker + payout button with an honest note. Demo unchanged. */
    let zkReal = false;
    try { zkReal = !!(window.KiwiEnv && window.KiwiEnv.isReal && window.KiwiEnv.isReal()); } catch (_) {}

    const m = modal({
      tag: T.tag,
      title: T.title,
      desc: T.desc(nisab.toLocaleString('fr-FR')),
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
      const lang = trLang();
      const numLocale = lang === 'ar' ? 'ar-MA' : 'fr-FR';

      return `
        <div class="zk-hero">
          <div style="font-size:11px; letter-spacing:0.1em; color: #c6ead4; font-family: var(--mono);">${T.zakatDue}</div>
          <div class="big">${due.toLocaleString(numLocale, {maximumFractionDigits: 2})} <span style="font-size:16px; opacity:0.7;">MAD</span></div>
          <div class="sub">${tot >= nisab ? T.qualifiedAssets(tot.toLocaleString(numLocale,{maximumFractionDigits:0})) : T.belowNisab}</div>
        </div>
        <div style="margin-bottom:8px;">
          <div style="font-size:11px; letter-spacing:0.1em; text-transform:uppercase; color:var(--n-500); font-family:var(--mono); margin-bottom:6px;">${T.liquidity}</div>
          <div class="zk-field"><span class="l">${T.cashHome}</span><span><input type="number" data-f="cash" value="${v.cash||''}" placeholder="0" /> MAD</span></div>
          <div class="zk-field"><span class="l">${T.bankBalances}</span><span><input type="number" data-f="bank" value="${v.bank||''}" placeholder="0" /> MAD</span></div>
        </div>
        <div style="margin-top:16px;">
          <div style="font-size:11px; letter-spacing:0.1em; text-transform:uppercase; color:var(--n-500); font-family:var(--mono); margin-bottom:6px;">${T.preciousMetals}</div>
          <div class="zk-field"><span class="l">${T.gold}</span><span><input type="number" data-f="gold" value="${v.gold||''}" placeholder="0" /> g</span></div>
          <div class="zk-field"><span class="l">${T.silver}</span><span><input type="number" data-f="silver" value="${v.silver||''}" placeholder="0" /> g</span></div>
        </div>
        <div style="margin-top:16px;">
          <div style="font-size:11px; letter-spacing:0.1em; text-transform:uppercase; color:var(--n-500); font-family:var(--mono); margin-bottom:6px;">${T.tradeAndDebts}</div>
          <div class="zk-field"><span class="l">${T.inventory}</span><span><input type="number" data-f="inventory" value="${v.inventory||''}" placeholder="0" /> MAD</span></div>
          <div class="zk-field"><span class="l">${T.receivables}</span><span><input type="number" data-f="receivables" value="${v.receivables||''}" placeholder="0" /> MAD</span></div>
          <div class="zk-field"><span class="l">${T.debts}</span><span><input type="number" data-f="debts" value="${v.debts||''}" placeholder="0" /> MAD</span></div>
          <div class="zk-total"><span>${T.taxableTotal}</span><span>${tot.toLocaleString(numLocale,{maximumFractionDigits:0})} MAD</span></div>
        </div>
        ${due > 0 && zkReal ? `
        <div style="margin-top:20px;padding:14px 16px;background:var(--paper-soft);border-radius:12px;">
          <div style="font-size:12.5px;color:var(--n-600);line-height:1.55;">${T.payoutSoon}</div>
        </div>` : ''}
        ${due > 0 && !zkReal ? `
        <div style="margin-top:20px;">
          <div style="font-size:11px; letter-spacing:0.1em; text-transform:uppercase; color:var(--n-500); font-family:var(--mono); margin-bottom:10px;">${T.recipient}</div>
          <div class="zk-recipients">
            <div class="zk-recipient ${recipient==='amc'?'selected':''}" data-r="amc">
              <div class="n">${T.caritasName}</div>
              <div class="d">${T.caritasDesc}</div>
            </div>
            <div class="zk-recipient ${recipient==='beni'?'selected':''}" data-r="beni">
              <div class="n">${T.baytiName}</div>
              <div class="d">${T.baytiDesc}</div>
            </div>
            <div class="zk-recipient ${recipient==='fond'?'selected':''}" data-r="fond">
              <div class="n">${T.fondaName}</div>
              <div class="d">${T.fondaDesc}</div>
            </div>
            <div class="zk-recipient ${recipient==='custom'?'selected':''}" data-r="custom">
              <div class="n">${T.otherRecipient}</div>
              <div class="d">${T.otherRecipientDesc}</div>
            </div>
          </div>
        </div>` : ''}
        <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:22px;">
          <button class="kb ghost" data-close>${T.close}</button>
          ${due > 0 && !zkReal ? `<button class="kb atlas" data-pay>${T.payZakat}</button>` : ''}
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
        if (!recipient) { toast(T.chooseRecipient, {type: 'warn'}); return; }
        m.close();
        confetti();
        toast(T.zakatPaid, {type: 'success', desc: T.zakatAccepted});
      }
    });
  };

  /* ═══════════════════ SADAQA ROUND-UP ═══════════════════ */
  const SADAQA_STR = {
    fr: {
      tag: 'ARRONDIS SOLIDAIRES · صدقة',
      title: 'Sadaqa Round-Up',
      desc: 'Arrondissez chaque achat à la valeur supérieure et reversez la différence à une association.',
      roundupEnabled: 'Arrondis activés',
      roundupDesc: 'Chaque paiement Kiwi Card est arrondi et la différence est reversée.',
      roundToLabel: 'Arrondir au multiple de',
      monthlyCapLabel: (cap) => `Plafond mensuel · ${cap} MAD`,
      capHelp: 'Protégez-vous contre les mois à gros volume.',
      recipientLabel: 'Bénéficiaire',
      recipientAmc: 'AMC · Aide aux familles démunies',
      recipientBeni: 'Bayti · Enfants de la rue',
      recipientFond: 'Fondation Mohammed V · Solidarité nationale',
      recipientRotation: 'Rotation mensuelle (toutes)',
      example: 'Exemple :',
      exampleText: 'achat de 137,60 MAD arrondi à 140 MAD → 2,40 MAD de sadaqa.',
      estimation: 'Estimation :',
      estimationText: '~47 MAD de sadaqa ce mois-ci selon votre activité.',
      cancel: 'Annuler',
      save: 'Enregistrer',
      toastTitle: 'Arrondis solidaires activés',
      toastDesc: (roundTo, cap) => `Règle : ${roundTo} MAD · ${cap} MAD/mois max`,
    },
    en: {
      tag: 'SOLIDARITY ROUND-UP · Sadaqa',
      title: 'Sadaqa Round-Up',
      desc: 'Round up each purchase to the next whole amount and donate the difference to a charity.',
      roundupEnabled: 'Round-up enabled',
      roundupDesc: 'Each Kiwi Card payment is rounded up and the difference is donated.',
      roundToLabel: 'Round up to the nearest',
      monthlyCapLabel: (cap) => `Monthly cap · ${cap} MAD`,
      capHelp: 'Protect yourself against high-volume months.',
      recipientLabel: 'Recipient',
      recipientAmc: 'AMC · Help for underprivileged families',
      recipientBeni: 'Bayti · Children in street situations',
      recipientFond: 'Mohammed V Foundation · National solidarity',
      recipientRotation: 'Monthly rotation (all)',
      example: 'Example:',
      exampleText: 'a 137.60 MAD purchase is rounded up to 140 MAD → 2.40 MAD in sadaqa.',
      estimation: 'Estimation:',
      estimationText: '~47 MAD in sadaqa this month based on your activity.',
      cancel: 'Cancel',
      save: 'Save',
      toastTitle: 'Solidarity round-up activated',
      toastDesc: (roundTo, cap) => `Rule: ${roundTo} MAD · ${cap} MAD/month max`,
    },
    ar: {
      tag: 'الأرصدة التضامنية · صدقة',
      title: 'صدقة Round-Up',
      desc: 'قرّب كل عملية شراء إلى القيمة الأعلى وتبرع بالفرق لجمعية خيرية.',
      roundupEnabled: 'التبرع مفعل',
      roundupDesc: 'يتم تقريب كل دفعة ببطاقة كيوي ويتم التبرع بالفرق.',
      roundToLabel: 'التقريب إلى مضاعف',
      monthlyCapLabel: (cap) => `الحد الأقصى الشهري · ${cap} درهم`,
      capHelp: 'احمِ نفسك من الأشهر ذات الحجم الكبير.',
      recipientLabel: 'المستفيد',
      recipientAmc: 'AMC · مساعدة الأسر المعوزة',
      recipientBeni: 'بيتي · أطفال الشوارع',
      recipientFond: 'مؤسسة محمد الخامس · التضامن الوطني',
      recipientRotation: 'تناوب شهري (الكل)',
      example: 'مثال:',
      exampleText: 'شراء بقيمة 137,60 درهم يتم تقريبه إلى 140 درهم ← 2,40 درهم صدقة.',
      estimation: 'تقدير:',
      estimationText: 'حوالي 47 درهمًا من الصدقة هذا الشهر بناءً على نشاطك.',
      cancel: 'إلغاء',
      save: 'حفظ',
      toastTitle: 'تم تفعيل الأرصدة التضامنية',
      toastDesc: (roundTo, cap) => `القاعدة: ${roundTo} درهم · ${cap} درهم/شهر كحد أقصى`,
    }
  };

  handlers['sadaqa'] = () => {
    let enabled = true;
    let roundTo = 5;
    let cap = 100;
    let recipient = 'amc';
    const T = SADAQA_STR[trLang()] || SADAQA_STR.fr;

    const m = modal({
      tag: T.tag,
      title: T.title,
      desc: T.desc,
      width: 500,
      body: render()
    });
    function render() {
      return `
        <div style="background: var(--paper-soft); border-radius: 14px; padding: 18px; margin-bottom: 18px; display: flex; align-items: center; gap: 14px;">
          <label style="position:relative; display:inline-block; width:48px; height:28px;">
            <input type="checkbox" ${enabled?'checked':''} data-en style="opacity:0; width:0; height:0;" />
            <span style="position:absolute; inset:0; background:${enabled?'var(--atlas)':'var(--n-300)'}; border-radius:14px; cursor:pointer; transition: background 200ms;"></span>
            <span style="position:absolute; top:3px; left:${enabled?'23px':'3px'}; width:22px; height:22px; background:var(--surface); border-radius:50%; transition: left 200ms;"></span>
          </label>
          <div style="flex:1;">
            <div style="font-weight:500;">${T.roundupEnabled}</div>
            <div style="font-size:12.5px; color: var(--n-500); margin-top:2px;">${T.roundupDesc}</div>
          </div>
        </div>
        <div class="kf-group">
          <label class="kf-label">${T.roundToLabel}</label>
          <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:6px;">
            ${[1,5,10].map(n => `<button class="kb ${roundTo===n?'atlas':'ghost'}" data-r="${n}" style="justify-content:center;">${n} MAD</button>`).join('')}
          </div>
        </div>
        <div class="kf-group">
          <label class="kf-label">${T.monthlyCapLabel(cap)}</label>
          <input type="range" min="20" max="500" step="10" value="${cap}" data-cap style="width:100%; accent-color: var(--atlas);" />
          <div class="kf-help">${T.capHelp}</div>
        </div>
        <div class="kf-group">
          <label class="kf-label">${T.recipientLabel}</label>
          <select class="kf-input" data-rec>
            <option value="amc" ${recipient==='amc'?'selected':''}>${T.recipientAmc}</option>
            <option value="beni" ${recipient==='beni'?'selected':''}>${T.recipientBeni}</option>
            <option value="fond" ${recipient==='fond'?'selected':''}>${T.recipientFond}</option>
            <option value="rotation" ${recipient==='rotation'?'selected':''}>${T.recipientRotation}</option>
          </select>
        </div>
        <div style="margin-top:18px; padding:14px 16px; background: var(--mint-soft); border-radius: 10px; font-size: 13px; color: var(--riad);">
          <b>${T.example}</b> ${T.exampleText}<br/>
          <b>${T.estimation}</b> ${T.estimationText}
        </div>
        <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:20px;">
          <button class="kb ghost" data-close>${T.cancel}</button>
          <button class="kb atlas" data-save>${T.save}</button>
        </div>
      `;
    }
    m.el.addEventListener('click', (e) => {
      const r = e.target.closest('[data-r]');
      if (r) { roundTo = Number(r.dataset.r); m.el.querySelector('.kiwi-modal-body').innerHTML = render(); }
      if (e.target.matches('[data-en]')) { enabled = e.target.checked; m.el.querySelector('.kiwi-modal-body').innerHTML = render(); }
      if (e.target.closest('[data-close]')) m.close();
      if (e.target.closest('[data-save]')) { m.close(); toast(T.toastTitle, {type:'success', desc: T.toastDesc(roundTo, cap)}); }
    });
    m.el.addEventListener('input', (e) => {
      if (e.target.matches('[data-cap]')) { cap = Number(e.target.value); m.el.querySelector('.kiwi-modal-body').innerHTML = render(); }
      if (e.target.matches('[data-rec]')) { recipient = e.target.value; }
    });
  };

  /* ═══════════════════ RAMADAN MODE ═══════════════════ */
  const RAMADAN_STR = {
    fr: {
      bannerText: "<b>Mode Ramadan activé</b> · horaires iftar, scheduling staff adapté, prompts pourboire activés 19h-21h",
      countdown: (time) => `Iftar dans ${time} · 18:49`,
      toastEnabled: 'Mode Ramadan activé',
      toastEnabledDesc: 'Horaires iftar, staff Ramadan, prompts pourboire soir activés',
      toastDisabled: 'Mode Ramadan désactivé',
      toastDisabledDesc: 'Retour aux paramètres standards',
    },
    en: {
      bannerText: "<b>Ramadan Mode enabled</b> · Iftar times, adapted staff scheduling, evening tip prompts enabled 7-9pm",
      countdown: (time) => `Iftar in ${time} · 18:49`,
      toastEnabled: 'Ramadan Mode enabled',
      toastEnabledDesc: 'Iftar times, Ramadan staff, evening tip prompts enabled',
      toastDisabled: 'Ramadan Mode disabled',
      toastDisabledDesc: 'Returning to standard settings',
    },
    ar: {
      bannerText: "<b>وضع رمضان مفعل</b> · أوقات الإفطار، جدولة الموظفين مكيفة، تفعيل تنبيهات الإكراميات المسائية 7-9 مساءً",
      countdown: (time) => `الإفطار بعد ${time} · 18:49`,
      toastEnabled: 'وضع رمضان مفعل',
      toastEnabledDesc: 'تفعيل أوقات الإفطار، موظفي رمضان، تنبيهات الإكراميات المسائية',
      toastDisabled: 'وضع رمضان معطل',
      toastDisabledDesc: 'العودة إلى الإعدادات القياسية',
    }
  };

  let ramadanActive = localStorage.getItem('kiwiRamadan') === '1';
  function renderRamadanBanner() {
    let b = document.querySelector('.ramadan-banner');
    if (!ramadanActive) { b?.remove(); return; }
    if (!b) {
      b = document.createElement('div');
      b.className = 'ramadan-banner';
      const isDash = !!document.querySelector('.app .sidebar');
      if (isDash) document.querySelector('.app').appendChild(b);
      const T = RAMADAN_STR[trLang()] || RAMADAN_STR.fr;
      b.innerHTML = `
        <div class="left-s">
          <div class="moon"></div>
          <div>
            ${T.bannerText}
          </div>
        </div>
        <div style="display:flex; align-items:center; gap:12px;">
          <div class="countdown" data-iftar>${T.countdown('04h 12m')}</div>
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
    const T = RAMADAN_STR[trLang()] || RAMADAN_STR.fr;
    toast(ramadanActive ? T.toastEnabled : T.toastDisabled, {
      type: 'info',
      desc: ramadanActive ? T.toastEnabledDesc : T.toastDisabledDesc
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
  const KC_STR = {
    fr: {
      title: 'Kiwi Compte',
      subtitle: 'Compte pro · IBAN marocain · carte commerçant',
      balance: 'SOLDE',
      iban: 'IBAN',
      thisMonth: 'Ce mois',
      expenses: 'Dépenses',
      net: 'Net',
      quickActions: 'ACTIONS RAPIDES',
      transfer: 'Virer vers IBAN',
      addCard: 'Ajouter une carte',
      freezeCard: 'Geler la carte',
      payCnss: 'Payer CNSS',
      latestTransactions: 'DERNIERS MOUVEMENTS',
      txKiwi: 'Règlement Kiwi POS',
      txToday: "Aujourd'hui 09:00",
      txSupplier: 'Facture Mercado Supplier',
      txYesterday: 'Hier',
      txSalary: 'Salaire Fatima K.',
      txApril15: '15 avril',
      txIgr: 'IGR 2e trimestre',
      txApril10: '10 avril',
      txMonday: 'Lundi',
      requestAdvance: 'Demander une avance de trésorerie →'
    },
    en: {
      title: 'Kiwi Account',
      subtitle: 'Business account · Moroccan IBAN · merchant card',
      balance: 'BALANCE',
      iban: 'IBAN',
      thisMonth: 'This month',
      expenses: 'Expenses',
      net: 'Net',
      quickActions: 'QUICK ACTIONS',
      transfer: 'Transfer to IBAN',
      addCard: 'Add a card',
      freezeCard: 'Freeze card',
      payCnss: 'Pay CNSS',
      latestTransactions: 'LATEST TRANSACTIONS',
      txKiwi: 'Kiwi POS Settlement',
      txToday: 'Today 09:00',
      txSupplier: 'Mercado Supplier Invoice',
      txYesterday: 'Yesterday',
      txSalary: 'Fatima K. Salary',
      txApril15: 'April 15',
      txIgr: 'IGR 2nd quarter',
      txApril10: 'April 10',
      txMonday: 'Monday',
      requestAdvance: 'Request a cash advance →'
    },
    ar: {
      title: 'حساب كيوي',
      subtitle: 'حساب مهني · IBAN مغربي · بطاقة التاجر',
      balance: 'الرصيد',
      iban: 'IBAN',
      thisMonth: 'هذا الشهر',
      expenses: 'المصاريف',
      net: 'الصافي',
      quickActions: 'إجراءات سريعة',
      transfer: 'تحويل إلى IBAN',
      addCard: 'إضافة بطاقة',
      freezeCard: 'تجميد البطاقة',
      payCnss: 'دفع CNSS',
      latestTransactions: 'آخر الحركات',
      txKiwi: 'تسوية Kiwi POS',
      txToday: 'اليوم 09:00',
      txSupplier: 'فاتورة مورد',
      txYesterday: 'أمس',
      txSalary: 'راتب فاطمة خ.',
      txApril15: '15 أبريل',
      txIgr: 'IGR الربع الثاني',
      txApril10: '10 أبريل',
      txMonday: 'الاثنين',
      requestAdvance: 'طلب سلفة نقدية →'
    }
  };
  handlers['kiwi-compte'] = () => {
    const T = KC_STR[trLang()] || KC_STR.fr;
    // Kiwi Compte (banking) is a Phase 2 surface — the card, IBAN, balance and
    // transactions here are all demo. A real merchant must never see a fabricated
    // account; show an honest "coming soon" instead.
    if (window.KiwiEnv && window.KiwiEnv.isReal && window.KiwiEnv.isReal()) {
      const c = ({
        fr: { h: 'Kiwi Compte arrive bientôt', p: 'Votre compte professionnel Kiwi, votre carte et vos virements seront disponibles ici. Nous vous préviendrons dès l’ouverture.' },
        en: { h: 'Kiwi Compte is coming soon', p: 'Your Kiwi business account, card and transfers will live here. We\'ll let you know the moment it opens.' },
        ar: { h: 'حساب Kiwi قريبًا', p: 'سيتوفّر هنا حسابك المهني وبطاقتك وتحويلاتك مع Kiwi. سنخبرك فور فتحه.' },
      })[trLang()] || { h: 'Kiwi Compte is coming soon', p: '' };
      drawer({
        title: T.title, subtitle: T.subtitle, width: 480,
        body: `<div style="padding:36px 12px;text-align:center;">
          <div style="font-size:15.5px;font-weight:640;letter-spacing:-.01em;">${c.h}</div>
          <div style="font-size:12.5px;color:var(--n-500);margin-top:8px;line-height:1.55;max-width:360px;margin-inline:auto;">${c.p}</div>
        </div>`,
      });
      return;
    }
    const transactions = [
      [T.txKiwi, T.txToday, '+23 091,50', 'success'],
      [T.txSupplier, T.txYesterday, '−4 280,00', ''],
      [T.txSalary, T.txApril15, '−6 800,00', ''],
      [T.txIgr, T.txApril10, '−12 400,00', ''],
      [T.txKiwi, T.txMonday, '+21 445,00', 'success']
    ];
    drawer({
      title: T.title,
      subtitle: T.subtitle,
      width: 480,
      body: `
        <div class="kc-card">
          <div class="brand">kiwi<i></i></div>
          <div class="chip-s"></div>
          <div class="num">4982 •••• •••• 3291</div>
          <div class="row">
            <div>
              <div class="t">${T.balance}</div>
              <div class="v">47 281,90 MAD</div>
            </div>
            <div>
              <div class="t">${T.iban}</div>
              <div class="v">MA64 0071 ••••</div>
            </div>
          </div>
        </div>
        <div class="kc-stats">
          <div class="kc-stat"><div class="l">${T.thisMonth}</div><div class="v">+186 k</div></div>
          <div class="kc-stat"><div class="l">${T.expenses}</div><div class="v">−138 k</div></div>
          <div class="kc-stat"><div class="l">${T.net}</div><div class="v" style="color:var(--atlas);">+48 k</div></div>
        </div>
        <div style="font-size:11px; letter-spacing:0.1em; text-transform:uppercase; color:var(--n-500); font-family:var(--mono); margin-bottom:10px;">${T.quickActions}</div>
        <div style="display:grid; grid-template-columns:repeat(2,1fr); gap:8px; margin-bottom: 18px;">
          <button class="kb ghost" style="justify-content:flex-start; padding:14px;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M13 5l7 7-7 7"/></svg>${T.transfer}</button>
          <button class="kb ghost" style="justify-content:flex-start; padding:14px;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>${T.addCard}</button>
          <button class="kb ghost" style="justify-content:flex-start; padding:14px;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>${T.freezeCard}</button>
          <button class="kb ghost" style="justify-content:flex-start; padding:14px;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M8 12l3 3 5-6"/></svg>${T.payCnss}</button>
        </div>
        <div style="font-size:11px; letter-spacing:0.1em; text-transform:uppercase; color:var(--n-500); font-family:var(--mono); margin-bottom:10px;">${T.latestTransactions}</div>
        <div style="display:flex; flex-direction:column; gap:2px; font-size:13px;">
          ${transactions.map(([n,d,a,s]) => `
            <div style="display:flex; gap:12px; padding:10px 0; border-bottom:1px solid var(--n-200); align-items:center;">
              <div style="width:32px; height:32px; background:var(--paper-soft); border-radius:10px; display:flex; align-items:center; justify-content:center; color:var(--n-500); flex-shrink:0;">${s==='success'?'↓':'↑'}</div>
              <div style="flex:1; min-width:0;"><div style="font-weight:500;">${n}</div><div style="font-size:11.5px; color:var(--n-500); margin-top:1px;">${d}</div></div>
              <div class="mono" style="font-family:var(--mono); font-weight:500; color:${s==='success'?'var(--atlas)':'var(--ink)'};">${a}</div>
            </div>
          `).join('')}
        </div>
      `,
      foot: `
        <button class="kb atlas" style="flex:1; justify-content:center;" data-action="capital">${T.requestAdvance}</button>
      `
    });
  };

  /* ═══════════════════ CAPITAL / CASH ADVANCE ═══════════════════ */
  const CAPITAL_STR = {
    fr: {
      tag: 'KIWI CAPITAL · AVANCE DE TRÉSORERIE',
      title: 'Financement basé sur vos ventes',
      desc: 'Remboursement automatique via 8 % de vos encaissements quotidiens. Sans dossier bancaire.',
      prequalified: (max) => `Pré-qualifié jusqu'à ${max} MAD`,
      amountReceived: 'Montant reçu',
      fixedFee: 'Frais fixes (6 %)',
      totalToRepay: 'Total à rembourser',
      dailyDeduction: 'Prélèvement quotidien',
      estimatedDuration: 'Durée estimée',
      durationDays: (days) => `~${days} jours`,
      durationMonths: (months, days) => `~${months} mois (${days} jours)`,
      murabaha: 'Conforme Murabaha :',
      murabahaDesc: 'frais fixes non-usuraires, pas de taux variable. Agréé AAOIFI.',
      close: 'Fermer',
      confirm: "Confirmer · fonds d'ici 24h →",
      toastTitle: 'Kiwi Capital · demande acceptée',
      toastDesc: (amount) => `${amount} MAD seront crédités sur votre Kiwi Compte d'ici 24h`,
    },
    en: {
      tag: 'KIWI CAPITAL · CASH ADVANCE',
      title: 'Financing based on your sales',
      desc: 'Automatic repayment via 8% of your daily sales. No bank application.',
      prequalified: (max) => `Pre-qualified up to ${max} MAD`,
      amountReceived: 'Amount received',
      fixedFee: 'Fixed fee (6%)',
      totalToRepay: 'Total to repay',
      dailyDeduction: 'Daily deduction',
      estimatedDuration: 'Estimated duration',
      durationDays: (days) => `~${days} days`,
      durationMonths: (months, days) => `~${months} months (${days} days)`,
      murabaha: 'Murabaha compliant:',
      murabahaDesc: 'non-usurious fixed fees, no variable rate. AAOIFI approved.',
      close: 'Close',
      confirm: 'Confirm · funds within 24h →',
      toastTitle: 'Kiwi Capital · request accepted',
      toastDesc: (amount) => `${amount} MAD will be credited to your Kiwi Account within 24h`,
    },
    ar: {
      tag: 'كيوي كابيتال · سلفة نقدية',
      title: 'تمويل بناءً على مبيعاتك',
      desc: 'سداد تلقائي عبر 8% من إيراداتك اليومية. بدون ملف بنكي.',
      prequalified: (max) => `مؤهل مسبقًا حتى ${max} درهم`,
      amountReceived: 'المبلغ المستلم',
      fixedFee: 'رسوم ثابتة (6%)',
      totalToRepay: 'المجموع للسداد',
      dailyDeduction: 'الخصم اليومي',
      estimatedDuration: 'المدة المقدرة',
      durationDays: (days) => `~${days} يومًا`,
      durationMonths: (months, days) => `~${months} أشهر (${days} يومًا)`,
      murabaha: 'متوافق مع المرابحة:',
      murabahaDesc: 'رسوم ثابتة غير ربوية، بدون سعر فائدة متغير. معتمد من AAOIFI.',
      close: 'إغلاق',
      confirm: 'تأكيد · الأموال في غضون 24 ساعة →',
      toastTitle: 'كيوي كابيتال · تم قبول الطلب',
      toastDesc: (amount) => `سيتم إضافة ${amount} درهم إلى حساب كيوي الخاص بك في غضون 24 ساعة`,
    }
  };
  handlers['capital'] = () => {
    let amount = 45000;
    const max = 120000;
    const min = 5000;
    const T = CAPITAL_STR[trLang()] || CAPITAL_STR.fr;

    /* Kiwi Capital is a Phase 2-3 surface with NO lending rail behind it: the
     * flow below ends in "demande acceptée · 45 000 MAD crédités d'ici 24h",
     * which is a fabricated credit decision — and it carries Murabaha / AAOIFI
     * compliance claims. A real merchant must never be shown that. Show an
     * honest "coming soon" instead, exactly as the Kiwi Compte handler does.
     * The pitch demo (isReal() false) keeps the full flow, byte-identical. */
    if (window.KiwiEnv && window.KiwiEnv.isReal && window.KiwiEnv.isReal()) {
      const c = ({
        fr: { h: 'Kiwi Capital arrive bientôt', p: 'L’avance sur vos ventes n’est pas encore ouverte. Dès qu’elle le sera, votre éligibilité sera calculée sur vos encaissements réels et nous vous préviendrons.' },
        en: { h: 'Kiwi Capital is coming soon', p: 'Advances on your sales aren\'t open yet. When they are, your eligibility will be based on your real takings and we\'ll let you know.' },
        ar: { h: 'كيوي كابيتال قريبًا', p: 'السلفة على مبيعاتك ليست متاحة بعد. عند فتحها، ستُحتسب أهليتك من مداخيلك الفعلية وسنخبرك.' },
      })[trLang()] || { h: 'Kiwi Capital is coming soon', p: '' };
      modal({
        tag: T.tag, title: T.title, width: 480,
        body: `<div style="padding:32px 12px;text-align:center;">
          <div style="font-size:15.5px;font-weight:640;letter-spacing:-.01em;">${c.h}</div>
          <div style="font-size:12.5px;color:var(--n-500);margin-top:8px;line-height:1.55;max-width:380px;margin-inline:auto;">${c.p}</div>
        </div>`,
      });
      return;
    }

    const m = modal({
      tag: T.tag,
      title: T.title,
      desc: T.desc,
      width: 540,
      body: render()
    });
    function render() {
      const fee = amount * 0.06;
      const dailyPct = 8;
      const daily = 6900; // avg daily take MAD (matches ~200k MAD/mois demo)
      const days = Math.ceil((amount + fee) / (daily * dailyPct / 100));
      const durationLabel = days < 45 ? T.durationDays(days) : T.durationMonths(Math.ceil(days / 30), days);
      const lang = trLang();
      const numLocale = lang === 'ar' ? 'ar-MA' : 'fr-FR';

      return `
        <div class="cap-slider">
          <div class="cap-amount"><span style="color:var(--atlas); font-weight:700;">${amount.toLocaleString(numLocale)}</span> <span style="font-size:16px; color:var(--n-500);">MAD</span></div>
          <input type="range" min="${min}" max="${max}" step="1000" value="${amount}" data-amt />
          <div class="cap-range"><span>${min.toLocaleString(numLocale)} MAD</span><span>${T.prequalified(max.toLocaleString(numLocale))}</span></div>
        </div>
        <div style="background: var(--paper-soft); border-radius: 12px; padding: 16px 20px;">
          <div class="cap-metric"><span style="color: var(--n-600);">${T.amountReceived}</span><span class="v">${amount.toLocaleString(numLocale)} MAD</span></div>
          <div class="cap-metric"><span style="color: var(--n-600);">${T.fixedFee}</span><span class="v">${fee.toLocaleString(numLocale,{maximumFractionDigits:0})} MAD</span></div>
          <div class="cap-metric"><span style="color: var(--n-600);">${T.totalToRepay}</span><span class="v">${(amount+fee).toLocaleString(numLocale,{maximumFractionDigits:0})} MAD</span></div>
          <div class="cap-metric"><span style="color: var(--n-600);">${T.dailyDeduction}</span><span class="v">${dailyPct} % des ventes carte</span></div>
          <div class="cap-metric"><span style="color: var(--n-600);">${T.estimatedDuration}</span><span class="v" style="color: var(--atlas);">${durationLabel}</span></div>
        </div>
        <div style="margin-top:18px; padding: 14px 16px; background: var(--mint-soft); border-radius: 10px; font-size: 12.5px; color: var(--riad); display:flex; gap:10px;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0;"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
          <div><b>${T.murabaha}</b> ${T.murabahaDesc}</div>
        </div>
        <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:22px;">
          <button class="kb ghost" data-close>${T.close}</button>
          <button class="kb atlas" data-confirm>${T.confirm}</button>
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
        const lang = trLang();
        const numLocale = lang === 'ar' ? 'ar-MA' : 'fr-FR';
        toast(T.toastTitle, {type:'success', desc: T.toastDesc(amount.toLocaleString(numLocale))});
      }
    });
  };

  /* ═══════════════════ DIASPORA FX ═══════════════════ */
  const DIASPORA_STR = {
    fr: {
      tag: 'TRANSFERT DIASPORA · FRANCE → MAROC',
      title: 'Au taux interbancaire, ou presque.',
      desc: 'Taux EUR/MAD en temps réel · frais fixes transparents · livraison en 10 secondes.',
      youSend: 'VOUS ENVOYEZ DE',
      recipientReceives: 'RÉCIPIENT REÇOIT',
      comparison: (kiwi, kiwiRate, wafa, wise) => `<b>Kiwi :</b> ${kiwi} MAD (${kiwiRate}) · <b>Wafacash :</b> ${wafa} MAD · <b>Wise :</b> ${wise} MAD`,
      deliveryMethod: 'MÉTHODE DE LIVRAISON',
      wallet: 'Kiwi Wallet',
      walletTime: '~10 sec',
      iban: 'Sur IBAN',
      ibanTime: 'T+1',
      cash: 'Cash · 4 000 agences',
      cashTime: '30 min',
      kiwiFee: 'Frais Kiwi',
      cancel: 'Annuler',
      send: (amount) => `Envoyer ${amount} EUR →`,
      toastTitle: (amount) => `Transfert initié · ${amount} EUR`,
      toastWallet: 'Arrivée attendue dans 10 secondes',
      toastIban: 'IBAN crédité demain matin',
      toastCash: 'Disponible en agence dans 30 min',
    },
    en: {
      tag: 'DIASPORA TRANSFER · FRANCE → MOROCCO',
      title: 'At the interbank rate, almost.',
      desc: 'Real-time EUR/MAD rate · transparent fixed fees · 10-second delivery.',
      youSend: 'YOU SEND FROM',
      recipientReceives: 'RECIPIENT RECEIVES',
      comparison: (kiwi, kiwiRate, wafa, wise) => `<b>Kiwi:</b> ${kiwi} MAD (${kiwiRate}) · <b>Wafacash:</b> ${wafa} MAD · <b>Wise:</b> ${wise} MAD`,
      deliveryMethod: 'DELIVERY METHOD',
      wallet: 'Kiwi Wallet',
      walletTime: '~10 sec',
      iban: 'To IBAN',
      ibanTime: 'D+1',
      cash: 'Cash · 4,000 agencies',
      cashTime: '30 min',
      kiwiFee: 'Kiwi Fee',
      cancel: 'Cancel',
      send: (amount) => `Send ${amount} EUR →`,
      toastTitle: (amount) => `Transfer initiated · ${amount} EUR`,
      toastWallet: 'Expected arrival in 10 seconds',
      toastIban: 'IBAN credited tomorrow morning',
      toastCash: 'Available at agency in 30 min',
    },
    ar: {
      tag: 'تحويلات المغاربة المقيمين بالخارج · فرنسا → المغرب',
      title: 'بسعر الصرف بين البنوك، تقريبًا.',
      desc: 'سعر اليورو/الدرهم في الوقت الفعلي · رسوم ثابتة وشفافة · توصيل في 10 ثوانٍ.',
      youSend: 'أنت ترسل من',
      recipientReceives: 'المستلم يتلقى',
      comparison: (kiwi, kiwiRate, wafa, wise) => `<b>كيوي:</b> ${kiwi} درهم (${kiwiRate}) · <b>وفاكاش:</b> ${wafa} درهم · <b>وايز:</b> ${wise} درهم`,
      deliveryMethod: 'طريقة التوصيل',
      wallet: 'محفظة كيوي',
      walletTime: '~10 ثوانٍ',
      iban: 'على IBAN',
      ibanTime: 'يوم العمل التالي',
      cash: 'نقدًا · 4000 وكالة',
      cashTime: '30 دقيقة',
      kiwiFee: 'رسوم كيوي',
      cancel: 'إلغاء',
      send: (amount) => `إرسال ${amount} يورو →`,
      toastTitle: (amount) => `تم بدء التحويل · ${amount} يورو`,
      toastWallet: 'الوصول المتوقع في 10 ثوانٍ',
      toastIban: 'سيتم إضافة المبلغ إلى IBAN صباح الغد',
      toastCash: 'متوفر في الوكالة في غضون 30 دقيقة',
    }
  };
  handlers['diaspora'] = () => {
    let from = 100;
    const rate = 10.812; // live-ish interbank
    const kiwiRate = rate * (1 - 0.005); // 0.5% markup
    let method = 'wallet';
    const T = DIASPORA_STR[trLang()] || DIASPORA_STR.fr;

    const m = modal({
      tag: T.tag,
      title: T.title,
      desc: T.desc,
      width: 560,
      body: render()
    });
    function render() {
      const received = from * kiwiRate;
      const wiseReceived = from * rate * (1 - 0.008);
      const wafacashReceived = from * rate * (1 - 0.028);
      const lang = trLang();
      const numLocale = lang === 'ar' ? 'ar-MA' : 'fr-FR';

      return `
        <div class="dx-row">
          <div class="flag fr"></div>
          <div class="info">
            <div class="l">${T.youSend}</div>
            <div style="display:flex; align-items:baseline; gap:8px;"><input type="number" value="${from}" data-from /><span style="font-size:13px; color: var(--n-500);">EUR</span></div>
          </div>
        </div>
        <div style="text-align:center; margin:8px 0;"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--atlas)" stroke-width="2"><path d="M7 10l5 5 5-5"/></svg></div>
        <div class="dx-row">
          <div class="flag ma"></div>
          <div class="info">
            <div class="l">${T.recipientReceives}</div>
            <div class="amount">${received.toLocaleString(numLocale,{maximumFractionDigits:2})} <span class="u">MAD</span></div>
          </div>
        </div>
        <div class="dx-cmp">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0; margin-top:2px;"><path d="M12 2l2 4 4 2-4 2-2 4-2-4-4-2 4-2z" fill="currentColor"/></svg>
          <div>${T.comparison(received.toLocaleString(numLocale,{maximumFractionDigits:0}), kiwiRate.toFixed(3), wafacashReceived.toLocaleString(numLocale,{maximumFractionDigits:0}), wiseReceived.toLocaleString(numLocale,{maximumFractionDigits:0}))}</div>
        </div>
        <div style="font-size:11px; letter-spacing:0.1em; text-transform:uppercase; color:var(--n-500); font-family:var(--mono); margin-top:18px; margin-bottom:8px;">${T.deliveryMethod}</div>
        <div class="dx-methods">
          <div class="dx-method ${method==='wallet'?'selected':''}" data-m="wallet">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--atlas)" stroke-width="2" style="margin:0 auto;"><rect x="2" y="6" width="20" height="12" rx="2"/></svg>
            <strong>${T.wallet}</strong>
            <div class="time">${T.walletTime}</div>
          </div>
          <div class="dx-method ${method==='iban'?'selected':''}" data-m="iban">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--atlas)" stroke-width="2" style="margin:0 auto;"><path d="M3 3v18h18M7 14l4-4 4 4 5-5"/></svg>
            <strong>${T.iban}</strong>
            <div class="time">${T.ibanTime}</div>
          </div>
          <div class="dx-method ${method==='cash'?'selected':''}" data-m="cash">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--atlas)" stroke-width="2" style="margin:0 auto;"><rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2"/></svg>
            <strong>${T.cash}</strong>
            <div class="time">${T.cashTime}</div>
          </div>
        </div>
        <div style="margin-top:18px; padding: 12px 14px; background: var(--paper-soft); border-radius: 10px; font-size: 12.5px; color: var(--n-600); display:flex; justify-content:space-between;">
          <span>${T.kiwiFee}</span><b>0,50 EUR</b>
        </div>
        <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:22px;">
          <button class="kb ghost" data-close>${T.cancel}</button>
          <button class="kb atlas" data-send>${T.send(from.toLocaleString(numLocale))}</button>
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
        toast(T.toastTitle(from), {type:'success', desc: method === 'wallet' ? T.toastWallet : method === 'iban' ? T.toastIban : T.toastCash});
      }
    });
  };

  /* ═══════════════════ LOYALTY ═══════════════════ */
  const LOYALTY_STR = {
    fr: {
      tag: 'FIDÉLITÉ · KIWI LOYALTY',
      title: 'Remplacez la carte de fidélité papier.',
      desc: "Vos clients s'inscrivent avec leur numéro. 10 visites = 1 offert. Ou adaptez la mécanique à votre commerce.",
      previewProgram: 'PROGRAMME FIDÉLITÉ · CAFÉ ATLAS',
      previewReward: '10 cafés achetés = 1 offert',
      previewStats: '456 clients inscrits · 24 % reviennent dans la semaine · +18 % de fréquentation',
      modelTitle: 'MODÈLE DE FIDÉLITÉ',
      byVisit: 'Par visite',
      byVisitDesc: 'X visites = Y offert · idéal café/salon',
      byAmount: 'Par montant dépensé',
      byAmountDesc: '1 point par MAD · conversion à 100 pts',
      byProduct: 'Par produit',
      byProductDesc: 'Stamp sur un item spécifique · idéal restaurant',
      close: 'Fermer',
      activate: 'Activer le programme →',
      toastTitle: 'Programme fidélité activé',
      toastDesc: "Vos prochains clients verront le prompt d'inscription sur le reçu.",
      cfg: {
        reward: 'Récompense', visitTarget: 'Nombre de visites',
        perMad: 'Points par MAD', threshold: 'Palier (points)',
        item: 'Produit concerné', productTarget: 'Quantité',
        save: 'Enregistrer le programme', saved: 'Programme mis à jour',
        savedDesc: 'La caisse et le carnet clients l’appliquent aussitôt.',
      }
    },
    en: {
      tag: 'LOYALTY · KIWI LOYALTY',
      title: 'Replace the paper loyalty card.',
      desc: "Your customers sign up with their number. 10 visits = 1 free. Or adapt the mechanics to your business.",
      previewProgram: 'LOYALTY PROGRAM · CAFÉ ATLAS',
      previewReward: '10 coffees bought = 1 free',
      previewStats: '456 customers enrolled · 24% return within a week · +18% frequency',
      modelTitle: 'LOYALTY MODEL',
      byVisit: 'By visit',
      byVisitDesc: 'X visits = Y free · ideal for cafés/salons',
      byAmount: 'By amount spent',
      byAmountDesc: '1 point per MAD · conversion at 100 pts',
      byProduct: 'By product',
      byProductDesc: 'Stamp on a specific item · ideal for restaurants',
      close: 'Close',
      activate: 'Activate Program →',
      toastTitle: 'Loyalty program activated',
      toastDesc: 'Your next customers will see the sign-up prompt on their receipt.',
      cfg: {
        reward: 'Reward', visitTarget: 'Number of visits',
        perMad: 'Points per MAD', threshold: 'Threshold (points)',
        item: 'Qualifying product', productTarget: 'Quantity',
        save: 'Save program', saved: 'Program updated',
        savedDesc: 'The till and the client book apply it right away.',
      }
    },
    ar: {
      tag: 'الوفاء · KIWI LOYALTY',
      title: 'استبدل بطاقة الوفاء الورقية.',
      desc: 'يسجل عملاؤك برقمهم. 10 زيارات = 1 مجانًا. أو قم بتكييف الآلية مع تجارتك.',
      previewProgram: 'برنامج الوفاء · مقهى أطلس',
      previewReward: '10 قهوات مشتراة = 1 مجانًا',
      previewStats: '456 عميلًا مسجلًا · 24% يعودون في غضون أسبوع · +18% تردد',
      modelTitle: 'نموذج الوفاء',
      byVisit: 'حسب الزيارة',
      byVisitDesc: 'X زيارات = Y مجانًا · مثالي للمقاهي/الصالونات',
      byAmount: 'حسب المبلغ المنفق',
      byAmountDesc: 'نقطة واحدة لكل درهم · تحويل عند 100 نقطة',
      byProduct: 'حسب المنتج',
      byProductDesc: 'ختم على عنصر معين · مثالي للمطاعم',
      close: 'إغلاق',
      activate: 'تفعيل البرنامج →',
      toastTitle: 'تم تفعيل برنامج الوفاء',
      toastDesc: 'سيرى عملاؤك القادمون موجه التسجيل على إيصالهم.',
      cfg: {
        reward: 'المكافأة', visitTarget: 'عدد الزيارات',
        perMad: 'نقاط لكل درهم', threshold: 'العتبة (نقاط)',
        item: 'المنتج المؤهل', productTarget: 'الكمية',
        save: 'حفظ البرنامج', saved: 'تم تحديث البرنامج',
        savedDesc: 'يطبّقه الصندوق ودفتر العملاء فورًا.',
      }
    }
  };
  handlers['loyalty'] = () => {
    const T = LOYALTY_STR[trLang()] || LOYALTY_STR.fr;
    // The preview card names the demo venue ("· CAFÉ ATLAS"). For a real merchant,
    // swap in their own business name so the illustration is theirs, not the demo's.
    // Per STORE: a loyalty programme belongs to the shop, not to the account.
    let _biz = '';
    try { const _lVd = window.KiwiVenue?.isCustom?.() && window.KiwiVenue.getCurrentVenueData?.(); if (_lVd) _biz = String(_lVd.name || '').trim(); } catch (_) {}
    if (!_biz) _biz = (window.KiwiMe && window.KiwiMe.business || '').trim();
    const _prog = _biz ? T.previewProgram.replace(/·.*$/, '· ' + _biz.toUpperCase())
      : (window.KiwiEnv?.isReal?.() ? T.previewProgram.replace(/·.*$/, '').trim() : T.previewProgram);
    const C = T.cfg || {};
    const escAttr = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    // Pre-fill from the store's live programme (clients-store.js) — a merchant who
    // already set "10 cafés = 1 offert" reopens the editor on those exact values.
    const cur = (() => { try { return (window.KiwiClients && KiwiClients.config && KiwiClients.config()) || {}; } catch (_) { return {}; } })();
    const cfg = {
      model: cur.model || (window.KiwiClients && KiwiClients.defaultModel && KiwiClients.defaultModel()) || 'visit',
      visit:   Object.assign({ target: 10, reward: '1 offert' }, cur.visit),
      amount:  Object.assign({ perMad: 1, threshold: 100, reward: '−10 %' }, cur.amount),
      product: Object.assign({ item: 'Café', target: 10, reward: '1 offert' }, cur.product),
    };
    const optStyle = (v) => cfg.model === v ? 'border:1px solid var(--atlas); background: var(--mint-soft);' : 'border:1px solid var(--n-200); background: transparent;';
    const lineFor = (c) => c.model === 'amount' ? `${c.amount.perMad} pt / MAD → ${c.amount.reward} à ${c.amount.threshold} pts`
      : c.model === 'product' ? `${c.product.target} ${c.product.item} = ${c.product.reward}`
      : `${c.visit.target} visites = ${c.visit.reward}`;
    const m = modal({
      tag: T.tag,
      title: T.title,
      desc: T.desc,
      width: 540,
      body: `
        <div class="loy-preview">
          <div style="font-size:11px; letter-spacing:0.1em; font-family:var(--mono); color:var(--mint);">${_prog}</div>
          <div data-loy-preview style="font-size:22px; font-weight:600; margin-top:6px; letter-spacing:-0.02em;">${escAttr(lineFor(cfg))}</div>
          <div class="loy-dots">
            <i class="active">✓</i><i class="active">✓</i><i class="active">✓</i><i class="active">✓</i><i class="current">5</i><i>6</i><i>7</i><i>8</i><i>9</i><i>🎁</i>
          </div>
          <div style="margin-top:14px; font-size:12.5px; color:#d0eed9;">${T.previewStats}</div>
        </div>
        <div style="font-size:11px; letter-spacing:0.1em; text-transform:uppercase; color:var(--n-500); font-family:var(--mono); margin-top:18px; margin-bottom:10px;">${T.modelTitle}</div>
        <div style="display:flex; flex-direction:column; gap:8px;">
          <label data-mopt="visit" style="display:flex; gap:12px; padding:12px 14px; ${optStyle('visit')} border-radius: 10px; cursor:pointer;"><input type="radio" name="m" value="visit" ${cfg.model === 'visit' ? 'checked' : ''}/><div><b>${T.byVisit}</b><div style="font-size:12px; color:var(--n-600); margin-top:2px;">${T.byVisitDesc}</div></div></label>
          <label data-mopt="amount" style="display:flex; gap:12px; padding:12px 14px; ${optStyle('amount')} border-radius: 10px; cursor:pointer;"><input type="radio" name="m" value="amount" ${cfg.model === 'amount' ? 'checked' : ''}/><div><b>${T.byAmount}</b><div style="font-size:12px; color:var(--n-500); margin-top:2px;">${T.byAmountDesc}</div></div></label>
          <label data-mopt="product" style="display:flex; gap:12px; padding:12px 14px; ${optStyle('product')} border-radius: 10px; cursor:pointer;"><input type="radio" name="m" value="product" ${cfg.model === 'product' ? 'checked' : ''}/><div><b>${T.byProduct}</b><div style="font-size:12px; color:var(--n-500); margin-top:2px;">${T.byProductDesc}</div></div></label>
        </div>
        <div data-mgroup="visit" ${cfg.model === 'visit' ? '' : 'hidden'} style="margin-top:16px;">
          <div class="kf-row">
            <div class="kf-group"><label class="kf-label">${C.visitTarget}</label><input class="kf-input" data-loy="visit.target" type="number" min="1" inputmode="numeric" value="${escAttr(cfg.visit.target)}"></div>
            <div class="kf-group"><label class="kf-label">${C.reward}</label><input class="kf-input" data-loy="visit.reward" value="${escAttr(cfg.visit.reward)}" placeholder="1 offert"></div>
          </div>
        </div>
        <div data-mgroup="amount" ${cfg.model === 'amount' ? '' : 'hidden'} style="margin-top:16px;">
          <div class="kf-row">
            <div class="kf-group"><label class="kf-label">${C.perMad}</label><input class="kf-input" data-loy="amount.perMad" type="number" min="1" inputmode="numeric" value="${escAttr(cfg.amount.perMad)}"></div>
            <div class="kf-group"><label class="kf-label">${C.threshold}</label><input class="kf-input" data-loy="amount.threshold" type="number" min="1" inputmode="numeric" value="${escAttr(cfg.amount.threshold)}"></div>
          </div>
          <div class="kf-group"><label class="kf-label">${C.reward}</label><input class="kf-input" data-loy="amount.reward" value="${escAttr(cfg.amount.reward)}" placeholder="−10 %"></div>
        </div>
        <div data-mgroup="product" ${cfg.model === 'product' ? '' : 'hidden'} style="margin-top:16px;">
          <div class="kf-row">
            <div class="kf-group"><label class="kf-label">${C.item}</label><input class="kf-input" data-loy="product.item" value="${escAttr(cfg.product.item)}" placeholder="Café"></div>
            <div class="kf-group"><label class="kf-label">${C.productTarget}</label><input class="kf-input" data-loy="product.target" type="number" min="1" inputmode="numeric" value="${escAttr(cfg.product.target)}"></div>
          </div>
          <div class="kf-group"><label class="kf-label">${C.reward}</label><input class="kf-input" data-loy="product.reward" value="${escAttr(cfg.product.reward)}" placeholder="1 offert"></div>
        </div>
        <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:22px;">
          <button class="kb ghost" data-close>${T.close}</button>
          <button class="kb atlas" data-activate>${C.save || T.activate}</button>
        </div>
      `
    });
    // Read the full programme back out of the form (with sane fallbacks).
    const readCfg = () => {
      const read = (k) => { const el = m.el.querySelector(`[data-loy="${k}"]`); return el ? el.value.trim() : ''; };
      const num = (k, d) => { const n = parseInt(read(k), 10); return n > 0 ? n : d; };
      const picked = m.el.querySelector('input[name="m"]:checked');
      return {
        model: (picked && picked.value) || cfg.model,
        visit:   { target: num('visit.target', 10), reward: read('visit.reward') || '1 offert' },
        amount:  { perMad: num('amount.perMad', 1), threshold: num('amount.threshold', 100), reward: read('amount.reward') || '−10 %' },
        product: { item: read('product.item') || 'Café', target: num('product.target', 10), reward: read('product.reward') || '1 offert' },
      };
    };
    const refreshPreview = () => { const el = m.el.querySelector('[data-loy-preview]'); if (el) el.textContent = lineFor(readCfg()); };
    // Model switch → reveal that mechanic's fields, restyle the chosen card, refresh preview.
    m.el.addEventListener('change', (e) => {
      const r = e.target.closest('input[name="m"]'); if (!r) return;
      const model = r.value;
      m.el.querySelectorAll('[data-mgroup]').forEach((g) => { g.hidden = g.getAttribute('data-mgroup') !== model; });
      m.el.querySelectorAll('[data-mopt]').forEach((l) => {
        const on = l.getAttribute('data-mopt') === model;
        l.style.border = on ? '1px solid var(--atlas)' : '1px solid var(--n-200)';
        l.style.background = on ? 'var(--mint-soft)' : 'transparent';
      });
      refreshPreview();
    });
    m.el.addEventListener('input', (e) => { if (e.target.closest('[data-loy]')) refreshPreview(); });
    m.el.addEventListener('click', (e) => {
      if (e.target.closest('[data-close]')) m.close();
      if (e.target.closest('[data-activate]')) {
        // Persist the FULL programme (model + targets + rewards) to the store's
        // fidelity config (clients-store.js), so the caisse Carnet + the CRM segments
        // use it live. No-op without a real book (unpaired demo).
        try { if (window.KiwiClients && KiwiClients.hasBook && KiwiClients.hasBook()) KiwiClients.setConfig(readCfg()); } catch (_) {}
        m.close(); toast(C.saved || T.toastTitle, { type: 'success', desc: C.savedDesc || T.toastDesc });
      }
    });
  };

  /* ═══════════════════ AGENT MODE (enhanced AI) ═══════════════════ */
  const AGENT_STR = {
    fr: {
      title: 'Kiwi AI · mode agent',
      subtitle: 'Actions proposées · validation requise',
      unpaidTitle: 'Relancer 5 impayés > 500 MAD',
      unpaidDesc: 'Total bloqué : 3 280 MAD. Brouillon WhatsApp prêt pour chaque client.',
      unpaidTime: 'DÉTECTÉ · IL Y A 4 MIN',
      approve: 'Approuver',
      ignore: 'Ignorer',
      cnssTitle: 'Régler la CNSS · 4 280 MAD',
      cnssDesc: 'Échéance dans 3 jours. Avance via Kiwi Capital disponible si besoin.',
      cnssTime: 'ÉCHÉANCE PROCHE',
      payNow: 'Payer maintenant',
      schedule: 'Planifier',
      tipTitle: 'Activer prompt pourboire +10 % après 20h',
      tipDesc: 'Gain estimé : +380 MAD/soir selon votre historique.',
      tipTime: 'RECOMMANDATION',
      activate: 'Activer',
      orderTitle: 'Commander 30 kg tomates · fournisseur habituel',
      orderDesc: 'Stock bas détecté · livraison demain 7h si confirmé avant 17h.',
      orderTime: 'INVENTAIRE · STOCK BAS',
      confirmOrder: 'Confirmer commande',
      chooseSupplier: 'Choisir autre fournisseur',
      reviewsTitle: 'Répondre à 2 avis Google négatifs',
      reviewsDesc: 'Brouillons de réponse professionnelle générés · ton mesuré.',
      reviewsTime: 'RÉPUTATION',
      reviewAndSend: 'Relire et envoyer',
      doItMyself: 'Traiter moi-même',
      runAll: 'Exécuter toutes les actions approuvées →',
      approved: 'Approuvé ✓',
      actionApproved: 'Action approuvée',
      agentRun: 'Agent Kiwi · 5 actions exécutées',
      agentRunDesc: "Consultez les détails dans l'historique."
    },
    en: {
      title: 'Kiwi AI · Agent Mode',
      subtitle: 'Proposed actions · validation required',
      unpaidTitle: 'Follow up on 5 unpaid invoices > 500 MAD',
      unpaidDesc: 'Total blocked: 3,280 MAD. WhatsApp draft ready for each client.',
      unpaidTime: 'DETECTED · 4 MIN AGO',
      approve: 'Approve',
      ignore: 'Ignore',
      cnssTitle: 'Pay CNSS · 4,280 MAD',
      cnssDesc: 'Due in 3 days. Advance via Kiwi Capital available if needed.',
      cnssTime: 'DUE SOON',
      payNow: 'Pay now',
      schedule: 'Schedule',
      tipTitle: 'Enable +10% tip prompt after 8pm',
      tipDesc: 'Estimated gain: +380 MAD/evening based on your history.',
      tipTime: 'RECOMMENDATION',
      activate: 'Activate',
      orderTitle: 'Order 30kg tomatoes · usual supplier',
      orderDesc: 'Low stock detected · delivery tomorrow 7am if confirmed before 5pm.',
      orderTime: 'INVENTORY · LOW STOCK',
      confirmOrder: 'Confirm order',
      chooseSupplier: 'Choose another supplier',
      reviewsTitle: 'Reply to 2 negative Google reviews',
      reviewsDesc: 'Professional response drafts generated · measured tone.',
      reviewsTime: 'REPUTATION',
      reviewAndSend: 'Review and send',
      doItMyself: 'Handle it myself',
      runAll: 'Run all approved actions →',
      approved: 'Approved ✓',
      actionApproved: 'Action approved',
      agentRun: 'Kiwi Agent · 5 actions executed',
      agentRunDesc: 'Check the history for details.'
    },
    ar: {
      title: 'Kiwi AI · وضع الوكيل',
      subtitle: 'إجراءات مقترحة · تتطلب المصادقة',
      unpaidTitle: 'متابعة 5 فواتير غير مدفوعة > 500 درهم',
      unpaidDesc: 'المجموع المحجوز: 3,280 درهم. مسودة واتساب جاهزة لكل عميل.',
      unpaidTime: 'تم الكشف · قبل 4 دقائق',
      approve: 'الموافقة',
      ignore: 'تجاهل',
      cnssTitle: 'دفع CNSS · 4,280 درهم',
      cnssDesc: 'يستحق في 3 أيام. سلفة عبر Kiwi Capital متاحة عند الحاجة.',
      cnssTime: 'يقترب الاستحقاق',
      payNow: 'ادفع الآن',
      schedule: 'جدولة',
      tipTitle: 'تفعيل تنبيه الإكرامية +10% بعد الساعة 8 مساءً',
      tipDesc: 'الربح المقدر: +380 درهم/مساء بناءً على سجلك.',
      tipTime: 'توصية',
      activate: 'تفعيل',
      orderTitle: 'طلب 30 كجم طماطم · المورد المعتاد',
      orderDesc: 'تم الكشف عن انخفاض المخزون · التسليم غدًا الساعة 7 صباحًا إذا تم التأكيد قبل 5 مساءً.',
      orderTime: 'المخزون · مخزون منخفض',
      confirmOrder: 'تأكيد الطلب',
      chooseSupplier: 'اختيار مورد آخر',
      reviewsTitle: 'الرد على تقييمين سلبيين في Google',
      reviewsDesc: 'تم إنشاء مسودات رد احترافية · لهجة موزونة.',
      reviewsTime: 'السمعة',
      reviewAndSend: 'مراجعة وإرسال',
      doItMyself: 'سأتعامل معها بنفسي',
      runAll: 'تنفيذ جميع الإجراءات المعتمدة →',
      approved: 'تمت الموافقة ✓',
      actionApproved: 'تمت الموافقة على الإجراء',
      agentRun: 'وكيل كيوي · 5 إجراءات منفذة',
      agentRunDesc: 'تحقق من السجل للحصول على التفاصيل.'
    }
  };
  handlers['agent-mode'] = () => {
    const T = AGENT_STR[trLang()] || AGENT_STR.fr;
    drawer({
      title: T.title,
      subtitle: T.subtitle,
      width: 460,
      body: `
        <div class="agent-action">
          <div class="ic"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/></svg></div>
          <div class="b">
            <div class="n">${T.unpaidTitle}</div>
            <div class="d">${T.unpaidDesc}</div>
            <div class="t">${T.unpaidTime}</div>
            <div class="acts"><button class="approve" data-agent-approve>${T.approve}</button><button class="dismiss" data-agent-dismiss>${T.ignore}</button></div>
          </div>
        </div>
        <div class="agent-action">
          <div class="ic"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="6" width="18" height="12" rx="2"/></svg></div>
          <div class="b">
            <div class="n">${T.cnssTitle}</div>
            <div class="d">${T.cnssDesc}</div>
            <div class="t">${T.cnssTime}</div>
            <div class="acts"><button class="approve" data-agent-approve>${T.payNow}</button><button class="dismiss" data-agent-dismiss>${T.schedule}</button></div>
          </div>
        </div>
        <div class="agent-action">
          <div class="ic"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l2 4 4 2-4 2-2 4-2-4-4-2 4-2z" fill="currentColor"/></svg></div>
          <div class="b">
            <div class="n">${T.tipTitle}</div>
            <div class="d">${T.tipDesc}</div>
            <div class="t">${T.tipTime}</div>
            <div class="acts"><button class="approve" data-agent-approve>${T.activate}</button><button class="dismiss" data-agent-dismiss>${T.ignore}</button></div>
          </div>
        </div>
        <div class="agent-action">
          <div class="ic"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M3 12h18M3 18h10"/></svg></div>
          <div class="b">
            <div class="n">${T.orderTitle}</div>
            <div class="d">${T.orderDesc}</div>
            <div class="t">${T.orderTime}</div>
            <div class="acts"><button class="approve" data-agent-approve>${T.confirmOrder}</button><button class="dismiss" data-agent-dismiss>${T.chooseSupplier}</button></div>
          </div>
        </div>
        <div class="agent-action">
          <div class="ic"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 14s1.5 2 4 2 4-2 4-2"/><circle cx="9" cy="9" r="1" fill="currentColor"/><circle cx="15" cy="9" r="1" fill="currentColor"/><circle cx="12" cy="12" r="10"/></svg></div>
          <div class="b">
            <div class="n">${T.reviewsTitle}</div>
            <div class="d">${T.reviewsDesc}</div>
            <div class="t">${T.reviewsTime}</div>
            <div class="acts"><button class="approve" data-agent-approve>${T.reviewAndSend}</button><button class="dismiss" data-agent-dismiss>${T.doItMyself}</button></div>
          </div>
        </div>
      `,
      foot: `<button class="kb atlas" style="flex:1; justify-content:center;" data-agent-run-all>${T.runAll}</button>`
    });
    const agentHandler = (e) => {
      const a = e.target.closest('[data-agent-approve]');
      const d = e.target.closest('[data-agent-dismiss]');
      const r = e.target.closest('[data-agent-run-all]');
      const T = AGENT_STR[trLang()] || AGENT_STR.fr;
      if (a) { a.textContent = T.approved; a.disabled = true; a.style.opacity = '0.6'; toast(T.actionApproved, {type:'success', duration:1400}); }
      if (d) { const card = d.closest('.agent-action'); card.style.opacity = '0.4'; card.style.pointerEvents = 'none'; }
      if (r) { document.querySelector('.kiwi-drawer-close')?.click(); setTimeout(()=> { toast(T.agentRun, {type:'success', desc:T.agentRunDesc}); confetti(); }, 300); }
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
