/* ═══════════════════════════════════════════════════════════════════════
 *  KIWI · FIRST-RUN ONBOARDING  (assets/onboarding.js)
 *
 *  A warm, guided setup that runs BEFORE the merchant ever sees a dashboard.
 *  We don't know who the client is yet — so instead of greeting "Bonjour
 *  Rachid" and showing Café Atlas, we ask. The flow gathers:
 *    · who they are (first name — used to greet them by name afterwards)
 *    · their business (name + trade)
 *    · how many établissements + which city
 *    · how big the team is
 *    · what they care about (goals)  — skippable
 *    · up to 4 team access codes (owner / manager / staff / +1)
 *      -> these become REAL PIN codes: the lock screen validates against them
 *         and switches role (owner = full, manager = no money, staff = ops).
 *
 *  Everything after the business name is optional and skippable, so nobody
 *  feels trapped. On finish it creates a fresh, empty venue (via KiwiVenue),
 *  persists the answers to localStorage, and reveals the dashboard.
 *
 *  Triggers:
 *    · Automatic on genuine first run (no `kiwiOnboarded`, no custom venue).
 *    · Manually via PIN 0000 (Kiwi.handlers['onboard']) or KiwiOnboarding.open().
 *    · Force with ?onboarding  ·  skip with ?demo  ·  KiwiOnboarding.reset().
 *
 *  All interpolated user values pass through esc() — same trusted-HTML
 *  contract as interactive.js modal/drawer bodies. Vanilla, self-contained.
 * ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ── i18n · captured from the app's language choice ──────────────────── */
  const lang = () => { try { return localStorage.getItem('kiwiLang') || 'fr'; } catch (_) { return 'fr'; } };
  const tr = (o) => (o == null ? '' : (o[lang()] ?? o.fr ?? ''));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const LS = {
    get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (_) {} },
    del(k) { try { localStorage.removeItem(k); } catch (_) {} },
  };

  /* ── Trades — the visible label maps to one of 3 data verticals (`base`).
   *    Mirrors the set used elsewhere so a created venue behaves correctly. ── */
  const ic = (p) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
  const TYPES = [
    { id: 'restaurant', base: 'restaurant', primary: true, label: { fr: 'Restaurant', en: 'Restaurant', ar: 'مطعم' }, icon: ic('<path d="M3 3v6a2 2 0 002 2h1v10M6 11V3M11 3c-1 0-2 1.6-2 4s1 4 2 4 2-1.6 2-4-1-4-2-4zM11 11v10"/>') },
    { id: 'cafe', base: 'restaurant', primary: true, label: { fr: 'Café / Salon de thé', en: 'Café / Tea room', ar: 'مقهى' }, icon: ic('<path d="M17 8h1a4 4 0 010 8h-1"/><path d="M3 8h14v9a4 4 0 01-4 4H7a4 4 0 01-4-4z"/><path d="M6 2v2.5M10 2v2.5M14 2v2.5"/>') },
    { id: 'boutique', base: 'boutique', primary: true, label: { fr: 'Boutique', en: 'Shop', ar: 'متجر' }, icon: ic('<path d="M6 2 3 6v13a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 01-8 0"/>') },
    { id: 'spa', base: 'spa', primary: true, label: { fr: 'Spa / Bien-être', en: 'Spa / Wellness', ar: 'سبا' }, icon: ic('<path d="M11 20A7 7 0 019.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10z"/><path d="M2 21c0-3 1.85-5.36 5.08-6"/>') },
    { id: 'fastfood', base: 'restaurant', label: { fr: 'Fast-food / Snack', en: 'Fast food', ar: 'وجبات سريعة' }, icon: ic('<path d="M3 11a9 9 0 0118 0"/><path d="M2 15h20"/><path d="M5 19h14a2 2 0 002-2H3a2 2 0 002 2z"/><path d="M7.5 7.6h.01M12 6.6h.01M16.5 7.6h.01"/>') },
    { id: 'bakery', base: 'restaurant', label: { fr: 'Boulangerie / Pâtisserie', en: 'Bakery', ar: 'مخبزة' }, icon: ic('<path d="M4 13a8 4.5 0 0116 0v4.5A1.5 1.5 0 0118.5 19h-13A1.5 1.5 0 014 17.5z"/><path d="M9.5 13.5v5M14.5 13.5v5"/>') },
    { id: 'pizzeria', base: 'restaurant', label: { fr: 'Pizzeria', en: 'Pizzeria', ar: 'بيتزيريا' }, icon: ic('<path d="M3 7l9 14 9-14z"/><path d="M3 7a30 30 0 0118 0"/><path d="M9.5 11h.01M13 13.5h.01M11 16.5h.01"/>') },
    { id: 'foodtruck', base: 'restaurant', label: { fr: 'Food truck', en: 'Food truck', ar: 'شاحنة طعام' }, icon: ic('<path d="M14 17V6a1 1 0 00-1-1H3a1 1 0 00-1 1v11h2"/><path d="M14 9h4l4 4v4h-2"/><path d="M9 17h2"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>') },
    { id: 'epicerie', base: 'boutique', label: { fr: 'Épicerie / Superette', en: 'Grocery', ar: 'بقالة' }, icon: ic('<path d="M3 4h2l2.6 11.4a1 1 0 001 .8h8.8a1 1 0 001-.8L21 8H6"/><circle cx="9" cy="20" r="1.6"/><circle cx="17" cy="20" r="1.6"/>') },
    { id: 'pharmacie', base: 'boutique', label: { fr: 'Pharmacie', en: 'Pharmacy', ar: 'صيدلية' }, icon: ic('<path d="M9.5 3h5a1 1 0 011 1v4.5H20a1 1 0 011 1v5a1 1 0 01-1 1h-4.5V20a1 1 0 01-1 1h-5a1 1 0 01-1-1v-4.5H4a1 1 0 01-1-1v-5a1 1 0 011-1h4.5V4a1 1 0 011-1z"/>') },
    { id: 'fleuriste', base: 'boutique', label: { fr: 'Fleuriste', en: 'Florist', ar: 'محل أزهار' }, icon: ic('<path d="M12 22V12"/><path d="M12 12C9 12 7 9.5 7 6c4 0 5 2.5 5 6z"/><path d="M12 12c3 0 5-2.5 5-6-4 0-5 2.5-5 6z"/><path d="M8 22h8"/>') },
    { id: 'coiffure', base: 'spa', label: { fr: 'Salon de coiffure', en: 'Hair salon', ar: 'صالون حلاقة' }, icon: ic('<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4 8.12 15.88"/><path d="M14.47 14.48 20 20"/><path d="M8.12 8.12 12 12"/>') },
    { id: 'sport', base: 'spa', label: { fr: 'Salle de sport', en: 'Gym', ar: 'قاعة رياضية' }, icon: ic('<path d="M4 9v6M7 7v10M17 7v10M20 9v6M7 12h10"/>') },
    { id: 'autre', base: 'boutique', label: { fr: 'Autre activité', en: 'Something else', ar: 'نشاط آخر' }, icon: ic('<circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/>') },
  ];

  /* ── What matters to them — informs which modules we surface first ────── */
  const GOALS = [
    { id: 'sales', label: { fr: 'Augmenter mes ventes', en: 'Grow my sales', ar: 'زيادة مبيعاتي' }, icon: ic('<path d="M3 17l6-6 4 4 8-8"/><path d="M17 7h4v4"/>') },
    { id: 'time', label: { fr: 'Gagner du temps', en: 'Save time', ar: 'توفير الوقت' }, icon: ic('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>') },
    { id: 'theft', label: { fr: 'Réduire les pertes & le vol', en: 'Cut losses & theft', ar: 'تقليل الخسائر والسرقة' }, icon: ic('<path d="M12 3l7 4v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V7z"/><path d="M9.5 12l2 2 3.5-4"/>') },
    { id: 'margins', label: { fr: 'Comprendre mes marges', en: 'Understand my margins', ar: 'فهم هوامشي' }, icon: ic('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>') },
    { id: 'stock', label: { fr: 'Mieux gérer mon stock', en: 'Manage my stock', ar: 'إدارة مخزوني' }, icon: ic('<path d="M3 7l9-4 9 4-9 4-9-4z"/><path d="M3 7v10l9 4 9-4V7"/><path d="M12 11v10"/>') },
    { id: 'loyalty', label: { fr: 'Fidéliser mes clients', en: 'Keep customers loyal', ar: 'كسب ولاء العملاء' }, icon: ic('<path d="M12 21C5 14 3 11 3 8a4 4 0 017.5-2A4 4 0 0121 8c0 3-2 6-9 13z"/>') },
    { id: 'remote', label: { fr: 'Piloter à distance', en: 'Manage remotely', ar: 'الإدارة عن بعد' }, icon: ic('<rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>') },
    { id: 'multi', label: { fr: 'Gérer plusieurs points de vente', en: 'Run multiple locations', ar: 'إدارة عدة نقاط بيع' }, icon: ic('<path d="M9 22V12h6v10"/><path d="M3 10l9-7 9 7v10a1 1 0 01-1 1H4a1 1 0 01-1-1z"/>') },
  ];

  /* ── Team access rows offered in the PIN step ─────────────────────────── */
  const ACCESS = [
    { role: 'owner',   fixed: true,  title: { fr: 'Vous · propriétaire', en: 'You · owner', ar: 'أنت · المالك' },       perm: { fr: 'Accès complet, finances, paie, tout.', en: 'Full access, finances, payroll, everything.', ar: 'وصول كامل.' } },
    { role: 'manager', fixed: false, title: { fr: 'Responsable / gérant', en: 'Manager', ar: 'المسؤول' },                perm: { fr: 'Tout sauf finances, marges & paie.', en: 'Everything except finances, margins & payroll.', ar: 'كل شيء ما عدا المالية.' } },
    { role: 'staff',   fixed: false, title: { fr: 'Équipe / caissier', en: 'Staff / cashier', ar: 'الفريق' },            perm: { fr: 'Caisse, commandes & salle uniquement.', en: 'Register, orders & floor only.', ar: 'الصندوق والطلبات فقط.' } },
    { role: 'staff',   fixed: false, title: { fr: 'Accès supplémentaire', en: 'Extra access', ar: 'وصول إضافي' },        perm: { fr: 'Caisse & commandes.', en: 'Register & orders.', ar: 'الصندوق والطلبات.' }, extra: true },
  ];
  const RESERVED = ['0000', '0505', '1111', '0909']; // demo codes — keep them free

  /* ── Session state ───────────────────────────────────────────────────── */
  const S = {
    step: 0,
    ownerName: '', bizName: '', typeId: 'restaurant',
    venueCount: 1, city: '',
    teamSize: 3,
    goals: [], dailyGoal: '',
    pins: [ { role: 'owner', name: '', code: '' }, { role: 'manager', name: '', code: '' }, { role: 'staff', name: '', code: '' }, { role: 'staff', name: '', code: '' } ],
  };
  const TOTAL = 6; // counted steps (welcome + finish are bookends)
  let root = null, injected = false, opened = false;

  /* ── Styles (scoped .kob-) ───────────────────────────────────────────── */
  function inject() {
    if (injected) return; injected = true;
    const css = `
    .kob-root{position:fixed;inset:0;z-index:100000;display:flex;align-items:center;justify-content:center;
      padding:24px;color:var(--paper);opacity:0;transition:opacity .5s cubic-bezier(.32,.72,0,1);
      background:radial-gradient(80% 60% at 28% 16%,rgba(125,242,176,.12),transparent 60%),
                 radial-gradient(70% 55% at 78% 88%,rgba(11,110,79,.24),transparent 62%),
                 linear-gradient(135deg,#0A1612,#0A0F0D);}
    .kob-root.kob-in{opacity:1;}
    .kob-root.kob-out{opacity:0;transform:scale(1.02);pointer-events:none;}
    .kob-card{width:100%;max-width:560px;max-height:calc(100vh - 48px);display:flex;flex-direction:column;
      background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.09);border-radius:26px;
      padding:30px 32px 26px;box-shadow:0 40px 90px -30px rgba(0,0,0,.6);-webkit-backdrop-filter:blur(18px) saturate(1.1);backdrop-filter:blur(18px) saturate(1.1);}
    /* Liquid Glass — real refraction when assets/liquid-glass.js is present and enabled.
       Same fill/blur (legibility preserved); only adds the #kiwi-lg displacement. Inert otherwise. */
    @supports ((-webkit-backdrop-filter:url("#k")) or (backdrop-filter:url("#k"))){
      html[data-kiwi-glass="on"] .kob-card{-webkit-backdrop-filter:url(#kiwi-lg) blur(18px) saturate(1.1);backdrop-filter:url(#kiwi-lg) blur(18px) saturate(1.1);}
    }
    .kob-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:22px;min-height:24px;}
    .kob-brand{font-family:var(--sans);font-weight:600;font-size:19px;letter-spacing:-.03em;display:inline-flex;align-items:center;}
    .kob-brand i{width:6px;height:6px;border-radius:50%;background:var(--mint);display:inline-block;margin-left:3px;transform:translateY(1px);}
    .kob-rail{display:flex;gap:6px;align-items:center;}
    .kob-rail b{width:20px;height:4px;border-radius:2px;background:rgba(255,255,255,.16);transition:background .3s,width .3s;display:block;}
    .kob-rail b.on{background:var(--mint);width:30px;}
    .kob-rail b.done{background:rgba(125,242,176,.55);}
    .kob-body{overflow-y:auto;overflow-x:hidden;flex:1;margin:-4px -6px 0;padding:4px 6px 2px;}
    .kob-body::-webkit-scrollbar{width:7px;}.kob-body::-webkit-scrollbar-thumb{background:rgba(255,255,255,.14);border-radius:6px;}
    .kob-eyebrow{font-family:var(--mono);font-size:10.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--mint);margin:0 0 12px;}
    .kob-h{font-family:var(--serif);font-style:italic;font-weight:400;font-size:clamp(30px,5vw,42px);line-height:1.04;letter-spacing:-.01em;margin:0 0 10px;color:#fff;}
    .kob-h .k-sans{font-family:var(--sans);font-style:normal;font-weight:600;letter-spacing:-.02em;}
    .kob-sub{font-size:14.5px;line-height:1.55;color:rgba(233,239,233,.72);margin:0 0 22px;max-width:44ch;}
    .kob-anim{animation:kob-rise .44s cubic-bezier(.32,.72,0,1) both;}
    @keyframes kob-rise{from{opacity:0;transform:translateY(14px);}to{opacity:1;transform:none;}}
    .kob-field{width:100%;box-sizing:border-box;font-family:var(--sans);font-size:16px;color:#fff;
      background:rgba(255,255,255,.06);border:1.5px solid rgba(255,255,255,.14);border-radius:14px;padding:15px 16px;outline:none;
      transition:border-color .16s,background .16s;}
    .kob-field::placeholder{color:rgba(233,239,233,.4);}
    .kob-field:focus{border-color:var(--mint);background:rgba(255,255,255,.09);}
    .kob-lbl{display:block;font-size:12.5px;font-weight:500;color:rgba(233,239,233,.62);margin:16px 0 7px;letter-spacing:.005em;}
    .kob-lbl .opt{color:rgba(233,239,233,.4);font-weight:400;}
    .kob-types{display:grid;grid-template-columns:repeat(3,1fr);gap:9px;}
    .kob-type{display:flex;flex-direction:column;align-items:center;gap:8px;padding:15px 8px;cursor:pointer;text-align:center;
      background:rgba(255,255,255,.045);border:1.5px solid rgba(255,255,255,.1);border-radius:15px;
      font-family:var(--sans);font-size:12px;font-weight:500;color:rgba(233,239,233,.82);transition:border-color .14s,background .14s,transform .14s;}
    .kob-type svg{width:23px;height:23px;color:rgba(233,239,233,.7);transition:color .14s;}
    .kob-type:hover{border-color:rgba(255,255,255,.28);transform:translateY(-1px);}
    .kob-type.sel{border-color:var(--mint);background:rgba(125,242,176,.13);color:#fff;}
    .kob-type.sel svg{color:var(--mint);}
    .kob-type.hide{display:none;}
    .kob-more{margin-top:10px;width:100%;padding:11px;cursor:pointer;background:transparent;border:1.5px dashed rgba(255,255,255,.2);
      border-radius:13px;font-family:var(--sans);font-size:13px;font-weight:500;color:rgba(233,239,233,.72);transition:border-color .14s,color .14s;}
    .kob-more:hover{border-color:var(--mint);color:var(--mint);}
    .kob-step{display:flex;align-items:center;gap:14px;justify-content:center;margin:6px 0 4px;}
    .kob-step button{width:52px;height:52px;border-radius:50%;cursor:pointer;font-size:26px;line-height:1;color:#fff;
      background:rgba(255,255,255,.07);border:1.5px solid rgba(255,255,255,.16);transition:background .14s,border-color .14s,transform .1s;
      display:flex;align-items:center;justify-content:center;}
    .kob-step button:hover{background:rgba(255,255,255,.13);border-color:var(--mint);}
    .kob-step button:active{transform:scale(.92);}
    .kob-step .kob-num{min-width:96px;text-align:center;font-family:var(--sans);font-weight:600;font-size:46px;letter-spacing:-.03em;font-feature-settings:'tnum' 1;color:#fff;}
    .kob-step .kob-num small{display:block;font-size:12px;font-weight:500;letter-spacing:.02em;color:rgba(233,239,233,.5);margin-top:2px;}
    .kob-chips{display:flex;flex-wrap:wrap;gap:9px;}
    .kob-chip{display:inline-flex;align-items:center;gap:8px;padding:11px 15px 11px 13px;cursor:pointer;
      background:rgba(255,255,255,.05);border:1.5px solid rgba(255,255,255,.12);border-radius:13px;
      font-family:var(--sans);font-size:13.5px;font-weight:500;color:rgba(233,239,233,.85);transition:border-color .14s,background .14s;}
    .kob-chip svg{width:17px;height:17px;color:rgba(233,239,233,.6);transition:color .14s;}
    .kob-chip:hover{border-color:rgba(255,255,255,.3);}
    .kob-chip.sel{border-color:var(--mint);background:rgba(125,242,176,.13);color:#fff;}
    .kob-chip.sel svg{color:var(--mint);}
    .kob-chip .tick{width:16px;height:16px;opacity:0;transition:opacity .14s;}
    .kob-chip.sel .tick{opacity:1;}
    .kob-access{display:flex;flex-direction:column;gap:11px;}
    .kob-acc{background:rgba(255,255,255,.045);border:1.5px solid rgba(255,255,255,.1);border-radius:16px;padding:14px 15px;transition:border-color .16s,background .16s;}
    .kob-acc.filled{border-color:rgba(125,242,176,.42);background:rgba(125,242,176,.05);}
    .kob-acc-hd{display:flex;align-items:baseline;justify-content:space-between;gap:10px;margin-bottom:10px;}
    .kob-acc-ttl{font-family:var(--sans);font-weight:600;font-size:14.5px;color:#fff;letter-spacing:-.01em;}
    .kob-acc-perm{font-size:11.5px;color:rgba(233,239,233,.52);line-height:1.4;margin-top:2px;}
    .kob-acc-tag{font-family:var(--mono);font-size:9.5px;letter-spacing:.1em;text-transform:uppercase;padding:3px 8px;border-radius:99px;white-space:nowrap;
      background:rgba(125,242,176,.14);color:var(--mint);}
    .kob-acc-tag.req{background:rgba(217,154,43,.16);color:#f0c46a;}
    .kob-acc-row{display:flex;gap:9px;}
    .kob-acc-row .kob-field{padding:11px 13px;font-size:14px;}
    .kob-name{flex:1.3;}
    .kob-code{flex:1;font-family:var(--mono);letter-spacing:.42em;text-align:center;font-size:17px;padding-right:8px;}
    .kob-code::placeholder{letter-spacing:.28em;}
    .kob-role{flex:1;padding:10px 34px 10px 13px;font-size:14px;appearance:none;-webkit-appearance:none;cursor:pointer;
      background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23e9efe9' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 12px center;}
    .kob-role option{color:#0A0F0D;}
    .kob-acc-rm{background:none;border:0;cursor:pointer;color:rgba(233,239,233,.5);font-size:24px;line-height:1;width:34px;height:34px;border-radius:9px;flex:none;margin-left:8px;transition:color .14s,background .14s;}
    .kob-acc-rm:hover{color:#ffb3a3;background:rgba(255,255,255,.07);}
    .kob-acc-add{margin-top:11px;width:100%;padding:12px;cursor:pointer;background:transparent;border:1.5px dashed rgba(255,255,255,.2);
      border-radius:13px;font-family:var(--sans);font-size:13.5px;font-weight:500;color:rgba(233,239,233,.72);transition:border-color .14s,color .14s;}
    .kob-acc-add:hover{border-color:var(--mint);color:var(--mint);}
    .kob-foot{display:flex;gap:10px;align-items:center;margin-top:20px;flex-wrap:wrap;}
    .kob-btn{font-family:var(--sans);font-weight:600;font-size:15px;cursor:pointer;border:0;border-radius:14px;padding:15px 22px;
      transition:transform .12s,box-shadow .2s,background .16s;display:inline-flex;align-items:center;justify-content:center;gap:7px;}
    .kob-btn.primary{flex:1;color:#06231a;background:linear-gradient(135deg,#9dfbc4,var(--mint));box-shadow:0 14px 30px -12px rgba(125,242,176,.6);}
    .kob-btn.primary:hover{transform:translateY(-1px);box-shadow:0 18px 36px -12px rgba(125,242,176,.7);}
    .kob-btn.primary:active{transform:translateY(0);}
    .kob-btn.ghost{background:rgba(255,255,255,.06);color:rgba(233,239,233,.82);border:1.5px solid rgba(255,255,255,.14);}
    .kob-btn.ghost:hover{background:rgba(255,255,255,.11);color:#fff;}
    .kob-back{background:none;border:0;cursor:pointer;color:rgba(233,239,233,.55);font-family:var(--sans);font-size:13.5px;font-weight:500;
      padding:8px 4px;display:inline-flex;align-items:center;gap:5px;transition:color .14s;}
    .kob-back:hover{color:#fff;}
    .kob-skip{background:none;border:0;cursor:pointer;color:rgba(233,239,233,.5);font-family:var(--sans);font-size:13px;font-weight:500;text-decoration:underline;text-underline-offset:3px;padding:8px;transition:color .14s;}
    .kob-skip:hover{color:rgba(233,239,233,.85);}
    .kob-err{color:#ffb3a3;font-size:12.5px;margin:9px 2px 0;min-height:1px;}
    .kob-explore{text-align:center;margin-top:16px;}
    .kob-recap{display:flex;flex-direction:column;gap:1px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:16px;overflow:hidden;margin:2px 0 6px;}
    .kob-recap .r{display:flex;justify-content:space-between;gap:14px;padding:12px 15px;font-size:13.5px;}
    .kob-recap .r+.r{border-top:1px solid rgba(255,255,255,.07);}
    .kob-recap .r span{color:rgba(233,239,233,.55);}
    .kob-recap .r b{color:#fff;font-weight:600;text-align:right;}
    .kob-hero-mark{width:60px;height:60px;border-radius:18px;background:linear-gradient(140deg,var(--atlas),var(--riad));
      display:flex;align-items:center;justify-content:center;margin:0 0 22px;box-shadow:0 12px 30px -10px rgba(11,110,79,.8);}
    .kob-hero-mark svg{width:32px;height:32px;}
    .kob-celebrate{text-align:center;padding:12px 0;}
    .kob-celebrate .kob-hero-mark{margin:0 auto 22px;animation:kob-pop .5s cubic-bezier(.34,1.45,.5,1) both;}
    @keyframes kob-pop{from{opacity:0;transform:scale(.4);}to{opacity:1;transform:none;}}
    @media (max-width:560px){
      .kob-card{padding:24px 20px 20px;border-radius:22px;}
      .kob-types{grid-template-columns:repeat(2,1fr);}
      .kob-acc-row{flex-direction:column;}
      .kob-h{font-size:30px;}
    }
    html[dir="rtl"] .kob-sub{margin-left:auto;}
    @media (prefers-reduced-motion:reduce){.kob-anim,.kob-celebrate .kob-hero-mark{animation:none;}.kob-root{transition:none;}}
    `;
    const s = document.createElement('style'); s.id = 'kob-style'; s.textContent = css;
    document.head.appendChild(s);
  }

  /* ── Rail ────────────────────────────────────────────────────────────── */
  function rail() {
    let b = '';
    for (let i = 1; i <= TOTAL; i++) {
      const cls = i < S.step ? 'done' : (i === S.step ? 'on' : '');
      b += `<b class="${cls}"></b>`;
    }
    return `<div class="kob-rail" aria-hidden="true">${b}</div>`;
  }

  /* ── Shared bits ─────────────────────────────────────────────────────── */
  function unitFor(field) {
    const v = S[field];
    return field === 'venueCount'
      ? tr({ fr: v > 1 ? 'établissements' : 'établissement', en: v > 1 ? 'locations' : 'location', ar: 'محل' })
      : tr({ fr: v > 1 ? 'personnes' : 'personne', en: v > 1 ? 'people' : 'person', ar: 'أشخاص' });
  }
  function stepper(field, min, max) {
    return `
      <div class="kob-step" data-stepper="${field}" data-min="${min}" data-max="${max}">
        <button type="button" data-inc="-1" aria-label="moins">&minus;</button>
        <div class="kob-num" data-stepval>${S[field]}<small>${unitFor(field)}</small></div>
        <button type="button" data-inc="1" aria-label="plus">+</button>
      </div>`;
  }
  function footNav(o) {
    o = o || {};
    return `
      <button class="kob-back" data-go="back">&lsaquo; ${tr({ fr: 'Retour', en: 'Back', ar: 'رجوع' })}</button>
      ${o.skip ? `<button class="kob-skip" data-go="next" data-skip>${tr({ fr: 'Passer', en: 'Skip', ar: 'تخطّي' })}</button>` : ''}
      <button class="kob-btn primary" data-go="next">${esc(o.nextLabel || tr({ fr: 'Continuer', en: 'Continue', ar: 'متابعة' }))}</button>`;
  }

  /* ── Step renderers — each returns {body, foot} HTML ─────────────────── */
  function stepWelcome() {
    return {
      body: `
        <div class="kob-anim">
          <div class="kob-hero-mark"><svg viewBox="0 0 24 24" fill="none"><path d="M12 3C7 5 5 9 5 13a7 7 0 0 0 14 0c0-4-2-8-7-10Z" fill="#7DF2B0"/><path d="M12 6.5c-2.6 1.3-3.8 3.8-3.8 6.5" stroke="#053B2C" stroke-width="1.5" stroke-linecap="round"/></svg></div>
          <p class="kob-eyebrow">${tr({ fr: 'Bienvenue sur Kiwi', en: 'Welcome to Kiwi', ar: 'مرحباً بك في كيوي' })}</p>
          <h1 class="kob-h">${tr({ fr: 'On met tout en place <span class="k-sans">ensemble.</span>', en: "Let's set it all up <span class=\"k-sans\">together.</span>", ar: 'لنُهيّئ كل شيء <span class="k-sans">معاً.</span>' })}</h1>
          <p class="kob-sub">${tr({
            fr: "Quelques questions rapides, moins de 2 minutes, et votre espace est prêt, à votre nom, avec votre équipe. Rien n'est définitif : tout se modifie plus tard.",
            en: 'A few quick questions, under 2 minutes, and your space is ready, in your name, with your team. Nothing is final: everything can change later.',
            ar: 'بضعة أسئلة سريعة, أقل من دقيقتين, وتكون مساحتك جاهزة. لا شيء نهائي؛ كل شيء قابل للتعديل لاحقاً.' })}</p>
        </div>`,
      foot: `
        <button class="kob-btn primary" data-go="next">${tr({ fr: 'Commencer', en: 'Get started', ar: 'لنبدأ' })}</button>
        ${(window.KiwiEnv && window.KiwiEnv.isReal && window.KiwiEnv.isReal()) ? '' : `<div class="kob-explore" style="flex-basis:100%;"><button class="kob-skip" data-explore>${tr({ fr: "Explorer la démo d'abord", en: 'Explore the demo first', ar: 'استكشاف العرض أولاً' })}</button></div>`}`,
    };
  }

  function stepName() {
    return {
      body: `
        <div class="kob-anim">
          <p class="kob-eyebrow">${tr({ fr: 'Faisons connaissance', en: "Let's meet", ar: 'لنتعارف' })}</p>
          <h1 class="kob-h">${tr({ fr: 'Comment vous appelez-vous ?', en: 'What should we call you?', ar: 'ما اسمك؟' })}</h1>
          <p class="kob-sub">${tr({ fr: 'Juste votre prénom, pour vous accueillir par votre nom chaque matin.', en: 'Just your first name, so we can greet you by name every morning.', ar: 'اسمك الأول فقط, لنرحّب بك كل صباح.' })}</p>
          <input class="kob-field" data-f="ownerName" type="text" value="${esc(S.ownerName)}" maxlength="24" placeholder="${tr({ fr: 'Ex. Rachid', en: 'e.g. Rachid', ar: 'مثال: رشيد' })}" autocomplete="given-name"/>
        </div>`,
      foot: footNav({}),
    };
  }

  function typeCard(t, hidden) {
    return `<button class="kob-type${t.id === S.typeId ? ' sel' : ''}${hidden ? ' hide kob-xtra' : ''}" data-type="${t.id}">${t.icon}<span>${esc(tr(t.label))}</span></button>`;
  }
  function stepBusiness() {
    const prim = TYPES.filter((t) => t.primary);
    const more = TYPES.filter((t) => !t.primary);
    return {
      body: `
        <div class="kob-anim">
          <p class="kob-eyebrow">${tr({ fr: 'Votre affaire', en: 'Your business', ar: 'نشاطك' })}</p>
          <h1 class="kob-h">${tr({ fr: 'Parlez-nous de votre affaire.', en: 'Tell us about your business.', ar: 'حدّثنا عن نشاطك.' })}</h1>
          <label class="kob-lbl">${tr({ fr: "Nom de l'établissement", en: 'Business name', ar: 'اسم النشاط' })}</label>
          <input class="kob-field" data-f="bizName" type="text" value="${esc(S.bizName)}" maxlength="40" placeholder="${tr({ fr: 'Ex. Café des Oudayas', en: 'e.g. Oudayas Café', ar: 'مثال: مقهى الأوداية' })}"/>
          <label class="kob-lbl">${tr({ fr: "Type d'activité", en: 'Type of business', ar: 'نوع النشاط' })}</label>
          <div class="kob-types">
            ${prim.map((t) => typeCard(t)).join('')}
            ${more.map((t) => typeCard(t, true)).join('')}
          </div>
          <button class="kob-more" data-more>${tr({ fr: '+ Voir plus de types', en: '+ More types', ar: '+ المزيد من الأنواع' })} (${more.length})</button>
        </div>`,
      foot: footNav({}),
    };
  }

  function stepPlaces() {
    return {
      body: `
        <div class="kob-anim">
          <p class="kob-eyebrow">${tr({ fr: 'Vos points de vente', en: 'Your locations', ar: 'نقاط بيعك' })}</p>
          <h1 class="kob-h">${tr({ fr: "Combien d'établissements gérez-vous ?", en: 'How many locations do you run?', ar: 'كم عدد المحلات التي تديرها؟' })}</h1>
          <p class="kob-sub">${tr({ fr: "Un seul aujourd'hui ? Parfait. Kiwi grandit avec vous quand vous en ouvrez d'autres.", en: 'Just one today? Perfect. Kiwi grows with you as you open more.', ar: 'واحد اليوم؟ ممتاز. ينمو كيوي معك.' })}</p>
          ${stepper('venueCount', 1, 60)}
          <label class="kob-lbl">${tr({ fr: 'Ville principale', en: 'Main city', ar: 'المدينة الرئيسية' })} <span class="opt">· ${tr({ fr: 'optionnel', en: 'optional', ar: 'اختياري' })}</span></label>
          <input class="kob-field" data-f="city" type="text" value="${esc(S.city)}" maxlength="30" placeholder="${tr({ fr: 'Ex. Rabat', en: 'e.g. Rabat', ar: 'مثال: الرباط' })}"/>
        </div>`,
      foot: footNav({}),
    };
  }

  function stepTeam() {
    return {
      body: `
        <div class="kob-anim">
          <p class="kob-eyebrow">${tr({ fr: 'Votre équipe', en: 'Your team', ar: 'فريقك' })}</p>
          <h1 class="kob-h">${tr({ fr: 'Vous êtes combien à travailler ici ?', en: 'How many of you work here?', ar: 'كم عدد العاملين لديك؟' })}</h1>
          <p class="kob-sub">${tr({ fr: "Vous compris. On s'en sert pour préparer la paie, le planning et les accès, sans engagement.", en: 'You included. We use it to prepare payroll, scheduling and access, no commitment.', ar: 'أنت من ضمنهم. نستخدمه لتحضير الرواتب والجدولة والوصول.' })}</p>
          ${stepper('teamSize', 1, 200)}
        </div>`,
      foot: footNav({ skip: true }),
    };
  }

  function stepGoals() {
    return {
      body: `
        <div class="kob-anim">
          <p class="kob-eyebrow">${tr({ fr: 'Vos priorités', en: 'Your priorities', ar: 'أولوياتك' })}</p>
          <h1 class="kob-h">${tr({ fr: "Qu'est-ce qui compte le plus ?", en: 'What matters most to you?', ar: 'ما الأهم بالنسبة لك؟' })}</h1>
          <p class="kob-sub">${tr({ fr: "Choisissez ce qui vous parle, on met en avant les bons outils pour vous. Plusieurs choix possibles.", en: "Pick what speaks to you, we'll surface the right tools. Choose as many as you like.", ar: 'اختر ما يناسبك, سنُبرز الأدوات المناسبة. يمكن اختيار أكثر من واحد.' })}</p>
          <div class="kob-chips">
            ${GOALS.map((g) => `<button class="kob-chip${S.goals.includes(g.id) ? ' sel' : ''}" data-goal="${g.id}">${g.icon}<span>${esc(tr(g.label))}</span><svg class="tick" viewBox="0 0 24 24" fill="none" stroke="var(--mint)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg></button>`).join('')}
          </div>
          <label class="kob-lbl">${tr({ fr: "Objectif de chiffre d'affaires par jour", en: 'Daily revenue target', ar: 'هدف الإيرادات اليومية' })} <span class="opt">· ${tr({ fr: 'optionnel', en: 'optional', ar: 'اختياري' })}</span></label>
          <input class="kob-field" data-f="dailyGoal" type="number" inputmode="numeric" min="0" value="${esc(S.dailyGoal)}" placeholder="${tr({ fr: 'Ex. 5000 MAD', en: 'e.g. 5000 MAD', ar: 'مثال: 5000 درهم' })}"/>
        </div>`,
      foot: footNav({ skip: true }),
    };
  }

  /* Role → label/permission metadata, reused for dynamically-added rows. */
  function roleMeta(role) {
    return role === 'owner' ? ACCESS[0] : (role === 'manager' ? ACCESS[1] : ACCESS[2]);
  }
  function accessRow(i) {
    const p = S.pins[i] || { role: 'staff', name: '', code: '' };
    const isOwner = i === 0 || p.role === 'owner';
    const a = roleMeta(isOwner ? 'owner' : p.role);
    const nameVal = p.name || (isOwner ? S.ownerName.trim() : '');
    const filled = /^\d{4}$/.test(p.code);
    const head = isOwner
      ? `<div>
            <div class="kob-acc-ttl">${esc(tr(a.title))}</div>
            <div class="kob-acc-perm">${esc(tr(a.perm))}</div>
         </div>
         <span class="kob-acc-tag req">${tr({ fr: 'Requis', en: 'Required', ar: 'إلزامي' })}</span>`
      : `<select class="kob-field kob-role" data-pin-role="${i}" aria-label="${tr({ fr: 'Rôle', en: 'Role', ar: 'الدور' })}">
            <option value="manager"${p.role === 'manager' ? ' selected' : ''}>${tr({ fr: 'Responsable / gérant', en: 'Manager', ar: 'المسؤول' })}</option>
            <option value="staff"${p.role !== 'manager' ? ' selected' : ''}>${tr({ fr: 'Équipe / caissier', en: 'Staff / cashier', ar: 'الفريق' })}</option>
         </select>
         <button type="button" class="kob-acc-rm" data-pin-remove="${i}" aria-label="${tr({ fr: 'Retirer', en: 'Remove', ar: 'حذف' })}">&times;</button>`;
    return `
      <div class="kob-acc${filled ? ' filled' : ''}" data-acc="${i}">
        <div class="kob-acc-hd">${head}</div>
        ${isOwner ? '' : `<div class="kob-acc-perm" style="margin:-4px 0 10px;">${esc(tr(a.perm))}</div>`}
        <div class="kob-acc-row">
          <input class="kob-field kob-name" type="text" data-pin-name="${i}" value="${esc(nameVal)}" maxlength="20" placeholder="${isOwner ? tr({ fr: 'Votre prénom', en: 'Your name', ar: 'اسمك' }) : tr({ fr: 'Prénom (ex. Salma)', en: 'Name (e.g. Salma)', ar: 'الاسم' })}"/>
          <input class="kob-field kob-code" data-pin-code="${i}" value="${esc(p.code)}" inputmode="numeric" maxlength="4" placeholder="&bull;&bull;&bull;&bull;" aria-label="Code"/>
        </div>
      </div>`;
  }
  function stepAccess() {
    return {
      body: `
        <div class="kob-anim">
          <p class="kob-eyebrow">${tr({ fr: "Accès de l'équipe", en: 'Team access', ar: 'وصول الفريق' })}</p>
          <h1 class="kob-h">${tr({ fr: 'Les codes de votre équipe.', en: "Your team's access codes.", ar: 'رموز دخول فريقك.' })}</h1>
          <p class="kob-sub">${tr({ fr: "Chaque personne entre son code à 4 chiffres pour ouvrir Kiwi, et ne voit que ce qui la concerne. Le vôtre est le seul obligatoire.", en: 'Each person enters their 4-digit code to open Kiwi, and only sees what concerns them. Only yours is required.', ar: 'يُدخل كل شخص رمزه المكوّن من 4 أرقام, ويرى فقط ما يخصه. رمزك وحده إلزامي.' })}</p>
          <div class="kob-access">
            ${S.pins.map((p, i) => accessRow(i)).join('')}
          </div>
          <button type="button" class="kob-acc-add" data-pin-add>${tr({ fr: '+ Ajouter un membre', en: '+ Add a member', ar: '+ إضافة عضو' })}</button>
          <div class="kob-err" data-acc-err></div>
        </div>`,
      foot: footNav({ nextLabel: tr({ fr: 'Presque fini →', en: 'Almost done →', ar: 'اقتربنا →' }) }),
    };
  }

  function stepFinish() {
    const t = TYPES.find((x) => x.id === S.typeId) || TYPES[0];
    const codes = S.pins.filter((p) => /^\d{4}$/.test(p.code)).length;
    const goalNames = S.goals.map((id) => tr((GOALS.find((g) => g.id === id) || {}).label)).filter(Boolean);
    const row = (k, v) => `<div class="r"><span>${esc(k)}</span><b>${esc(v)}</b></div>`;
    return {
      body: `
        <div class="kob-anim">
          <p class="kob-eyebrow">${tr({ fr: 'Dernière étape', en: 'Last step', ar: 'الخطوة الأخيرة' })}</p>
          <h1 class="kob-h">${S.ownerName ? esc(S.ownerName) + ', ' : ''}<span class="k-sans">${tr({ fr: 'tout est prêt.', en: "you're all set.", ar: 'كل شيء جاهز.' })}</span></h1>
          <p class="kob-sub">${tr({ fr: 'Vérifiez, puis créez votre espace. Vous pourrez tout ajuster ensuite dans les Réglages.', en: 'Have a look, then create your space. You can adjust anything later in Settings.', ar: 'راجع ثم أنشئ مساحتك. يمكنك تعديل كل شيء لاحقاً.' })}</p>
          <div class="kob-recap">
            ${row(tr({ fr: 'Établissement', en: 'Business', ar: 'النشاط' }), S.bizName || '—')}
            ${row(tr({ fr: 'Activité', en: 'Type', ar: 'النوع' }), tr(t.label))}
            ${row(tr({ fr: 'Points de vente', en: 'Locations', ar: 'نقاط البيع' }), String(S.venueCount) + (S.city ? ' · ' + S.city : ''))}
            ${row(tr({ fr: 'Équipe', en: 'Team', ar: 'الفريق' }), tr({ fr: String(S.teamSize) + ' personnes', en: String(S.teamSize) + ' people', ar: String(S.teamSize) + ' أشخاص' }))}
            ${goalNames.length ? row(tr({ fr: 'Priorités', en: 'Priorities', ar: 'الأولويات' }), goalNames.slice(0, 2).join(', ') + (goalNames.length > 2 ? ' +' + (goalNames.length - 2) : '')) : ''}
            ${row(tr({ fr: "Codes d'accès", en: 'Access codes', ar: 'رموز الدخول' }), tr({ fr: codes + ' actif' + (codes > 1 ? 's' : ''), en: codes + ' active', ar: codes + ' نشط' }))}
          </div>
        </div>`,
      foot: `
        <button class="kob-back" data-go="back">&lsaquo; ${tr({ fr: 'Retour', en: 'Back', ar: 'رجوع' })}</button>
        <button class="kob-btn primary" data-finish>${tr({ fr: 'Créer mon espace', en: 'Create my space', ar: 'إنشاء مساحتي' })}</button>`,
    };
  }

  const STEPS = [stepWelcome, stepName, stepBusiness, stepPlaces, stepTeam, stepGoals, stepAccess, stepFinish];

  /* ── Render current step ─────────────────────────────────────────────── */
  function render() {
    const def = STEPS[S.step]();
    const showRail = S.step >= 1 && S.step <= TOTAL;
    root.querySelector('.kob-card').innerHTML = `
      <div class="kob-top">
        <span class="kob-brand">kiwi<i></i></span>
        ${showRail ? rail() : `<span style="font-family:var(--mono);font-size:10.5px;letter-spacing:.14em;color:rgba(233,239,233,.4);text-transform:uppercase;">${tr({ fr: 'Configuration', en: 'Setup', ar: 'الإعداد' })}</span>`}
      </div>
      <div class="kob-body">${def.body}</div>
      <div class="kob-foot">${def.foot}</div>`;
    const first = root.querySelector('.kob-body input[type="text"], .kob-body input:not([type])');
    if (first) setTimeout(() => { try { first.focus(); } catch (_) {} }, 340);
  }

  /* ── Read inputs of the current step into state ──────────────────────── */
  function capture() {
    root.querySelectorAll('[data-f]').forEach((i) => { S[i.dataset.f] = i.value; });
    root.querySelectorAll('[data-pin-name]').forEach((i) => { const n = +i.dataset.pinName; if (S.pins[n]) S.pins[n].name = i.value.trim(); });
    root.querySelectorAll('[data-pin-code]').forEach((i) => { const n = +i.dataset.pinCode; if (S.pins[n]) S.pins[n].code = i.value.replace(/\D/g, '').slice(0, 4); });
    root.querySelectorAll('[data-pin-role]').forEach((i) => { const n = +i.dataset.pinRole; if (S.pins[n]) S.pins[n].role = i.value; });
  }

  /* ── Validate before advancing (returns error string or null) ────────── */
  function validate() {
    if (S.step === 2 && !S.bizName.trim()) return tr({ fr: 'Donnez un nom à votre établissement.', en: 'Give your business a name.', ar: 'أدخل اسم نشاطك.' });
    if (S.step === 6) {
      const owner = S.pins[0];
      if (!/^\d{4}$/.test(owner.code)) return tr({ fr: 'Choisissez votre code à 4 chiffres (le vôtre est obligatoire).', en: 'Choose your 4-digit code (yours is required).', ar: 'اختر رمزك المكوّن من 4 أرقام.' });
      const seen = {};
      for (const p of S.pins) {
        if (!p.code) continue;
        if (!/^\d{4}$/.test(p.code)) return tr({ fr: 'Chaque code doit faire exactement 4 chiffres.', en: 'Each code must be exactly 4 digits.', ar: 'كل رمز يجب أن يكون 4 أرقام.' });
        if (RESERVED.includes(p.code)) return tr({ fr: 'Le code ' + p.code + ' est réservé à la démo, choisissez-en un autre.', en: 'Code ' + p.code + ' is reserved for the demo, pick another.', ar: 'الرمز ' + p.code + ' محجوز, اختر غيره.' });
        if (seen[p.code]) return tr({ fr: 'Deux personnes ont le même code, chaque code doit être unique.', en: 'Two people share a code, each must be unique.', ar: 'رمزان متطابقان, يجب أن يكون كل رمز فريداً.' });
        seen[p.code] = 1;
      }
    }
    return null;
  }

  /* ── Navigation ──────────────────────────────────────────────────────── */
  function go(dir) {
    capture();
    if (dir === 'next') {
      const err = validate();
      if (err) { flashErr(err); return; }
    }
    S.step += (dir === 'next' ? 1 : -1);
    if (S.step < 0) S.step = 0;
    if (S.step >= STEPS.length) { S.step = STEPS.length - 1; return; }
    render();
  }
  function flashErr(msg) {
    const box = root.querySelector('[data-acc-err]');
    if (box) box.textContent = msg;
    try { if (window.Kiwi && Kiwi.toast) Kiwi.toast(msg, { type: 'warn', force: true }); } catch (_) {}
  }

  /* ── Finish · persist + create venue + celebrate ─────────────────────── */
  function finish() {
    capture();
    const t = TYPES.find((x) => x.id === S.typeId) || TYPES[0];
    const validPins = S.pins.filter((p) => /^\d{4}$/.test(p.code)).map((p) => ({
      role: p.role, code: p.code,
      name: p.name || (p.role === 'owner' ? (S.ownerName || tr({ fr: 'Propriétaire', en: 'Owner', ar: 'المالك' })) : ''),
    }));
    LS.set('kiwiOwnerName', S.ownerName.trim());
    LS.set('kiwiBizName', S.bizName.trim());
    LS.set('kiwiBizType', S.typeId);
    LS.set('kiwiCity', S.city.trim());
    LS.set('kiwiVenueCount', String(S.venueCount));
    LS.set('kiwiTeamSize', String(S.teamSize));
    LS.set('kiwiGoals', JSON.stringify(S.goals));
    LS.set('kiwiPins', JSON.stringify(validPins));
    /* Mirror the client's PINs up to the server so the operator console can see
     * and manage them (God mode). Fire-and-forget + fail-safe — a static host or
     * offline session just keeps the local copy, nothing breaks. */
    try { if (window.KiwiConfig && window.KiwiConfig.syncPins) window.KiwiConfig.syncPins(validPins); } catch (_) {}
    /* Mirror the business type too, so the operator console shows this merchant's
     * real modules (boutique ≠ restaurant). Same fire-and-forget contract. */
    try { if (window.KiwiConfig && window.KiwiConfig.syncType) window.KiwiConfig.syncType(S.typeId); } catch (_) {}
    LS.set('kiwiRole', 'owner');
    LS.set('kiwiOnboarded', '1');
    LS.del('kiwiSkipOnboard');

    let vid = null;
    try {
      vid = window.KiwiVenue && KiwiVenue.createVenue && KiwiVenue.createVenue({
        type: t.base, subtype: t.id, typeLabel: tr(t.label),
        name: S.bizName.trim() || tr({ fr: 'Mon activité', en: 'My business', ar: 'نشاطي' }),
        location: S.city.trim(),
        goal: +String(S.dailyGoal).replace(/[^\d]/g, '') || 0,
        staffCount: S.teamSize,
        profile: { goals: S.goals, venueCount: S.venueCount, owner: S.ownerName.trim() },
      });
      if (vid && KiwiVenue.setVenue) KiwiVenue.setVenue(vid);
    } catch (_) {}

    /* Seed the entered staff into the REAL per-venue roster (team.js) so they
     * persist and show on the Équipe page — not just the login-lock's kiwiPins. */
    try {
      const teamPeople = S.pins.map((p) => ({
        role: p.role,
        code: /^\d{4}$/.test(p.code) ? p.code : '',
        name: (p.name || '').trim() || (p.role === 'owner' ? (S.ownerName || '').trim() : ''),
      })).filter((p) => p.name);
      const venue = window.KiwiVenue && KiwiVenue.getCurrentVenueData && KiwiVenue.getCurrentVenueData();
      if (venue && window.KiwiTeam && KiwiTeam.importMembers) KiwiTeam.importMembers(venue, teamPeople);
    } catch (_) {}

    try {
      window.__kiwiRole = 'owner';
      document.body.classList.remove('role-manager', 'role-staff');
      document.body.classList.add('role-owner');
    } catch (_) {}

    celebrate(vid);
  }

  let autoEnter = null;
  function celebrate() {
    const name = S.ownerName.trim();
    root.querySelector('.kob-card').innerHTML = `
      <div class="kob-top"><span class="kob-brand">kiwi<i></i></span></div>
      <div class="kob-body"><div class="kob-celebrate">
        <div class="kob-hero-mark"><svg viewBox="0 0 24 24" fill="none" stroke="#7DF2B0" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg></div>
        <h1 class="kob-h" style="text-align:center;">${name ? esc(name) + ', ' : ''}<span class="k-sans">${tr({ fr: 'votre espace est prêt.', en: 'your space is ready.', ar: 'مساحتك جاهزة.' })}</span></h1>
        <p class="kob-sub" style="margin:0 auto;text-align:center;">${tr({ fr: 'Enregistrez votre première vente et regardez votre tableau de bord prendre vie.', en: 'Record your first sale and watch your dashboard come alive.', ar: 'سجّل أول عملية بيع وشاهد لوحتك تنبض بالحياة.' })}</p>
      </div></div>
      <div class="kob-foot"><button class="kob-btn primary" data-enter>${tr({ fr: 'Entrer dans mon espace →', en: 'Enter my space →', ar: 'ادخل مساحتي ←' })}</button></div>`;
    try { if (window.Kiwi && Kiwi.confetti) Kiwi.confetti(); } catch (_) {}
    autoEnter = setTimeout(enterApp, 2800);
  }

  /* ── Dismiss the wizard + reveal the dashboard underneath ────────────── */
  function enterApp() {
    if (autoEnter) { clearTimeout(autoEnter); autoEnter = null; }
    const name = S.ownerName.trim();
    close();
    try {
      if (window.__kiwiLock && window.__kiwiLock.reveal) window.__kiwiLock.reveal();
      else {
        const lock = document.querySelector('[data-kiwi-lock]'); if (lock) lock.remove();
        document.documentElement.style.overflow = '';
        const app = document.querySelector('.app'); if (app) app.classList.remove('kw-app-hidden');
        const bar = document.querySelector('.demo-bar'); if (bar) bar.classList.remove('kw-bar-hidden');
        document.body.classList.add('cards-enter');
      }
    } catch (_) {}
    try {
      if (window.Kiwi && Kiwi.toast) Kiwi.toast(tr({ fr: 'Bienvenue' + (name ? ' ' + name : ''), en: 'Welcome' + (name ? ' ' + name : ''), ar: 'مرحباً' + (name ? ' ' + name : '') }), {
        type: 'success', force: true,
        desc: tr({ fr: 'Votre espace est prêt, enregistrez votre première vente.', en: 'Your space is ready, record your first sale.', ar: 'مساحتك جاهزة, سجّل أول بيع.' }),
      });
    } catch (_) {}
    /* Brand-new business: surface the "Connectez votre caisse" panel so the owner
     * pairs their till immediately (once the entry choreography has settled). */
    try { setTimeout(function () { if (window.KiwiCaisseLink && KiwiCaisseLink.promptNewMerchant) KiwiCaisseLink.promptNewMerchant(); }, 1300); } catch (_) {}
  }

  /* ── Explore the demo instead (bail to the PIN lock) ─────────────────── */
  function exploreDemo() {
    LS.set('kiwiSkipOnboard', '1');
    close();
    try { if (window.__kiwiLock && window.__kiwiLock.show) window.__kiwiLock.show(); } catch (_) {}
  }

  /* ── Overlay lifecycle ───────────────────────────────────────────────── */
  function build() {
    inject();
    root = document.createElement('div');
    root.className = 'kob-root';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', 'Configuration Kiwi');
    const card = document.createElement('div'); card.className = 'kob-card';
    root.appendChild(card);
    document.body.appendChild(root);

    root.addEventListener('click', (e) => {
      const goBtn = e.target.closest('[data-go]');
      if (goBtn) { go(goBtn.dataset.go); return; }
      if (e.target.closest('[data-explore]')) { exploreDemo(); return; }
      if (e.target.closest('[data-finish]')) { finish(); return; }
      if (e.target.closest('[data-enter]')) { enterApp(); return; }
      if (e.target.closest('[data-more]')) {
        root.querySelectorAll('.kob-xtra').forEach((x) => x.classList.remove('hide'));
        const b = e.target.closest('[data-more]'); if (b) b.style.display = 'none';
        return;
      }
      if (e.target.closest('[data-pin-add]')) {
        capture(); S.pins.push({ role: 'staff', name: '', code: '' }); render(); return;
      }
      const rmBtn = e.target.closest('[data-pin-remove]');
      if (rmBtn) {
        capture(); const n = +rmBtn.dataset.pinRemove;
        if (n > 0 && S.pins.length > 1) S.pins.splice(n, 1);
        render(); return;
      }
      const tc = e.target.closest('[data-type]');
      if (tc) {
        S.typeId = tc.dataset.type;
        root.querySelectorAll('[data-type]').forEach((x) => x.classList.toggle('sel', x === tc));
        return;
      }
      const gc = e.target.closest('[data-goal]');
      if (gc) {
        const id = gc.dataset.goal;
        const at = S.goals.indexOf(id);
        if (at >= 0) S.goals.splice(at, 1); else S.goals.push(id);
        gc.classList.toggle('sel');
        return;
      }
      const inc = e.target.closest('[data-inc]');
      if (inc) {
        const wrap = inc.closest('[data-stepper]');
        const f = wrap.dataset.stepper, min = +wrap.dataset.min, max = +wrap.dataset.max;
        S[f] = Math.max(min, Math.min(max, (+S[f] || min) + (+inc.dataset.inc)));
        const numEl = wrap.querySelector('[data-stepval]');
        numEl.innerHTML = `${S[f]}<small>${unitFor(f)}</small>`;
        return;
      }
    });

    root.addEventListener('input', (e) => {
      const code = e.target.closest('[data-pin-code]');
      if (code) {
        code.value = code.value.replace(/\D/g, '').slice(0, 4);
        const row = code.closest('[data-acc]');
        if (row) row.classList.toggle('filled', /^\d{4}$/.test(code.value));
      }
    });

    root.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        if (e.target && e.target.matches && e.target.matches('[data-pin-name],[data-pin-code]')) return;
        const primary = root.querySelector('[data-finish], [data-enter], .kob-foot [data-go="next"]');
        if (primary) { e.preventDefault(); primary.click(); }
      } else if (e.key === 'Escape' && S.step === 0) {
        exploreDemo();
      }
    });
  }

  function open(opts) {
    opts = opts || {};
    if (opened) return;
    opened = true;
    if (typeof opts.startStep === 'number') S.step = opts.startStep;
    if (!root) build();
    try { if (window.__kiwiLock && window.__kiwiLock.hide) window.__kiwiLock.hide(); } catch (_) {}
    document.documentElement.style.overflow = 'hidden';
    render();
    /* setTimeout (not rAF) so the fade-in also fires when the tab is
     * backgrounded — rAF is throttled/paused off-screen. */
    setTimeout(() => { if (root) root.classList.add('kob-in'); }, 20);
  }

  function close() {
    if (!root) return;
    opened = false;
    root.classList.add('kob-out');
    const dead = root;
    setTimeout(() => { if (dead && dead.parentNode) dead.remove(); if (root === dead) root = null; }, 480);
  }

  function isComplete() { return LS.get('kiwiOnboarded') === '1'; }
  function reset() {
    ['kiwiOnboarded', 'kiwiOwnerName', 'kiwiBizName', 'kiwiBizType', 'kiwiCity', 'kiwiVenueCount', 'kiwiTeamSize', 'kiwiGoals', 'kiwiPins', 'kiwiSkipOnboard'].forEach(LS.del);
  }

  /* ── Auto-launch decision ────────────────────────────────────────────── */
  function hasCustomVenue() {
    try {
      if (!(window.KiwiVenue && KiwiVenue.isCustom && KiwiVenue.isCustom())) return false;
      // The synthetic 'own' placeholder venue (venues.js ensureOwnEmptyVenue) makes
      // isCustom() true for EVERY authenticated merchant from the first paint — it is
      // created precisely so demo surfaces zero out, and its own comment notes "the
      // onboarding CTA can still show". Reusing isCustom() as "already has a venue"
      // wrongly denies a BRAND-NEW merchant the setup wizard, stranding them on the
      // PIN lock with no valid code (fresh signup → dashboard gate, no onboarding).
      // Ignore 'own' here; only a GENUINE user-created venue suppresses auto-launch.
      // ('scoped' = operator God-mode → keep suppressing so the wizard never opens in
      // the operator's face.)
      var v = (KiwiVenue.getVenue && KiwiVenue.getVenue()) || '';
      return v !== 'own';
    } catch (_) { return false; }
  }
  function shouldAutoLaunch() {
    const q = new URLSearchParams(location.search);
    if (q.has('demo')) return false;
    if (q.has('onboarding')) {
      // Consume the one-shot signup param. It used to be STICKY: every reload with
      // ?onboarding=1 still in the URL re-ran reset() + relaunched the wizard,
      // wiping a just-completed kiwiOnboarded (P3). Strip it so a refresh can't
      // re-trigger, and never reset an account that already finished onboarding.
      try { history.replaceState({}, '', location.pathname + location.hash); } catch (_) {}
      if (isComplete()) return false;
      reset();
      return true;
    }
    if (isComplete()) return false;
    if (LS.get('kiwiSkipOnboard') === '1') return false;
    if (hasCustomVenue()) return false;
    return true;
  }

  function initHandler() {
    try {
      if (window.Kiwi && Kiwi.handlers) {
        Kiwi.handlers['onboard'] = () => { reset(); S.step = 0; open(); };
      }
    } catch (_) {}
  }

  window.KiwiOnboarding = {
    open, close, isComplete, reset, shouldAutoLaunch,
    get profile() { return { ownerName: LS.get('kiwiOwnerName'), bizName: LS.get('kiwiBizName'), type: LS.get('kiwiBizType') }; },
  };

  function boot() {
    if (!document.querySelector('[data-kiwi-lock]')) { initHandler(); return; }
    initHandler();
    if (shouldAutoLaunch()) {
      const start = () => { S.step = 0; open(); };
      if (window.KiwiVenue) start();
      else setTimeout(start, 60);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
