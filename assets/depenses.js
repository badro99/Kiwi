/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · DÉPENSES & CARTES — the outflow side of the merchant OS (Kiwi Pay).
 * ---------------------------------------------------------------------------
 * POS shows the money coming IN. This module shows where it goes OUT: Kiwi
 * cards handed to the team with per-category limits, approve-before-it-moves
 * requests, live budgets, and supplier bills — netted against the revenue the
 * dashboard already tracks.
 *
 * HONESTY: issuing cards + paying suppliers is a payment-institution / e-money
 * licence (Bank Al-Maghrib) = Kiwi Pay = Phase 2 on the roadmap. This is a
 * DEMO surface and a Phase-2 banner says so; nothing here claims to move real
 * money today.
 *
 * Reachable from the sidebar « Dépenses & cartes » (data-nav="depenses").
 * Renders through Kiwi.appPage like every other full-page destination. A
 * merchant-created (0000) venue gets an honest starter instead of demo data.
 * Trilingual FR/EN/AR; tokens-only so dark mode inverts cleanly. Vanilla JS.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (!window.Kiwi) { console.warn('depenses.js loaded before interactive.js'); return; }
  const { handlers, toast, modal, confetti } = window.Kiwi;
  const lang = () => (window.KiwiI18n && window.KiwiI18n.getLang && window.KiwiI18n.getLang()) || 'fr';
  const pick = (o) => (o == null ? '' : (o[lang()] ?? o.fr ?? ''));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const mad = (n) => Math.round(n).toLocaleString('fr-FR').replace(/ |,/g, ' ');

  /* ─────────────── STRINGS ─────────────── */
  const T = {
    title:    { fr: 'Dépenses & cartes', en: 'Spend & cards', ar: 'المصاريف والبطاقات' },
    subtitle: { fr: 'Café Atlas · juin · le contrôle des sorties', en: 'Café Atlas · June · outflow control', ar: 'قهوة أطلس · يونيو · مراقبة المصاريف' },
    phase:    { fr: 'KIWI PAY · PHASE 2', en: 'KIWI PAY · PHASE 2', ar: 'KIWI PAY · المرحلة 2' },
    phaseMsg: { fr: 'Les cartes Kiwi et les paiements fournisseurs relèvent de l\'agrément établissement de paiement (Bank Al-Maghrib). Aperçu de la feuille de route, aucune transaction réelle ici.',
                en: 'Kiwi cards and supplier payments require a payment-institution licence (Bank Al-Maghrib). Roadmap preview, no real money moves here.',
                ar: 'بطاقات Kiwi ومدفوعات المورّدين تتطلب ترخيص مؤسسة دفع (بنك المغرب). معاينة لخارطة الطريق، لا معاملات حقيقية هنا.' },
    inLbl:    { fr: 'ENCAISSÉ · CE MOIS', en: 'COLLECTED · THIS MONTH', ar: 'المحصّل · هذا الشهر' },
    outLbl:   { fr: 'DÉPENSÉ · CE MOIS', en: 'SPENT · THIS MONTH', ar: 'المصروف · هذا الشهر' },
    netLbl:   { fr: 'NET', en: 'NET', ar: 'الصافي' },
    budgetLbl:{ fr: 'Budget mensuel', en: 'Monthly budget', ar: 'الميزانية الشهرية' },
    budgetOf: { fr: 'utilisés sur', en: 'used of', ar: 'مستعمل من' },
    cardsH:   { fr: 'Cartes Kiwi', en: 'Kiwi cards', ar: 'بطاقات Kiwi' },
    newCard:  { fr: '+ Nouvelle carte', en: '+ New card', ar: '+ بطاقة جديدة' },
    perMonth: { fr: '/ mois', en: '/ mo', ar: '/ شهر' },
    unlimited:{ fr: 'Plafond libre', en: 'No limit', ar: 'بدون حدّ' },
    active:   { fr: 'Active', en: 'Active', ar: 'مفعّلة' },
    frozen:   { fr: 'Gelée', en: 'Frozen', ar: 'مجمّدة' },
    virtual:  { fr: 'Virtuelle', en: 'Virtual', ar: 'افتراضية' },
    physical: { fr: 'Physique', en: 'Physical', ar: 'مادية' },
    freeze:   { fr: 'Geler', en: 'Freeze', ar: 'تجميد' },
    unfreeze: { fr: 'Réactiver', en: 'Unfreeze', ar: 'إعادة تفعيل' },
    apprH:    { fr: 'À approuver', en: 'To approve', ar: 'بانتظار الموافقة' },
    apprNone: { fr: 'Rien à approuver, tout est à jour.', en: 'Nothing to approve, all clear.', ar: 'لا شيء للموافقة، كل شيء محدّث.' },
    receipt:  { fr: 'justificatif', en: 'receipt', ar: 'وصل' },
    noReceipt:{ fr: 'justificatif manquant', en: 'receipt missing', ar: 'وصل ناقص' },
    approve:  { fr: 'Approuver', en: 'Approve', ar: 'موافقة' },
    refuse:   { fr: 'Refuser', en: 'Refuse', ar: 'رفض' },
    budgetsH: { fr: 'Budgets par catégorie', en: 'Budgets by category', ar: 'الميزانيات حسب الفئة' },
    feedH:    { fr: 'Dépenses récentes', en: 'Recent spend', ar: 'المصاريف الأخيرة' },
    suppH:    { fr: 'Factures fournisseurs à payer', en: 'Supplier bills to pay', ar: 'فواتير المورّدين' },
    due:      { fr: 'échéance', en: 'due', ar: 'الاستحقاق' },
    pay:      { fr: 'Payer', en: 'Pay', ar: 'دفع' },
    auto:     { fr: 'auto', en: 'auto', ar: 'تلقائي' },
    tApproved:{ fr: 'Dépense approuvée', en: 'Expense approved', ar: 'تمت الموافقة' },
    tApprDesc:{ fr: 'Le montant est imputé au budget de la catégorie et exporté pour le comptable.', en: 'Booked to the category budget and exported for the accountant.', ar: 'تم تسجيله في ميزانية الفئة وتصديره للمحاسب.' },
    tRefused: { fr: 'Dépense refusée', en: 'Expense refused', ar: 'تم رفض المصروف' },
    tRefDesc: { fr: 'L\'employé est notifié par WhatsApp avec le motif.', en: 'The employee is notified on WhatsApp with the reason.', ar: 'يُخطر الموظف عبر واتساب بالسبب.' },
    tFrozen:  { fr: 'Carte gelée', en: 'Card frozen', ar: 'تم تجميد البطاقة' },
    tFrozenD: { fr: 'Plus aucune dépense ne passe tant qu\'elle reste gelée.', en: 'No spend goes through while it stays frozen.', ar: 'لن تمرّ أي مصاريف ما دامت مجمّدة.' },
    tUnfroze: { fr: 'Carte réactivée', en: 'Card reactivated', ar: 'تمت إعادة تفعيل البطاقة' },
    tUnfrozeD:{ fr: 'L\'équipe peut de nouveau l\'utiliser dans sa limite.', en: 'The team can use it again within its limit.', ar: 'يمكن للفريق استعمالها من جديد ضمن حدّها.' },
    tPaid:    { fr: 'Virement programmé', en: 'Transfer scheduled', ar: 'تمت برمجة التحويل' },
    tPaidD:   { fr: 'Le fournisseur reçoit le règlement à l\'échéance, rapproché automatiquement.', en: 'The supplier is paid on the due date, auto-reconciled.', ar: 'يُدفع للمورّد عند الاستحقاق، تتم المطابقة تلقائيًا.' },
    tNewCard: { fr: 'Carte émise', en: 'Card issued', ar: 'تم إصدار البطاقة' },
    tNewCardD:{ fr: 'Carte virtuelle prête, partagée par WhatsApp, active dans sa limite.', en: 'Virtual card ready, shared on WhatsApp, live within its limit.', ar: 'بطاقة افتراضية جاهزة، تُشارك عبر واتساب، مفعّلة ضمن حدّها.' },
    ncTag:    { fr: 'NOUVELLE CARTE', en: 'NEW CARD', ar: 'بطاقة جديدة' },
    ncTitle:  { fr: 'Émettre une carte Kiwi', en: 'Issue a Kiwi card', ar: 'إصدار بطاقة Kiwi' },
    ncDesc:   { fr: 'Carte virtuelle instantanée, partagée à l\'employé par WhatsApp.', en: 'Instant virtual card, shared to the employee on WhatsApp.', ar: 'بطاقة افتراضية فورية، تُشارك للموظف عبر واتساب.' },
    ncHolder: { fr: 'Titulaire', en: 'Holder', ar: 'الحامل' },
    ncLimit:  { fr: 'Plafond mensuel (MAD)', en: 'Monthly limit (MAD)', ar: 'الحدّ الشهري (درهم)' },
    ncCat:    { fr: 'Catégorie autorisée', en: 'Allowed category', ar: 'الفئة المسموحة' },
    ncIssue:  { fr: 'Émettre la carte', en: 'Issue card', ar: 'إصدار البطاقة' },
    cancel:   { fr: 'Annuler', en: 'Cancel', ar: 'إلغاء' },
    // Ultra · cross-site portfolio (fusion view)
    uTitle:   { fr: 'Dépenses · portefeuille', en: 'Spend · portfolio', ar: 'المصاريف · المحفظة' },
    uSub:     { fr: '3 établissements · juin · contrôle consolidé', en: '3 venues · June · consolidated control', ar: '3 منشآت · يونيو · مراقبة موحّدة' },
    uBadge:   { fr: 'EXCLUSIF ULTRA', en: 'ULTRA EXCLUSIVE', ar: 'حصري ألترا' },
    uBadgeMsg:{ fr: 'Une seule boîte d\'approbation et un seul net pour vos 3 établissements. Le contrôle des sorties à l\'échelle du portefeuille, réservé au palier Ultra (1 499 MAD/mois).',
                en: 'One approval inbox and one net across your 3 venues. Portfolio-wide outflow control, Ultra tier only (1,499 MAD/mo).',
                ar: 'صندوق موافقة واحد وصافٍ واحد لمنشآتك الثلاث. التحكّم في المصاريف على مستوى المحفظة، حصري لباقة ألترا (1,499 درهم/شهر).' },
    uInLbl:   { fr: 'ENCAISSÉ · 3 SITES', en: 'COLLECTED · 3 VENUES', ar: 'المحصّل · 3 مواقع' },
    uOutLbl:  { fr: 'DÉPENSÉ · 3 SITES', en: 'SPENT · 3 VENUES', ar: 'المصروف · 3 مواقع' },
    uNetLbl:  { fr: 'NET CONSOLIDÉ', en: 'CONSOLIDATED NET', ar: 'الصافي الموحّد' },
    uSitesH:  { fr: 'Sorties par établissement', en: 'Outflow by venue', ar: 'المصاريف حسب المنشأة' },
    uInboxH:  { fr: 'À approuver · tous sites', en: 'To approve · all venues', ar: 'بانتظار الموافقة · كل المواقع' },
    uBudH:    { fr: 'Budgets consolidés', en: 'Consolidated budgets', ar: 'الميزانيات الموحّدة' },
    uOpen:    { fr: 'Ouvrir', en: 'Open', ar: 'فتح' },
    uShare:   { fr: 'des sorties', en: 'of outflow', ar: 'من المصاريف' },
    cardsWord:{ fr: 'cartes', en: 'cards', ar: 'بطاقات' },
    // starter (custom venue)
    stTitle:  { fr: 'Vos dépenses, sous contrôle', en: 'Your spending, under control', ar: 'مصاريفك تحت السيطرة' },
    stMsg:    { fr: 'Donnez à votre équipe des cartes Kiwi avec un plafond par catégorie, approuvez avant que l\'argent ne bouge, et voyez chaque dirham qui sort, net de ce qui rentre.',
                en: 'Give your team Kiwi cards with a per-category limit, approve before money moves, and see every dirham going out, net of what comes in.',
                ar: 'امنح فريقك بطاقات Kiwi بحدّ لكل فئة، ووافق قبل تحرّك المال، وشاهد كل درهم يخرج، مقابل ما يدخل.' },
    stB1:     { fr: 'Cartes équipe avec plafond et catégorie', en: 'Team cards with a limit and category', ar: 'بطاقات للفريق بحدّ وفئة' },
    stB2:     { fr: 'Approbation avant chaque dépense', en: 'Approval before each expense', ar: 'موافقة قبل كل مصروف' },
    stB3:     { fr: 'Factures fournisseurs et export comptable', en: 'Supplier bills and accounting export', ar: 'فواتير المورّدين والتصدير المحاسبي' },
    stFoot:   { fr: 'Disponible avec Kiwi Pay, la sortie d\'argent, aussi simple que l\'encaissement.', en: 'Available with Kiwi Pay, money out, as simple as money in.', ar: 'متاح مع Kiwi Pay، إخراج المال بسهولة تحصيله.' },
  };

  const CAT = {
    achats:  { fr: 'Achats marchandises', en: 'Goods & supplies', ar: 'مشتريات البضائع' },
    salaire: { fr: 'Salaires',            en: 'Payroll',          ar: 'الأجور' },
    energie: { fr: 'Énergie & eau',       en: 'Energy & water',   ar: 'الطاقة والماء' },
    loyer:   { fr: 'Loyer',               en: 'Rent',             ar: 'الكراء' },
    maint:   { fr: 'Maintenance',         en: 'Maintenance',      ar: 'الصيانة' },
    telecom: { fr: 'Télécom',             en: 'Telecom',          ar: 'الاتصالات' },
    market:  { fr: 'Marketing',           en: 'Marketing',        ar: 'التسويق' },
    menage:  { fr: 'Entretien',           en: 'Cleaning',         ar: 'النظافة' },
  };

  /* ─────────────── DEMO STATE (Café Atlas) ─────────────── */
  const REV_MONTH = 248600, BUDGET = 95000;
  let cards, pending, suppliers;
  function seed() {
    cards = [
      { id: 'c1', who: 'Hamid Jelloul', role: { fr: 'Chef de cuisine', en: 'Head chef', ar: 'رئيس المطبخ' }, av: 'HJ', cat: 'achats', limit: 12000, used: 8420, kind: 'virtual', frozen: false, hue: 'var(--atlas)' },
      { id: 'c2', who: 'Fatima Khalki', role: { fr: 'Responsable bar', en: 'Bar lead', ar: 'مسؤولة البار' }, av: 'FK', cat: 'achats', limit: 6000, used: 3180, kind: 'physical', frozen: false, hue: 'var(--riad)' },
      { id: 'c3', who: 'Rachid Benhima', role: { fr: 'Propriétaire', en: 'Owner', ar: 'المالك' }, av: 'RB', cat: null, limit: 0, used: 41200, kind: 'physical', frozen: false, hue: '#1f6f53' },
      { id: 'c4', who: 'Salma Ait', role: { fr: 'Entretien', en: 'Cleaning', ar: 'النظافة' }, av: 'SA', cat: 'menage', limit: 2000, used: 1760, kind: 'virtual', frozen: true, hue: 'var(--n-500)' },
    ];
    pending = [
      { id: 'p1', who: 'Hamid Jelloul', av: 'HJ', merchant: 'Métro Cash & Carry', cat: 'achats', amount: 2340, receipt: true },
      { id: 'p2', who: 'Fatima Khalki', av: 'FK', merchant: 'Sidi Ali (eau)', cat: 'achats', amount: 880, receipt: true },
      { id: 'p3', who: 'Salma Ait', av: 'SA', merchant: 'Produits ménagers', cat: 'menage', amount: 1240, receipt: false },
    ];
    suppliers = [
      { id: 's1', name: 'Atlas Coffee Roasters', cat: 'achats', days: 3, amount: 8600 },
      { id: 's2', name: 'Distrib Frais SARL', cat: 'achats', days: 7, amount: 4200 },
    ];
  }
  seed();

  const budgets = [
    { cat: 'achats',  spent: 42000, cap: 50000 },
    { cat: 'salaire', spent: 28000, cap: 30000 },
    { cat: 'energie', spent: 6800,  cap: 8000 },
    { cat: 'loyer',   spent: 12000, cap: 12000 },
    { cat: 'maint',   spent: 2100,  cap: 4000 },
    { cat: 'market',  spent: 1540,  cap: 3000 },
  ];
  const feed = [
    { t: '14:20', merchant: 'Métro Cash & Carry', cat: 'achats',  who: 'Hamid',  amount: 2340, receipt: true },
    { t: '11:05', merchant: 'Sidi Ali',           cat: 'achats',  who: 'Fatima', amount: 880,  receipt: true },
    { t: '09:30', merchant: 'Lydec',              cat: 'energie', who: null,     amount: 1920, receipt: true },
    { t: 'Hier',  merchant: 'Atelier Salé',       cat: 'achats',  who: 'Hamid',  amount: 1450, receipt: true },
    { t: 'Hier',  merchant: 'Maroc Telecom',      cat: 'telecom', who: null,     amount: 340,  receipt: true },
  ];

  /* ─── ULTRA · cross-site portfolio (fusion view) ───
   * The 1 499 MAD/mois superpower: one owner controls outflow across every
   * établissement from a single screen — one approval inbox, one net. */
  const SITES = [
    { id: 'cafeAtlas',     name: 'Café Atlas',     loc: 'Maarif',    av: 'CA', hue: 'var(--atlas)', rev: 248600, spent: 90440, cards: 4 },
    { id: 'maisonMansour', name: 'Maison Mansour', loc: 'Guéliz',    av: 'MM', hue: 'var(--riad)',  rev: 186200, spent: 71200, cards: 3 },
    { id: 'spaBahia',      name: 'Spa Bahia',      loc: 'Hivernage', av: 'SB', hue: '#1f6f53',      rev: 142800, spent: 58900, cards: 2 },
  ];
  const xbudgets = [
    { cat: 'achats',  spent: 96000, cap: 120000 },
    { cat: 'salaire', spent: 71000, cap: 78000 },
    { cat: 'energie', spent: 18400, cap: 22000 },
    { cat: 'loyer',   spent: 34000, cap: 34000 },
    { cat: 'market',  spent: 6900,  cap: 12000 },
  ];
  let xpending;
  function seedX() {
    xpending = [
      { id: 'x1', site: 'Café Atlas',     who: 'Hamid Jelloul',  av: 'HJ', merchant: 'Métro Cash & Carry',  cat: 'achats', amount: 2340, receipt: true },
      { id: 'x2', site: 'Maison Mansour', who: 'Salma Benani',   av: 'SB', merchant: 'Atelier textile Fès', cat: 'achats', amount: 5600, receipt: true },
      { id: 'x3', site: 'Spa Bahia',      who: 'Yasmine Tahiri', av: 'YT', merchant: 'Huiles & cosmétiques', cat: 'achats', amount: 3120, receipt: false },
      { id: 'x4', site: 'Maison Mansour', who: 'Karim Lahlou',   av: 'KL', merchant: 'Déco vitrine',        cat: 'market', amount: 1850, receipt: true },
    ];
  }
  seedX();

  /* ─────────────── STYLES ─────────────── */
  (function injectCss() {
    const css = `
    .dep-wrap { display: flex; flex-direction: column; gap: 16px; max-width: 1120px; }
    .dep-phase { display: inline-flex; align-items: center; gap: 10px; align-self: flex-start;
      background: color-mix(in srgb, var(--atlas) 10%, var(--surface)); border: 1px solid color-mix(in srgb, var(--atlas) 26%, transparent);
      border-radius: 12px; padding: 9px 14px; font-size: 12px; color: var(--n-700); line-height: 1.45; max-width: 720px; }
    .dep-phase b { font-family: var(--mono); font-size: 10px; letter-spacing: 0.08em; color: var(--atlas); white-space: nowrap; }
    /* ledger hero */
    .dep-ledger { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 1px; background: color-mix(in srgb, var(--ink) 8%, transparent);
      border: 1px solid color-mix(in srgb, var(--ink) 8%, transparent); border-radius: 18px; overflow: hidden; }
    @media (max-width: 720px) { .dep-ledger { grid-template-columns: 1fr; } }
    .dep-led { background: var(--surface); padding: 20px 22px; }
    .dep-led.out { background: color-mix(in srgb, var(--riad) 7%, var(--surface)); }
    .dep-led .l { font-family: var(--mono); font-size: 10.5px; letter-spacing: 0.08em; color: var(--n-500); }
    .dep-led .v { font-size: 30px; font-weight: 600; letter-spacing: -0.025em; color: var(--ink); margin-top: 8px; font-variant-numeric: tabular-nums; }
    .dep-led .v .u { font-size: 14px; font-weight: 500; color: var(--n-500); margin-inline-start: 4px; }
    .dep-led.out .v { color: var(--riad); }
    .dep-led.net .v { color: var(--atlas); }
    .dep-budget { margin-top: 14px; }
    .dep-budget .br { height: 8px; border-radius: 999px; background: color-mix(in srgb, var(--ink) 8%, transparent); overflow: hidden; }
    .dep-budget .br > i { display: block; height: 100%; width: 0; border-radius: 999px; background: linear-gradient(90deg, var(--atlas), var(--mint));
      transition: width 760ms cubic-bezier(0.16, 1, 0.3, 1); }
    .dep-budget .cap { font-size: 11.5px; color: var(--n-500); margin-top: 6px; }
    /* section card */
    .dep-card { background: var(--surface); border: 1px solid color-mix(in srgb, var(--ink) 8%, transparent); border-radius: 16px; padding: 18px 20px;
      animation: dep-in 460ms cubic-bezier(0.32,0.72,0,1) backwards; }
    @keyframes dep-in { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
    .dep-grid { display: grid; grid-template-columns: 1.4fr 1fr; gap: 16px; align-items: start; }
    @media (max-width: 920px) { .dep-grid { grid-template-columns: 1fr; } }
    .dep-h { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; gap: 12px; }
    .dep-h .t { font-size: 15px; font-weight: 600; letter-spacing: -0.01em; }
    .dep-h .cta { font-size: 12.5px; font-weight: 600; color: var(--atlas); background: none; border: 0; cursor: pointer; font-family: inherit; }
    .dep-h .cta:hover { text-decoration: underline; text-underline-offset: 3px; }
    /* cards grid */
    .dep-cards { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    @media (max-width: 560px) { .dep-cards { grid-template-columns: 1fr; } }
    .dep-kc { position: relative; border-radius: 14px; padding: 15px 16px; color: var(--paper); overflow: hidden; min-height: 132px;
      display: flex; flex-direction: column; justify-content: space-between; transition: transform 200ms cubic-bezier(0.32,0.72,0,1), box-shadow 200ms ease; }
    .dep-kc:hover { transform: translateY(-2px); box-shadow: 0 14px 30px -16px color-mix(in srgb, var(--ink) 40%, transparent); }
    .dep-kc.frozen { filter: saturate(0.4) brightness(0.92); }
    .dep-kc-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; }
    .dep-kc-who { font-size: 13.5px; font-weight: 600; }
    .dep-kc-role { font-size: 11px; opacity: 0.78; margin-top: 1px; }
    .dep-kc-chip { font-family: var(--mono); font-size: 9px; letter-spacing: 0.06em; background: rgba(255,255,255,0.16); border-radius: 999px; padding: 3px 8px; white-space: nowrap; }
    .dep-kc-amt { font-size: 19px; font-weight: 600; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
    .dep-kc-amt span { font-size: 11.5px; font-weight: 500; opacity: 0.8; }
    .dep-kc-bar { height: 5px; border-radius: 999px; background: rgba(255,255,255,0.2); overflow: hidden; margin-top: 8px; }
    .dep-kc-bar > i { display: block; height: 100%; width: 0; background: var(--paper); border-radius: 999px; transition: width 760ms cubic-bezier(0.16,1,0.3,1); }
    .dep-kc-foot { display: flex; justify-content: space-between; align-items: center; margin-top: 10px; }
    .dep-kc-state { font-size: 10.5px; display: inline-flex; align-items: center; gap: 5px; }
    .dep-kc-state i { width: 6px; height: 6px; border-radius: 50%; background: var(--mint); }
    .dep-kc.frozen .dep-kc-state i { background: #ffd27d; }
    .dep-kc-freeze { font-size: 11px; font-weight: 600; color: var(--paper); background: rgba(255,255,255,0.16); border: 0; border-radius: 8px; padding: 5px 10px; cursor: pointer; font-family: inherit; }
    .dep-kc-freeze:hover { background: rgba(255,255,255,0.26); }
    /* approvals */
    .dep-appr { display: flex; gap: 11px; align-items: center; padding: 12px 0; border-top: 1px solid color-mix(in srgb, var(--ink) 7%, transparent); }
    .dep-appr:first-of-type { border-top: 0; }
    .dep-av { width: 34px; height: 34px; border-radius: 50%; background: var(--atlas); color: var(--paper); display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 600; flex: none; }
    .dep-appr-mid { flex: 1; min-width: 0; }
    .dep-appr-top { font-size: 13px; font-weight: 600; }
    .dep-appr-sub { font-size: 11.5px; color: var(--n-500); margin-top: 1px; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
    .dep-rcpt { display: inline-flex; align-items: center; gap: 4px; color: var(--atlas); }
    .dep-rcpt.miss { color: #c98a1e; }
    .dep-appr-amt { font-family: var(--mono); font-size: 13.5px; font-weight: 600; color: var(--ink); white-space: nowrap; }
    .dep-appr-btns { display: flex; gap: 6px; flex: none; }
    .dep-mini { font-size: 11.5px; font-weight: 600; border-radius: 8px; padding: 6px 11px; cursor: pointer; font-family: inherit; border: 1px solid transparent; }
    .dep-mini.ok { background: var(--atlas); color: var(--paper); }
    .dep-mini.ok:hover { background: var(--riad); }
    .dep-mini.no { background: transparent; color: var(--n-600); border-color: color-mix(in srgb, var(--ink) 14%, transparent); }
    .dep-mini.no:hover { border-color: var(--danger); color: var(--danger); }
    .dep-empty { padding: 22px 8px; text-align: center; font-size: 12.5px; color: var(--n-500); }
    /* budgets */
    .dep-bud { padding: 9px 0; }
    .dep-bud-top { display: flex; justify-content: space-between; font-size: 12.5px; margin-bottom: 6px; }
    .dep-bud-top .pct { font-family: var(--mono); color: var(--n-600); }
    .dep-bud-top .pct.warn { color: #c98a1e; }
    .dep-bud-top .pct.full { color: var(--danger); }
    .dep-bud .br { height: 7px; border-radius: 999px; background: color-mix(in srgb, var(--ink) 7%, transparent); overflow: hidden; }
    .dep-bud .br > i { display: block; height: 100%; width: 0; border-radius: 999px; background: var(--atlas); transition: width 760ms cubic-bezier(0.16,1,0.3,1); }
    .dep-bud .br > i.warn { background: #d99a2b; }
    .dep-bud .br > i.full { background: var(--danger); }
    /* feed */
    .dep-row { display: flex; gap: 11px; align-items: center; padding: 10px 0; border-top: 1px solid color-mix(in srgb, var(--ink) 6%, transparent); }
    .dep-row:first-of-type { border-top: 0; }
    .dep-row-ic { width: 32px; height: 32px; border-radius: 9px; background: color-mix(in srgb, var(--atlas) 12%, var(--surface)); color: var(--atlas); display: flex; align-items: center; justify-content: center; flex: none; }
    .dep-row-mid { flex: 1; min-width: 0; }
    .dep-row-m { font-size: 13px; font-weight: 500; }
    .dep-row-s { font-size: 11.5px; color: var(--n-500); margin-top: 1px; }
    .dep-row-amt { font-family: var(--mono); font-size: 13px; font-weight: 600; color: var(--riad); white-space: nowrap; }
    /* suppliers */
    .dep-supp { display: flex; gap: 12px; align-items: center; padding: 12px 0; border-top: 1px solid color-mix(in srgb, var(--ink) 6%, transparent); }
    .dep-supp:first-of-type { border-top: 0; }
    .dep-supp-mid { flex: 1; min-width: 0; }
    .dep-supp-n { font-size: 13px; font-weight: 600; }
    .dep-supp-s { font-size: 11.5px; color: var(--n-500); margin-top: 1px; }
    .dep-supp-s.soon { color: #c98a1e; }
    .dep-supp-amt { font-family: var(--mono); font-size: 13.5px; font-weight: 600; white-space: nowrap; }
    /* starter */
    .dep-starter { max-width: 560px; margin: 24px auto 0; text-align: center; }
    .dep-starter-ic { width: 52px; height: 52px; border-radius: 16px; margin: 0 auto 16px; background: color-mix(in srgb, var(--mint) 25%, var(--surface)); color: var(--atlas); display: flex; align-items: center; justify-content: center; }
    .dep-starter h3 { font-size: 19px; font-weight: 600; letter-spacing: -0.02em; margin: 0 0 8px; }
    .dep-starter > p { font-size: 13.5px; color: var(--n-600); line-height: 1.55; margin: 0 0 18px; }
    .dep-starter-list { text-align: start; background: var(--surface); border: 1px solid color-mix(in srgb, var(--ink) 8%, transparent); border-radius: 14px; padding: 6px 18px; margin-bottom: 16px; }
    .dep-starter-row { display: flex; gap: 10px; align-items: center; padding: 11px 0; font-size: 13px; color: var(--n-700); }
    .dep-starter-row + .dep-starter-row { border-top: 1px solid color-mix(in srgb, var(--ink) 6%, transparent); }
    .dep-starter-row svg { color: var(--atlas); flex: none; }
    .dep-starter-foot { font-size: 12px; color: var(--n-500); line-height: 1.5; max-width: 430px; margin: 0 auto; }
    /* ── Ultra · cross-site portfolio ── */
    .dep-ultra { display: inline-flex; align-items: center; gap: 10px; align-self: flex-start;
      background: linear-gradient(100deg, color-mix(in srgb, var(--riad) 12%, var(--surface)), color-mix(in srgb, var(--mint) 14%, var(--surface)));
      border: 1px solid color-mix(in srgb, var(--atlas) 30%, transparent); border-radius: 12px; padding: 9px 14px;
      font-size: 12px; color: var(--n-700); line-height: 1.45; max-width: 780px; }
    .dep-ultra b { font-family: var(--mono); font-size: 10px; letter-spacing: 0.09em; color: var(--atlas); white-space: nowrap; }
    .dep-sites { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
    @media (max-width: 920px) { .dep-sites { grid-template-columns: 1fr; } }
    .dep-site { text-align: start; background: var(--surface); border: 1px solid color-mix(in srgb, var(--ink) 9%, transparent);
      border-radius: 14px; padding: 15px 16px; cursor: pointer; font-family: inherit; width: 100%;
      transition: transform 200ms cubic-bezier(0.32,0.72,0,1), box-shadow 200ms ease, border-color 200ms ease; }
    .dep-site:hover { transform: translateY(-2px); box-shadow: 0 14px 30px -18px color-mix(in srgb, var(--ink) 32%, transparent); border-color: color-mix(in srgb, var(--atlas) 30%, transparent); }
    .dep-site-top { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
    .dep-site-av { width: 30px; height: 30px; border-radius: 8px; color: var(--paper); display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; flex: none; }
    .dep-site-nm { font-size: 13.5px; font-weight: 600; }
    .dep-site-loc { font-size: 11px; color: var(--n-500); margin-top: 1px; }
    .dep-site-net { font-size: 21px; font-weight: 600; letter-spacing: -0.02em; color: var(--atlas); font-variant-numeric: tabular-nums; }
    .dep-site-net .u { font-size: 11px; font-weight: 500; color: var(--n-500); margin-inline-start: 3px; }
    .dep-site-io { display: flex; gap: 14px; font-size: 11.5px; color: var(--n-500); margin-top: 4px; }
    .dep-site-io b { color: var(--riad); font-weight: 600; }
    .dep-site-bar { height: 6px; border-radius: 999px; background: color-mix(in srgb, var(--ink) 8%, transparent); overflow: hidden; margin-top: 10px; }
    .dep-site-bar > i { display: block; height: 100%; width: 0; border-radius: 999px; background: linear-gradient(90deg, var(--riad), var(--atlas)); transition: width 760ms cubic-bezier(0.16,1,0.3,1); }
    .dep-site-foot { display: flex; justify-content: space-between; align-items: center; font-size: 11px; color: var(--n-500); margin-top: 8px; }
    .dep-site-open { color: var(--atlas); font-weight: 600; }
    .dep-site-tag { font-family: var(--mono); font-size: 9px; letter-spacing: 0.04em; background: color-mix(in srgb, var(--atlas) 12%, var(--surface)); color: var(--atlas); border-radius: 999px; padding: 2px 7px; white-space: nowrap; }
    @media (prefers-reduced-motion: reduce) {
      .dep-card { animation: none; }
      .dep-budget .br > i, .dep-kc-bar > i, .dep-bud .br > i, .dep-site-bar > i { transition: none; }
      .dep-kc:hover, .dep-site:hover { transform: none; }
    }`;
    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  })();

  /* ─────────────── ICONS ─────────────── */
  const I = {
    check: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>',
    rcpt:  '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 2v20l3-2 3 2 3-2 3 2 3-2 1 2V2l-1 2-3-2-3 2-3-2-3 2-3-2z"/><path d="M8 8h8M8 12h6"/></svg>',
    cart:  '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><circle cx="9" cy="21" r="1"/><circle cx="18" cy="21" r="1"/><path d="M3 3h2l2.6 12.4a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.6L23 7H6"/></svg>',
    bolt:  '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M13 2L3 14h7l-1 8 10-12h-7z"/></svg>',
    phone: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/></svg>',
    spark: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.9 5.7L19.6 10l-5.7 1.9L12 17.6l-1.9-5.7L4.4 10l5.7-1.9z"/></svg>',
  };
  const catIcon = (c) => c === 'energie' ? I.bolt : c === 'telecom' ? I.phone : I.cart;

  /* ─────────────── RENDER ─────────────── */
  function bodyHtml() {
    const spent = budgets.reduce((s, b) => s + b.spent, 0);
    const net = REV_MONTH - spent;
    const budgetPct = Math.min(100, Math.round((spent / BUDGET) * 100));

    const ledger = `
      <div class="dep-ledger">
        <div class="dep-led"><div class="l">${pick(T.inLbl)}</div><div class="v">${mad(REV_MONTH)}<span class="u">MAD</span></div></div>
        <div class="dep-led out"><div class="l">${pick(T.outLbl)}</div><div class="v">${mad(spent)}<span class="u">MAD</span></div>
          <div class="dep-budget"><div class="br"><i data-grow="${budgetPct}%"></i></div>
          <div class="cap">${mad(spent)} ${pick(T.budgetOf)} ${mad(BUDGET)} MAD · ${budgetPct}%</div></div></div>
        <div class="dep-led net"><div class="l">${pick(T.netLbl)}</div><div class="v">+${mad(net)}<span class="u">MAD</span></div></div>
      </div>`;

    const cardsHtml = cards.map((c) => {
      const cap = c.limit ? `${mad(c.limit)} ${pick(T.perMonth)}` : pick(T.unlimited);
      const pct = c.limit ? Math.min(100, Math.round((c.used / c.limit) * 100)) : 36;
      const kind = c.kind === 'virtual' ? pick(T.virtual) : pick(T.physical);
      const stateTxt = c.frozen ? pick(T.frozen) : pick(T.active);
      const freezeTxt = c.frozen ? pick(T.unfreeze) : pick(T.freeze);
      return `
        <div class="dep-kc${c.frozen ? ' frozen' : ''}" style="background:linear-gradient(135deg, ${c.hue}, color-mix(in srgb, ${c.hue} 62%, #02261c));">
          <div class="dep-kc-top">
            <div><div class="dep-kc-who">${esc(c.who)}</div><div class="dep-kc-role">${esc(pick(c.role))}</div></div>
            <span class="dep-kc-chip">${kind}</span>
          </div>
          <div>
            <div class="dep-kc-amt">${mad(c.used)} <span>/ ${cap}</span></div>
            <div class="dep-kc-bar"><i data-grow="${pct}%"></i></div>
          </div>
          <div class="dep-kc-foot">
            <span class="dep-kc-state"><i></i>${stateTxt}</span>
            <button class="dep-kc-freeze" data-action="dep-freeze" data-arg="${c.id}">${freezeTxt}</button>
          </div>
        </div>`;
    }).join('');

    const apprHtml = pending.length ? pending.map((p) => `
      <div class="dep-appr">
        <div class="dep-av">${esc(p.av)}</div>
        <div class="dep-appr-mid">
          <div class="dep-appr-top">${esc(p.who)} · ${esc(p.merchant)}</div>
          <div class="dep-appr-sub"><span>${esc(pick(CAT[p.cat]))}</span>
            <span class="dep-rcpt${p.receipt ? '' : ' miss'}">${I.rcpt}${p.receipt ? pick(T.receipt) : pick(T.noReceipt)}</span></div>
        </div>
        <div class="dep-appr-amt">${mad(p.amount)} MAD</div>
        <div class="dep-appr-btns">
          <button class="dep-mini no" data-action="dep-refuse" data-arg="${p.id}">${pick(T.refuse)}</button>
          <button class="dep-mini ok" data-action="dep-approve" data-arg="${p.id}">${pick(T.approve)}</button>
        </div>
      </div>`).join('') : `<div class="dep-empty">${pick(T.apprNone)}</div>`;

    const budHtml = budgets.map((b) => {
      const pct = Math.min(100, Math.round((b.spent / b.cap) * 100));
      const cls = pct >= 100 ? 'full' : pct >= 88 ? 'warn' : '';
      return `<div class="dep-bud">
        <div class="dep-bud-top"><span>${esc(pick(CAT[b.cat]))}</span><span class="pct ${cls}">${mad(b.spent)} / ${mad(b.cap)} · ${pct}%</span></div>
        <div class="br"><i class="${cls}" data-grow="${pct}%"></i></div></div>`;
    }).join('');

    const feedHtml = feed.map((f) => `
      <div class="dep-row">
        <div class="dep-row-ic">${catIcon(f.cat)}</div>
        <div class="dep-row-mid">
          <div class="dep-row-m">${esc(f.merchant)}</div>
          <div class="dep-row-s">${f.t} · ${esc(pick(CAT[f.cat]))} · ${f.who ? esc(f.who) : pick(T.auto)}</div>
        </div>
        <div class="dep-row-amt">−${mad(f.amount)} MAD</div>
      </div>`).join('');

    const suppHtml = suppliers.length ? suppliers.map((s) => `
      <div class="dep-supp">
        <div class="dep-supp-mid">
          <div class="dep-supp-n">${esc(s.name)}</div>
          <div class="dep-supp-s${s.days <= 3 ? ' soon' : ''}">${pick(T.due)} ${s.days}j · ${esc(pick(CAT[s.cat]))}</div>
        </div>
        <div class="dep-supp-amt">${mad(s.amount)} MAD</div>
        <button class="dep-mini ok" data-action="dep-pay" data-arg="${s.id}">${pick(T.pay)}</button>
      </div>`).join('') : `<div class="dep-empty">—</div>`;

    return `
      <div class="dep-wrap">
        <div class="dep-phase"><b>${pick(T.phase)}</b><span>${pick(T.phaseMsg)}</span></div>
        ${ledger}
        <div class="dep-card" style="animation-delay:60ms;">
          <div class="dep-h"><div class="t">${pick(T.cardsH)}</div><button class="cta" data-action="dep-new-card">${pick(T.newCard)}</button></div>
          <div class="dep-cards">${cardsHtml}</div>
        </div>
        <div class="dep-grid">
          <div class="dep-card" style="animation-delay:120ms;">
            <div class="dep-h"><div class="t">${pick(T.apprH)}${pending.length ? ` · ${pending.length}` : ''}</div></div>
            ${apprHtml}
          </div>
          <div class="dep-card" style="animation-delay:160ms;">
            <div class="dep-h"><div class="t">${pick(T.budgetsH)}</div></div>
            ${budHtml}
          </div>
        </div>
        <div class="dep-grid">
          <div class="dep-card" style="animation-delay:200ms;">
            <div class="dep-h"><div class="t">${pick(T.feedH)}</div></div>
            ${feedHtml}
          </div>
          <div class="dep-card" style="animation-delay:240ms;">
            <div class="dep-h"><div class="t">${pick(T.suppH)}</div></div>
            ${suppHtml}
          </div>
        </div>
      </div>`;
  }

  function fusionBodyHtml() {
    const totIn = SITES.reduce((s, x) => s + x.rev, 0);
    const totOut = SITES.reduce((s, x) => s + x.spent, 0);
    const net = totIn - totOut;

    const ledger = `
      <div class="dep-ledger">
        <div class="dep-led"><div class="l">${pick(T.uInLbl)}</div><div class="v">${mad(totIn)}<span class="u">MAD</span></div></div>
        <div class="dep-led out"><div class="l">${pick(T.uOutLbl)}</div><div class="v">${mad(totOut)}<span class="u">MAD</span></div></div>
        <div class="dep-led net"><div class="l">${pick(T.uNetLbl)}</div><div class="v">+${mad(net)}<span class="u">MAD</span></div></div>
      </div>`;

    const sitesHtml = SITES.map((x) => {
      const sNet = x.rev - x.spent;
      const outRatio = Math.round((x.spent / x.rev) * 100);
      const shareOut = Math.round((x.spent / totOut) * 100);
      return `
        <button class="dep-site" data-action="dep-site" data-arg="${x.id}">
          <div class="dep-site-top">
            <div class="dep-site-av" style="background:${x.hue};">${x.av}</div>
            <div><div class="dep-site-nm">${esc(x.name)}</div><div class="dep-site-loc">${esc(x.loc)} · ${x.cards} ${pick(T.cardsWord)}</div></div>
          </div>
          <div class="dep-site-net">+${mad(sNet)}<span class="u">MAD ${pick(T.netLbl).toLowerCase()}</span></div>
          <div class="dep-site-io"><span>↑ ${mad(x.rev)}</span><span>↓ <b>${mad(x.spent)}</b></span></div>
          <div class="dep-site-bar"><i data-grow="${outRatio}%"></i></div>
          <div class="dep-site-foot"><span>${shareOut}% ${pick(T.uShare)}</span><span class="dep-site-open">${pick(T.uOpen)} →</span></div>
        </button>`;
    }).join('');

    const inboxHtml = xpending.length ? xpending.map((p) => `
      <div class="dep-appr">
        <div class="dep-av">${esc(p.av)}</div>
        <div class="dep-appr-mid">
          <div class="dep-appr-top">${esc(p.who)} · ${esc(p.merchant)}</div>
          <div class="dep-appr-sub"><span class="dep-site-tag">${esc(p.site)}</span><span>${esc(pick(CAT[p.cat]))}</span>
            <span class="dep-rcpt${p.receipt ? '' : ' miss'}">${I.rcpt}${p.receipt ? pick(T.receipt) : pick(T.noReceipt)}</span></div>
        </div>
        <div class="dep-appr-amt">${mad(p.amount)} MAD</div>
        <div class="dep-appr-btns">
          <button class="dep-mini no" data-action="dep-refuse" data-arg="${p.id}">${pick(T.refuse)}</button>
          <button class="dep-mini ok" data-action="dep-approve" data-arg="${p.id}">${pick(T.approve)}</button>
        </div>
      </div>`).join('') : `<div class="dep-empty">${pick(T.apprNone)}</div>`;

    const budHtml = xbudgets.map((b) => {
      const pct = Math.min(100, Math.round((b.spent / b.cap) * 100));
      const cls = pct >= 100 ? 'full' : pct >= 88 ? 'warn' : '';
      return `<div class="dep-bud">
        <div class="dep-bud-top"><span>${esc(pick(CAT[b.cat]))}</span><span class="pct ${cls}">${mad(b.spent)} / ${mad(b.cap)} · ${pct}%</span></div>
        <div class="br"><i class="${cls}" data-grow="${pct}%"></i></div></div>`;
    }).join('');

    return `
      <div class="dep-wrap">
        <div class="dep-ultra"><b>${pick(T.uBadge)}</b><span>${pick(T.uBadgeMsg)}</span></div>
        ${ledger}
        <div class="dep-card" style="animation-delay:60ms;">
          <div class="dep-h"><div class="t">${pick(T.uSitesH)}</div></div>
          <div class="dep-sites">${sitesHtml}</div>
        </div>
        <div class="dep-grid">
          <div class="dep-card" style="animation-delay:120ms;">
            <div class="dep-h"><div class="t">${pick(T.uInboxH)}${xpending.length ? ` · ${xpending.length}` : ''}</div></div>
            ${inboxHtml}
          </div>
          <div class="dep-card" style="animation-delay:160ms;">
            <div class="dep-h"><div class="t">${pick(T.uBudH)}</div></div>
            ${budHtml}
          </div>
        </div>
      </div>`;
  }

  function starterHtml() {
    const rows = [T.stB1, T.stB2, T.stB3].map((b) => `<div class="dep-starter-row">${I.check}<span>${pick(b)}</span></div>`).join('');
    return `<div class="dep-starter">
      <div class="dep-starter-ic">${I.spark}</div>
      <h3>${pick(T.stTitle)}</h3>
      <p>${pick(T.stMsg)}</p>
      <div class="dep-starter-list">${rows}</div>
      <p class="dep-starter-foot">${pick(T.stFoot)}</p>
    </div>`;
  }

  function growBars(host) {
    if (!host) return;
    const els = host.querySelectorAll('[data-grow]');
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { els.forEach((e) => { e.style.width = e.dataset.grow; }); return; }
    const apply = () => els.forEach((e) => { e.style.width = e.dataset.grow; });
    requestAnimationFrame(() => requestAnimationFrame(apply));
    setTimeout(apply, 420);
  }

  function render() {
    const KV = window.KiwiVenue;
    const custom = !!(KV && KV.isCustom && KV.isCustom());
    /* A REAL session (hosted, signed-in merchant, operator-scoped client, or a
     * custom venue) must never see the Café Atlas demo cards (Rachid Benhima,
     * Salma Ait, Métro Cash…). Mirror finance.js/accounting.js which gate on
     * isReal() || isCustom(); depenses previously checked isCustom() only, so a
     * hosted / signed-in merchant on a non-custom venue fell through to bodyHtml(). */
    const real = custom || !!(window.KiwiEnv && window.KiwiEnv.isReal && window.KiwiEnv.isReal());
    /* Portfolio (fusion) venue → the consolidated Ultra view. A custom venue
     * is never the fusion demo, so custom wins the branch. */
    const fusion = !custom && !!(KV && KV.getVenue && KV.getVenue() === 'fusion');
    const r = window.Kiwi.appPage('depenses', {
      title: fusion && !real ? pick(T.uTitle) : pick(T.title),
      subtitle: real ? (((custom && KV.getCurrentVenueData && KV.getCurrentVenueData().name) || '') + ' · compte en démarrage')
              : fusion ? pick(T.uSub) : pick(T.subtitle),
      body: real ? starterHtml() : fusion ? fusionBodyHtml() : bodyHtml(),
    });
    if (!real && r && r.el) growBars(r.el);
  }

  handlers['nav-depenses'] = render;
  /* « Pour vous » opportunity card + any other in-page CTA opens the page. */
  handlers['open-depenses'] = render;

  /* ─────────────── ACTIONS ─────────────── */
  handlers['dep-freeze'] = (_el, id) => {
    const c = cards.find((x) => x.id === id); if (!c) return;
    c.frozen = !c.frozen;
    render();
    toast(c.frozen ? pick(T.tFrozen) : pick(T.tUnfroze), { type: c.frozen ? 'warn' : 'success', desc: c.frozen ? pick(T.tFrozenD) : pick(T.tUnfrozeD) });
  };
  /* x-prefixed ids belong to the cross-site (fusion) approval inbox. */
  handlers['dep-approve'] = (_el, id) => {
    if (id && id.charAt(0) === 'x') {
      if (!xpending.some((x) => x.id === id)) return;
      xpending = xpending.filter((x) => x.id !== id);
      render();
      toast(pick(T.tApproved), { type: 'success', desc: pick(T.tApprDesc) });
      return;
    }
    const p = pending.find((x) => x.id === id); if (!p) return;
    pending = pending.filter((x) => x.id !== id);
    render();
    toast(pick(T.tApproved), { type: 'success', desc: pick(T.tApprDesc) });
  };
  handlers['dep-refuse'] = (_el, id) => {
    if (id && id.charAt(0) === 'x') {
      if (!xpending.some((x) => x.id === id)) return;
      xpending = xpending.filter((x) => x.id !== id);
      render();
      toast(pick(T.tRefused), { type: 'warn', desc: pick(T.tRefDesc) });
      return;
    }
    const p = pending.find((x) => x.id === id); if (!p) return;
    pending = pending.filter((x) => x.id !== id);
    render();
    toast(pick(T.tRefused), { type: 'warn', desc: pick(T.tRefDesc) });
  };
  /* Drill into one établissement from the portfolio view — switching the
   * venue exits fusion; the venue subscriber below repaints this page. */
  handlers['dep-site'] = (_el, id) => {
    if (window.KiwiVenue && window.KiwiVenue.setVenue) window.KiwiVenue.setVenue(id);
    else render();
  };
  handlers['dep-pay'] = (_el, id) => {
    const s = suppliers.find((x) => x.id === id); if (!s) return;
    suppliers = suppliers.filter((x) => x.id !== id);
    render();
    toast(pick(T.tPaid), { type: 'success', desc: pick(T.tPaidD) });
  };
  handlers['dep-new-card'] = () => {
    const catOpts = Object.keys(CAT).map((k) => `<option value="${k}">${esc(pick(CAT[k]))}</option>`).join('');
    const m = modal({
      tag: pick(T.ncTag), title: pick(T.ncTitle), desc: pick(T.ncDesc), width: 460,
      body: `
        <div class="kf-group"><label class="kf-label">${pick(T.ncHolder)}</label>
          <input class="kf-input" data-nc="who" placeholder="${lang() === 'ar' ? 'الاسم الكامل' : lang() === 'en' ? 'Full name' : 'Nom complet'}"></div>
        <div class="kf-row">
          <div class="kf-group"><label class="kf-label">${pick(T.ncLimit)}</label>
            <input class="kf-input" data-nc="limit" inputmode="numeric" placeholder="5 000" style="font-family:var(--mono);"></div>
          <div class="kf-group"><label class="kf-label">${pick(T.ncCat)}</label>
            <select class="kf-input" data-nc="cat">${catOpts}</select></div>
        </div>
        <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:18px;">
          <button class="kb ghost" data-close>${pick(T.cancel)}</button>
          <button class="kb atlas" data-nc-issue>${pick(T.ncIssue)}</button>
        </div>`,
    });
    const root = m.el;
    root.querySelector('[data-nc-issue]').onclick = () => {
      const who = (root.querySelector('[data-nc="who"]').value || '').trim() || (lang() === 'ar' ? 'موظف' : lang() === 'en' ? 'Teammate' : 'Employé');
      const limit = parseInt((root.querySelector('[data-nc="limit"]').value || '').replace(/\D/g, ''), 10) || 5000;
      const cat = root.querySelector('[data-nc="cat"]').value;
      const initials = who.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase() || 'KP';
      cards.push({ id: 'c' + (cards.length + 1) + Date.now().toString(36).slice(-3), who, role: { fr: 'Équipe', en: 'Team', ar: 'الفريق' }, av: initials, cat, limit, used: 0, kind: 'virtual', frozen: false, hue: 'var(--atlas)' });
      m.close();
      render();
      confetti && confetti();
      toast(pick(T.tNewCard), { type: 'success', desc: pick(T.tNewCardD) });
    };
  };

  /* Re-render on language change while the page is open. */
  window.addEventListener('kiwi:langchange', () => {
    if (window.Kiwi && window.Kiwi.activePage === 'depenses') render();
  });

  /* Re-render when the venue changes while the page is open — so picking
   * « Go Ultra » (→ fusion) or drilling into a site repaints in place.
   * KiwiVenue may not exist yet at module load; retry until it does. */
  (function hookVenue() {
    if (window.KiwiVenue && window.KiwiVenue.subscribe) {
      window.KiwiVenue.subscribe(() => {
        if (window.Kiwi && window.Kiwi.activePage === 'depenses') render();
      });
    } else { setTimeout(hookVenue, 50); }
  })();
})();
