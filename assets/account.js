/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · ACCOUNT — the profile-menu destinations as real full .app pages.
 *
 * "Mon profil", "Facturation" and "Centre d'aide" used to be toast stubs. They
 * now open as full pages via Kiwi.appPage() (same format as every sidebar
 * destination), each with genuinely useful, data-driven content. Trilingual.
 * ─────────────────────────────────────────────────────────────────────────── */
(() => {
  'use strict';
  const Kiwi = window.Kiwi;
  if (!Kiwi) return;
  const handlers = Kiwi.handlers;
  const lang = () => (window.KiwiI18n && window.KiwiI18n.getLang && window.KiwiI18n.getLang()) || 'fr';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const pick = (o) => (o && (o[lang()] != null ? o[lang()] : o.fr)) || '';

  /* Account owner (demo). A real build would hydrate these from the session. */
  const OWNER = { name: 'Rachid Benhima', initials: 'RB', email: 'rachid@cafeatlas.ma', phone: '+212 6 61 24 88 03' };
  const PLAN = { name: 'Kiwi Pro', price: '399 MAD', cycle: pick({ fr: '/mois', en: '/mo', ar: '/شهر' }) };

  /* ── one-time styles (token-based → light/dark correct) ─────────────────── */
  (function injectCss() {
    const css = `
      .acc-hero { display:flex; align-items:center; gap:16px; padding:20px; border-radius:16px; background:linear-gradient(150deg,#0c4a35,#08311f); color:#fff; margin-bottom:18px; }
      .acc-avatar { width:60px; height:60px; border-radius:50%; background:var(--mint); color:#06371f; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:22px; flex-shrink:0; }
      .acc-hero-name { font-size:20px; font-weight:600; letter-spacing:-0.02em; }
      .acc-hero-role { font-size:12.5px; color:rgba(255,255,255,0.72); margin-top:3px; }
      .acc-hero .acc-cta { margin-inline-start:auto; }
      .acc-grid { display:grid; grid-template-columns:repeat(2,1fr); gap:14px; }
      @media (max-width:820px){ .acc-grid { grid-template-columns:1fr; } }
      .acc-card { border:1px solid var(--n-200); border-radius:14px; padding:16px 18px; background:var(--surface); }
      .acc-card.span2 { grid-column:1 / -1; }
      .acc-eyebrow { font-family:var(--mono); font-size:10.5px; letter-spacing:0.1em; text-transform:uppercase; color:var(--n-500); margin-bottom:12px; }
      .acc-row { display:flex; justify-content:space-between; align-items:center; gap:14px; padding:8px 0; border-bottom:1px solid var(--n-100); font-size:13.5px; }
      .acc-row:last-child { border-bottom:0; }
      .acc-row > span { color:var(--n-500); }
      .acc-row > b { font-weight:600; color:var(--ink); }
      .acc-row .ok { color:var(--success); }
      .acc-row a { color:var(--atlas); font-weight:600; cursor:pointer; }
      .acc-chips { display:flex; flex-wrap:wrap; gap:7px; margin-top:10px; }
      .acc-chip { font-size:11px; font-weight:600; padding:4px 10px; border-radius:999px; background:var(--mint-soft); color:var(--atlas); }
      .acc-venue { display:flex; justify-content:space-between; align-items:center; padding:9px 0; border-bottom:1px solid var(--n-100); font-size:13.5px; }
      .acc-venue:last-child { border-bottom:0; }
      .acc-venue b { font-weight:600; } .acc-venue span { color:var(--n-500); font-size:12px; }
      .acc-cta { background:var(--atlas); color:#fff; border:0; border-radius:9px; padding:9px 16px; font-size:12.5px; font-weight:600; font-family:var(--sans); cursor:pointer; }
      .acc-cta.ghost { background:transparent; color:var(--ink); border:1px solid var(--n-300); }
      .acc-cta.light { background:#fff; color:#08311f; }
      .acc-cta:hover { filter:brightness(1.06); }
      .acc-plan { display:flex; align-items:center; gap:18px; padding:22px; border-radius:16px; background:linear-gradient(150deg,#0c4a35,#08311f); color:#fff; margin-bottom:16px; flex-wrap:wrap; }
      .acc-plan-price { font-size:30px; font-weight:600; letter-spacing:-0.02em; }
      .acc-plan-price small { font-size:14px; font-weight:400; opacity:0.7; }
      .acc-plan-name { font-family:var(--mono); font-size:11px; letter-spacing:0.1em; color:rgba(255,255,255,0.7); }
      .acc-plan-meta { font-size:12.5px; color:rgba(255,255,255,0.8); margin-top:4px; }
      .acc-plan-acts { margin-inline-start:auto; display:flex; gap:10px; flex-wrap:wrap; }
      .acc-tbl { width:100%; border-collapse:collapse; font-size:13px; }
      .acc-tbl th { text-align:start; font-family:var(--mono); font-size:10px; letter-spacing:0.08em; text-transform:uppercase; color:var(--n-500); padding:8px 6px; border-bottom:1px solid var(--n-200); font-weight:500; }
      .acc-tbl td { padding:11px 6px; border-bottom:1px solid var(--n-100); }
      .acc-tbl tr:last-child td { border-bottom:0; }
      .acc-paid { font-size:11px; font-weight:600; color:var(--success); }
      .acc-dl { color:var(--atlas); font-weight:600; cursor:pointer; }
      .acc-search { width:100%; padding:13px 16px; border:1px solid var(--n-200); border-radius:12px; background:var(--surface); color:var(--ink); font-family:var(--sans); font-size:14px; outline:none; box-sizing:border-box; margin-bottom:18px; }
      .acc-search:focus { border-color:var(--atlas); }
      .acc-contact { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; margin-bottom:20px; }
      @media (max-width:820px){ .acc-contact { grid-template-columns:1fr; } }
      .acc-contact-card { border:1px solid var(--n-200); border-radius:14px; padding:16px; background:var(--surface); cursor:pointer; transition:border-color 130ms; }
      .acc-contact-card:hover { border-color:var(--atlas); }
      .acc-contact-card .t { font-weight:600; font-size:14px; margin-bottom:3px; }
      .acc-contact-card .d { font-size:12px; color:var(--n-500); }
      .acc-topics { display:grid; grid-template-columns:repeat(2,1fr); gap:12px; }
      @media (max-width:820px){ .acc-topics { grid-template-columns:1fr; } }
      .acc-topic { display:flex; justify-content:space-between; align-items:center; border:1px solid var(--n-200); border-radius:12px; padding:14px 16px; background:var(--surface); cursor:pointer; transition:border-color 130ms; }
      .acc-topic:hover { border-color:var(--atlas); }
      .acc-topic b { font-weight:600; font-size:13.5px; } .acc-topic span { color:var(--n-500); font-size:12px; }
      .acc-status { display:flex; align-items:center; gap:9px; margin-top:18px; padding:13px 16px; border-radius:12px; background:var(--mint-soft); font-size:13px; color:var(--ink); }
      .acc-status .dot { width:8px; height:8px; border-radius:50%; background:var(--success); flex-shrink:0; }
      .acc-sec-title { font-size:14px; font-weight:600; margin:22px 0 12px; }
      .acc-section-head { display:flex; align-items:center; justify-content:space-between; margin:26px 0 14px; }
      .acc-section-head h3 { font-size:15px; font-weight:600; margin:0; letter-spacing:-0.01em; }
      .acc-section-head .ct { font-size:12px; color:var(--n-500); font-family:var(--mono); }
      .acc-biz { border:1px solid var(--n-200); border-radius:16px; background:var(--surface); padding:18px 20px; margin-bottom:14px; transition:border-color 140ms, box-shadow 140ms; }
      .acc-biz:hover { border-color:var(--n-300); box-shadow:0 8px 26px -18px rgba(11,110,79,0.30); }
      .acc-biz-head { display:flex; align-items:flex-start; gap:13px; }
      .acc-biz-logo { width:44px; height:44px; border-radius:13px; background:var(--mint-soft); color:var(--atlas); display:flex; align-items:center; justify-content:center; font-weight:700; font-size:15px; flex-shrink:0; }
      .acc-biz-name { font-size:15.5px; font-weight:600; letter-spacing:-0.01em; }
      .acc-biz-meta { font-size:12px; color:var(--n-500); margin-top:2px; }
      .acc-biz-badge { font-size:9.5px; font-weight:700; padding:3px 8px; border-radius:999px; background:var(--atlas); color:#fff; letter-spacing:0.06em; }
      .acc-stat-row { display:flex; gap:10px; margin:15px 0; flex-wrap:wrap; }
      .acc-stat { flex:1; min-width:120px; background:var(--paper-soft); border-radius:12px; padding:11px 14px; }
      .acc-stat .v { font-size:18px; font-weight:600; font-family:var(--mono); letter-spacing:-0.02em; color:var(--ink); }
      .acc-stat .l { font-size:10px; color:var(--n-500); font-family:var(--mono); text-transform:uppercase; letter-spacing:0.06em; margin-top:3px; }
      .acc-legal { display:grid; grid-template-columns:repeat(3,1fr); gap:12px 18px; border-top:1px solid var(--n-100); padding-top:14px; }
      @media (max-width:820px){ .acc-legal { grid-template-columns:repeat(2,1fr); } }
      .acc-legal .k { font-size:9.5px; color:var(--n-500); font-family:var(--mono); text-transform:uppercase; letter-spacing:0.05em; }
      .acc-legal .v { font-size:13px; font-weight:500; margin-top:2px; font-variant-numeric:tabular-nums; }
      .acc-add-biz { width:100%; border:1.5px dashed var(--n-300); border-radius:14px; padding:14px; background:transparent; color:var(--atlas); font-weight:600; font-size:13.5px; font-family:var(--sans); cursor:pointer; transition:border-color 140ms, background 140ms; }
      .acc-add-biz:hover { border-color:var(--atlas); background:var(--mint-soft); }
      .acc-plan-btns { display:flex; gap:10px; flex-wrap:wrap; margin-top:12px; }
      .acc-danger { color:var(--danger); cursor:pointer; font-weight:600; font-size:12.5px; background:transparent; border:1px solid color-mix(in srgb,var(--danger) 38%,transparent); border-radius:9px; padding:9px 16px; font-family:var(--sans); transition:background 140ms; }
      .acc-danger:hover { background:color-mix(in srgb,var(--danger) 10%,transparent); }`;
    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  })();

  const getSet = (k, def) => { try { return localStorage.getItem('kiwiSet:' + k) || def; } catch (_) { return def; } };
  // A REAL session = a signed-in merchant (or the operator scoped into one), both
  // of which set window.KiwiMe, OR any hosted domain (never a demo). In a real
  // session the demo owner "Rachid Benhima" / "Café Atlas" and its fabricated
  // legal registration must NEVER appear — the account shows itself, with legal
  // fields blank ("à compléter") because the client hasn't entered them.
  const meVal = (k) => { try { return (window.KiwiMe && window.KiwiMe[k]) || ''; } catch (_) { return ''; } };
  const isReal = () => !!(window.KiwiMe) || !!(window.KiwiEnv && window.KiwiEnv.demosAllowed === false);
  const ownerName = () => meVal('name') || getSet('ownerName', OWNER.name);
  const ownerEmail = () => meVal('email') || getSet('ownerEmail', OWNER.email);
  const ownerPhone = () => getSet('ownerPhone', isReal() ? '' : OWNER.phone);
  const ownerLang = () => pick({ fr: 'Français', en: 'English', ar: 'العربية' });
  const fmtMAD = (n) => Number(n).toLocaleString('fr-FR').replace(/[  ,]/g, ' ');

  /* ── Subscription ladder (mirrors the 4-tier model) ── */
  const PLAN_LADDER = ['basic', 'pro', 'ultra', 'ultimate'];
  const PLAN_INFO = {
    basic: { name: 'Kiwi Basic', price: '199 MAD' },
    pro: { name: 'Kiwi Pro', price: '399 MAD' },
    ultra: { name: 'Kiwi Ultra', price: '1 499 MAD' },
    ultimate: { name: 'Kiwi Ultimate', price: '—' },
  };
  const curPlan = () => getSet('plan', 'pro');

  /* ── Businesses (multi-établissement). Defaults + per-field localStorage
   *    overrides (kiwiSet:biz:<id>:<field>) + user-added extras (kiwiBizExtra). ── */
  const BIZ_FIELDS = [
    { k: 'name', label: { fr: "Nom de l'établissement", en: 'Business name', ar: 'اسم المؤسسة' } },
    { k: 'type', label: { fr: "Type d'activité", en: 'Activity type', ar: 'نوع النشاط' } },
    { k: 'address', label: { fr: 'Adresse', en: 'Address', ar: 'العنوان' } },
    { k: 'city', label: { fr: 'Ville', en: 'City', ar: 'المدينة' } },
    { k: 'phone', label: { fr: 'Téléphone', en: 'Phone', ar: 'الهاتف' } },
    { k: 'hours', label: { fr: 'Horaires', en: 'Opening hours', ar: 'ساعات العمل' } },
    { k: 'ice', label: { fr: 'ICE', en: 'ICE', ar: 'ICE' } },
    { k: 'fiscal', label: { fr: 'Identifiant Fiscal (IF)', en: 'Tax ID (IF)', ar: 'الرقم الضريبي' } },
    { k: 'rc', label: { fr: 'Registre de Commerce (RC)', en: 'Trade Register (RC)', ar: 'السجل التجاري' } },
    { k: 'patente', label: { fr: 'Patente', en: 'Patente', ar: 'الباتنتا' } },
    { k: 'cnss', label: { fr: 'CNSS', en: 'CNSS', ar: 'CNSS' } },
  ];
  const BIZ_DEFAULTS = [
    { id: 'cafeAtlas', name: 'Café Atlas · Maarif', type: 'Café · Restaurant', city: 'Casablanca', address: '12 Rue Allal Ben Abdellah, Maarif', primary: true, ice: '002593840000047', fiscal: '40512893', rc: 'Casablanca 458921', patente: '31204567', cnss: '8842157', phone: '+212 5 22 39 11 84', hours: '07:00 – 23:00', revenue: 825000, orders: 3240, team: 15 },
    { id: 'maisonMansour', name: 'Maison Mansour', type: 'Restaurant · Traiteur', city: 'Casablanca', address: "45 Boulevard d'Anfa", primary: false, ice: '002593840000128', fiscal: '40698215', rc: 'Casablanca 472310', patente: '31288901', cnss: '8847720', phone: '+212 5 22 48 60 03', hours: '12:00 – 00:00', revenue: 358000, orders: 1180, team: 9 },
    { id: 'spaBahia', name: 'Spa Bahia', type: 'Spa · Hammam', city: 'Marrakech', address: '8 Rue de la Liberté, Guéliz', primary: false, ice: '002593840000206', fiscal: '50231764', rc: 'Marrakech 119045', patente: '47120338', cnss: '5521090', phone: '+212 5 24 43 77 21', hours: '10:00 – 21:00', revenue: 269000, orders: 640, team: 6 },
  ];
  const extraBiz = () => { try { return JSON.parse(localStorage.getItem('kiwiBizExtra') || '[]'); } catch (_) { return []; } };
  const setExtraBiz = (a) => { try { localStorage.setItem('kiwiBizExtra', JSON.stringify(a)); } catch (_) {} };
  const bizField = (b, f) => getSet('biz:' + b.id + ':' + f, b[f] != null ? b[f] : '');
  // Map an onboarding business type (base or subtype) to a human label.
  const TYPE_LABEL = { restaurant: 'Restaurant', cafe: 'Café · Restaurant', fastfood: 'Restauration rapide', bakery: 'Boulangerie', pizzeria: 'Pizzeria', boutique: 'Boutique', epicerie: 'Épicerie', pharmacie: 'Pharmacie', fleuriste: 'Fleuriste', spa: 'Spa', coiffure: 'Salon de coiffure', sport: 'Sport & bien-être', hotel: 'Hôtel' };
  const bizTypeLabel = (t) => TYPE_LABEL[t] || (t ? String(t) : pick({ fr: 'Établissement', en: 'Business', ar: 'مؤسسة' }));
  // A real account's single establishment: its own name + business type, and
  // BLANK legal fields (the client hasn't entered ICE/RC/etc). Never the demo's.
  const primaryRealBiz = () => ({
    id: 'primary', primary: true,
    name: (meVal('business') || getSet('bizName', '') || '').trim() || pick({ fr: 'Mon établissement', en: 'My business', ar: 'مؤسستي' }),
    type: bizTypeLabel(meVal('type')), city: '', address: '',
    ice: '', fiscal: '', rc: '', patente: '', cnss: '', phone: '', hours: '',
    /* no revenue/orders/team → the stat row is omitted (no fabricated numbers). */
  });
  const allBiz = () => (isReal() ? [primaryRealBiz(), ...extraBiz()] : [...BIZ_DEFAULTS, ...extraBiz()])
    .map((b) => { const o = { ...b }; BIZ_FIELDS.forEach((f) => { o[f.k] = bizField(b, f.k); }); return o; });
  const initialsOf = (s) => (String(s).replace(/\s*·.*$/, '').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('') || 'K').toUpperCase();

  /* ════════════════════════════ MON PROFIL ════════════════════════════ */
  function openProfile() {
    const T = {
      title: pick({ fr: 'Mon profil', en: 'My profile', ar: 'ملفي الشخصي' }),
      sub: pick({ fr: 'Compte, établissements & abonnement', en: 'Account, businesses & subscription', ar: 'الحساب، المؤسسات والاشتراك' }),
      role: pick({ fr: 'Propriétaire · admin · membre depuis mars 2025', en: 'Owner · admin · member since March 2025', ar: 'مالك · مشرف · عضو منذ مارس 2025' }),
      edit: pick({ fr: 'Modifier', en: 'Edit', ar: 'تعديل' }),
      personal: pick({ fr: 'Informations personnelles', en: 'Personal information', ar: 'المعلومات الشخصية' }),
      name: pick({ fr: 'Nom complet', en: 'Full name', ar: 'الاسم الكامل' }),
      email: pick({ fr: 'Email', en: 'Email', ar: 'البريد الإلكتروني' }),
      phone: pick({ fr: 'Téléphone', en: 'Phone', ar: 'الهاتف' }),
      language: pick({ fr: 'Langue', en: 'Language', ar: 'اللغة' }),
      security: pick({ fr: 'Sécurité', en: 'Security', ar: 'الأمان' }),
      twofa: pick({ fr: 'Authentification 2FA', en: 'Two-factor auth', ar: 'المصادقة الثنائية' }),
      smsOn: pick({ fr: 'SMS activé', en: 'SMS on', ar: 'الرسائل مُفعّلة' }),
      lastLogin: pick({ fr: 'Dernière connexion', en: 'Last sign-in', ar: 'آخر دخول' }),
      today: pick({ fr: "Aujourd'hui · 08:12", en: 'Today · 08:12', ar: 'اليوم · 08:12' }),
      password: pick({ fr: 'Mot de passe', en: 'Password', ar: 'كلمة المرور' }),
      change: pick({ fr: 'Modifier', en: 'Change', ar: 'تغيير' }),
      myBiz: pick({ fr: 'Mes établissements', en: 'My businesses', ar: 'مؤسساتي' }),
      addBiz: pick({ fr: '+ Ajouter un établissement', en: '+ Add a business', ar: '+ إضافة مؤسسة' }),
      primary: pick({ fr: 'PRINCIPAL', en: 'PRIMARY', ar: 'الرئيسية' }),
      caMonth: pick({ fr: 'CA ce mois', en: 'Revenue · mo', ar: 'المداخيل · الشهر' }),
      ordersL: pick({ fr: 'Commandes', en: 'Orders', ar: 'الطلبات' }),
      teamL: pick({ fr: 'Équipe', en: 'Team', ar: 'الفريق' }),
      subscription: pick({ fr: 'Abonnement', en: 'Subscription', ar: 'الاشتراك' }),
      curPlanLabel: pick({ fr: 'FORMULE ACTUELLE', en: 'CURRENT PLAN', ar: 'الباقة الحالية' }),
      upgrade: pick({ fr: 'Mettre à niveau', en: 'Upgrade', ar: 'ترقية' }),
      downgrade: pick({ fr: 'Rétrograder', en: 'Downgrade', ar: 'تخفيض' }),
      billing: pick({ fr: 'Voir la facturation', en: 'View billing', ar: 'عرض الفواتير' }),
      cancel: pick({ fr: 'Résilier', en: 'Cancel plan', ar: 'إلغاء الاشتراك' }),
      planMeta: pick({ fr: 'Facturé mensuellement · sans engagement', en: 'Billed monthly · no commitment', ar: 'فوترة شهرية · دون التزام' }),
      perMo: pick({ fr: '/mois', en: '/mo', ar: '/شهر' }),
      pwToast: pick({ fr: 'Lien de changement de mot de passe envoyé par SMS.', en: 'Password-change link sent by SMS.', ar: 'تم إرسال رابط تغيير كلمة المرور عبر SMS.' }),
    };
    const plan = PLAN_INFO[curPlan()] || PLAN_INFO.pro;
    const planPrice = curPlan() === 'ultimate' ? pick({ fr: 'Sur devis', en: 'Custom', ar: 'حسب الطلب' }) : plan.price;
    const isBasic = curPlan() === 'basic';
    const row = (k, v, raw) => `<div class="acc-row"><span>${esc(k)}</span>${raw || `<b>${v}</b>`}</div>`;
    const bizCard = (b) => {
      const lg = (k, v) => `<div><div class="k">${esc(k)}</div><div class="v">${esc(v || '—')}</div></div>`;
      return `
        <div class="acc-biz">
          <div class="acc-biz-head">
            <div class="acc-biz-logo">${esc(initialsOf(b.name))}</div>
            <div style="flex:1; min-width:0;">
              <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                <span class="acc-biz-name">${esc(b.name)}</span>
                ${b.primary ? `<span class="acc-biz-badge">${esc(T.primary)}</span>` : ''}
              </div>
              <div class="acc-biz-meta">${esc(b.type)} · ${esc(b.city)}${b.address ? ' · ' + esc(b.address) : ''}</div>
            </div>
            <button class="acc-cta ghost" data-action="account-edit-business" data-arg="${esc(b.id)}">${esc(T.edit)}</button>
          </div>
          ${b.revenue != null ? `<div class="acc-stat-row">
            <div class="acc-stat"><div class="v">${fmtMAD(b.revenue)} <span style="font-size:11px;opacity:.6;">MAD</span></div><div class="l">${esc(T.caMonth)}</div></div>
            <div class="acc-stat"><div class="v">${fmtMAD(b.orders)}</div><div class="l">${esc(T.ordersL)}</div></div>
            <div class="acc-stat"><div class="v">${esc(String(b.team))}</div><div class="l">${esc(T.teamL)}</div></div>
          </div>` : ''}
          <div class="acc-legal">
            ${lg('ICE', b.ice)}${lg('IF', b.fiscal)}${lg('RC', b.rc)}
            ${lg('Patente', b.patente)}${lg('CNSS', b.cnss)}${lg(T.phone, b.phone)}
          </div>
        </div>`;
    };
    const biz = allBiz();
    Kiwi.appPage('account-profile', {
      title: T.title, subtitle: T.sub,
      body: `
        <div class="acc-hero">
          <div class="acc-avatar">${esc(initialsOf(ownerName()))}</div>
          <div style="flex:1; min-width:0;"><div class="acc-hero-name">${esc(ownerName())}</div><div class="acc-hero-role">${esc(isReal() ? pick({ fr: 'Propriétaire · admin', en: 'Owner · admin', ar: 'مالك · مشرف' }) : T.role)}</div></div>
          <button class="acc-cta light" data-action="account-edit-profile">${esc(T.edit)}</button>
        </div>
        <div class="acc-grid">
          <div class="acc-card">
            <div class="acc-eyebrow" style="display:flex; justify-content:space-between; align-items:center;">${esc(T.personal)}<a data-action="account-edit-profile" style="color:var(--atlas); cursor:pointer; letter-spacing:0;">${esc(T.edit)}</a></div>
            ${row(T.name, esc(ownerName()))}
            ${row(T.email, esc(ownerEmail()))}
            ${row(T.phone, esc(ownerPhone()))}
            ${row(T.language, esc(ownerLang()))}
          </div>
          <div class="acc-card">
            <div class="acc-eyebrow">${esc(T.security)}</div>
            ${row(T.twofa, '', isReal()
              ? `<b>${esc(pick({ fr: 'Non configurée', en: 'Not set up', ar: 'غير مُفعّلة' }))}</b>`
              : `<b class="ok">${esc(T.smsOn)}</b>`)}
            ${isReal() ? '' : row(T.lastLogin, esc(T.today))}
            ${row(T.password, '', `<a data-action="account-change-pw">${esc(T.change)}</a>`)}
          </div>
        </div>
        <div class="acc-section-head"><h3>${esc(T.myBiz)}</h3><span class="ct">${biz.length}</span></div>
        ${biz.map(bizCard).join('')}
        <button class="acc-add-biz" data-action="account-add-business">${esc(T.addBiz)}</button>
        <div class="acc-section-head"><h3>${esc(T.subscription)}</h3></div>
        <div class="acc-plan">
          <div>
            <div class="acc-plan-name">${esc(T.curPlanLabel)}</div>
            <div class="acc-plan-price">${esc(plan.name)} · ${esc(planPrice)}${curPlan() !== 'ultimate' ? `<small>${esc(T.perMo)}</small>` : ''}</div>
            <div class="acc-plan-meta">${esc(T.planMeta)}</div>
          </div>
          <div class="acc-plan-acts">
            <button class="acc-cta light" data-action="upgrade-pro">${esc(T.upgrade)}</button>
            <button class="acc-cta ghost" style="color:#fff; border-color:rgba(255,255,255,0.4);" data-action="account-billing">${esc(T.billing)}</button>
          </div>
        </div>
        <div class="acc-plan-btns">
          ${!isBasic ? `<button class="acc-cta ghost" data-action="account-plan-downgrade">${esc(T.downgrade)}</button>` : ''}
          <button class="acc-danger" data-action="account-plan-cancel">${esc(T.cancel)}</button>
        </div>`,
    });
    handlers['account-change-pw'] = () => Kiwi.toast(T.pwToast, { type: 'success', force: true });
    handlers['account-edit-business'] = (el, arg) => editBusinessModal(arg || (el && el.dataset.arg));
    handlers['account-add-business'] = () => addBusinessModal();
    handlers['account-plan-downgrade'] = () => planChangeModal('down');
    handlers['account-plan-cancel'] = () => planCancelModal();
    if (!handlers['account-help-mail']) handlers['account-help-mail'] = () => Kiwi.toast('support@kiwi.ma', { type: 'info', force: true });
    if (!handlers['account-help-phone']) handlers['account-help-phone'] = () => Kiwi.toast('+212 5 39 00 12 00', { type: 'info', force: true });
  }

  /* ── Business editor (rich form, persists per-field / extras) ── */
  function fieldInput(label, key, val, span) {
    const f = 'width:100%;padding:11px 13px;border:1px solid var(--n-200);border-radius:10px;font-family:var(--sans);font-size:14px;color:var(--ink);background:var(--surface);outline:none;box-sizing:border-box;';
    const l = 'display:block;font-size:11.5px;font-weight:500;color:var(--n-600);margin:13px 0 6px;';
    return `<div style="${span ? 'grid-column:1/-1;' : ''}"><label style="${l}">${esc(label)}</label><input class="acc-f" data-f="${esc(key)}" maxlength="90" style="${f}" value="${esc(val == null ? '' : val)}"/></div>`;
  }
  function bizForm() {
    return '<style>.acc-f:focus{border-color:var(--atlas)!important;}</style><div style="display:grid;grid-template-columns:1fr 1fr;gap:0 14px;max-height:58vh;overflow:auto;padding-right:4px;">';
  }
  function readForm(scope) { const v = {}; scope.querySelectorAll('.acc-f').forEach((i) => { v[i.dataset.f] = (i.value || '').trim(); }); return v; }
  function editBusinessModal(id) {
    const b = allBiz().find((x) => x.id === id);
    if (!b) return;
    const isExtra = !BIZ_DEFAULTS.some((d) => d.id === id);
    const m = Kiwi.modal({
      tag: pick({ fr: 'ÉTABLISSEMENT', en: 'BUSINESS', ar: 'مؤسسة' }), title: b.name, width: 560,
      body: bizForm() + BIZ_FIELDS.map((f) => fieldInput(pick(f.label), f.k, b[f.k], ['name', 'type', 'address'].includes(f.k))).join('') + '</div>',
      foot: `<button class="kb atlas" data-save type="button" style="width:100%;justify-content:center;padding:12px;font-size:15px;">${esc(pick({ fr: 'Enregistrer', en: 'Save', ar: 'حفظ' }))}</button>`,
    });
    m.el.addEventListener('click', (e) => {
      if (!e.target.closest('[data-save]')) return;
      const v = readForm(m.el);
      if (isExtra) { setExtraBiz(extraBiz().map((x) => (x.id === id ? { ...x, ...v } : x))); }
      else { BIZ_FIELDS.forEach((f) => { try { localStorage.setItem('kiwiSet:biz:' + id + ':' + f.k, v[f.k]); } catch (_) {} }); }
      m.close(); setTimeout(openProfile, 80);
      Kiwi.toast(pick({ fr: 'Établissement mis à jour', en: 'Business updated', ar: 'تم تحديث المؤسسة' }), { type: 'success', force: true });
    });
  }
  function addBusinessModal() {
    const m = Kiwi.modal({
      tag: pick({ fr: 'NOUVEL ÉTABLISSEMENT', en: 'NEW BUSINESS', ar: 'مؤسسة جديدة' }), title: pick({ fr: 'Ajouter un établissement', en: 'Add a business', ar: 'إضافة مؤسسة' }), width: 560,
      body: bizForm() + BIZ_FIELDS.map((f) => fieldInput(pick(f.label), f.k, '', ['name', 'type', 'address'].includes(f.k))).join('') + '</div>',
      foot: `<button class="kb atlas" data-save type="button" style="width:100%;justify-content:center;padding:12px;font-size:15px;">${esc(pick({ fr: "Créer l'établissement", en: 'Create business', ar: 'إنشاء المؤسسة' }))}</button>`,
    });
    setTimeout(() => { const a = m.el.querySelector('.acc-f'); if (a) a.focus(); }, 320);
    m.el.addEventListener('click', (e) => {
      if (!e.target.closest('[data-save]')) return;
      const v = readForm(m.el);
      if (!v.name) { Kiwi.toast(pick({ fr: 'Le nom est requis.', en: 'Name is required.', ar: 'الاسم مطلوب.' }), { type: 'info', force: true }); return; }
      const extras = extraBiz(); extras.push({ id: 'biz-' + Date.now(), primary: false, ...v }); setExtraBiz(extras);
      m.close(); setTimeout(openProfile, 80);
      Kiwi.toast(pick({ fr: 'Établissement ajouté', en: 'Business added', ar: 'تمت إضافة المؤسسة' }), { type: 'success', force: true });
    });
  }

  /* ── Subscription change / cancel ── */
  function planChangeModal() {
    const idx = PLAN_LADDER.indexOf(curPlan());
    const target = PLAN_LADDER[Math.max(0, idx - 1)];
    const ti = PLAN_INFO[target];
    const m = Kiwi.modal({
      tag: pick({ fr: 'CHANGEMENT DE FORMULE', en: 'PLAN CHANGE', ar: 'تغيير الباقة' }),
      title: pick({ fr: `Passer à ${ti.name} ?`, en: `Switch to ${ti.name}?`, ar: `الانتقال إلى ${ti.name}؟` }), width: 460,
      body: `<p style="font-size:14px; color:var(--n-600); line-height:1.6; margin:0;">${esc(pick({
        fr: `Vous passerez à ${ti.name} (${ti.price}/mois). Le changement prend effet à votre prochaine échéance, vous gardez vos fonctionnalités actuelles jusque-là.`,
        en: `You'll move to ${ti.name} (${ti.price}/mo). The change applies at your next billing date, you keep your current features until then.`,
        ar: `ستنتقل إلى ${ti.name} (${ti.price}/شهر). يسري التغيير في تاريخ الفوترة القادم, تحتفظ بميزاتك حتى ذلك الحين.` }))}</p>`,
      foot: `<button class="kb ghost" data-cancel type="button" style="flex:1;justify-content:center;">${esc(pick({ fr: 'Annuler', en: 'Cancel', ar: 'إلغاء' }))}</button><button class="kb atlas" data-confirm type="button" style="flex:1;justify-content:center;">${esc(pick({ fr: 'Confirmer', en: 'Confirm', ar: 'تأكيد' }))}</button>`,
    });
    m.el.addEventListener('click', (e) => {
      if (e.target.closest('[data-cancel]')) { m.close(); return; }
      if (!e.target.closest('[data-confirm]')) return;
      try { localStorage.setItem('kiwiSet:plan', target); } catch (_) {}
      m.close(); setTimeout(openProfile, 80);
      Kiwi.toast(pick({ fr: `Demande enregistrée, ${ti.name} au prochain cycle.`, en: `Saved, ${ti.name} from next cycle.`, ar: `تم الحفظ، ${ti.name} من الدورة القادمة.` }), { type: 'success', force: true });
    });
  }
  function planCancelModal() {
    const m = Kiwi.modal({
      tag: pick({ fr: 'RÉSILIATION', en: 'CANCELLATION', ar: 'إلغاء' }),
      title: pick({ fr: 'Résilier votre abonnement', en: 'Cancel your subscription', ar: 'إلغاء اشتراكك' }), width: 470,
      body: `<p style="font-size:14px; color:var(--n-600); line-height:1.6; margin:0 0 16px;">${esc(pick({
        fr: "La résiliation se fait avec votre account manager Kiwi, pour exporter vos données, planifier la transition et éviter toute interruption de service. Contactez-nous :",
        en: 'Cancellation goes through your Kiwi account manager, to export your data, plan the transition and avoid any service interruption. Reach us:',
        ar: 'يتم الإلغاء عبر مدير حسابك في كيوي, لتصدير بياناتك وتخطيط الانتقال وتجنّب أي انقطاع. تواصل معنا:' }))}</p>
        <div class="acc-contact" style="margin-bottom:0;">
          <div class="acc-contact-card" data-action="help-whatsapp"><div class="t">WhatsApp</div><div class="d">${esc(pick({ fr: 'Réponse < 5 min', en: 'Reply < 5 min', ar: 'رد < 5 د' }))}</div></div>
          <div class="acc-contact-card" data-action="account-help-mail"><div class="t">Email</div><div class="d">support@kiwi.ma</div></div>
          <div class="acc-contact-card" data-action="account-help-phone"><div class="t">${esc(pick({ fr: 'Téléphone', en: 'Phone', ar: 'الهاتف' }))}</div><div class="d">+212 5 39 00 12 00</div></div>
        </div>`,
      foot: `<button class="kb atlas" data-callback type="button" style="width:100%;justify-content:center;padding:12px;">${esc(pick({ fr: 'Demander un rappel pour résilier', en: 'Request a call-back to cancel', ar: 'طلب اتصال للإلغاء' }))}</button>`,
    });
    m.el.addEventListener('click', (e) => {
      if (!e.target.closest('[data-callback]')) return;
      m.close();
      Kiwi.toast(pick({ fr: 'Demande envoyée, votre account manager vous rappelle sous 24 h.', en: 'Request sent, your account manager will call you within 24h.', ar: 'تم إرسال الطلب، سيتصل بك مدير حسابك خلال 24 ساعة.' }), { type: 'success', force: true });
    });
  }

  /* ════════════════════════════ FACTURATION ════════════════════════════ */
  function openBilling() {
    const T = {
      title: pick({ fr: 'Facturation', en: 'Billing', ar: 'الفواتير' }),
      sub: pick({ fr: 'Abonnement & factures · Café Atlas', en: 'Subscription & invoices · Café Atlas', ar: 'الاشتراك والفواتير · مقهى أطلس' }),
      current: pick({ fr: 'VOTRE FORMULE', en: 'YOUR PLAN', ar: 'باقتك' }),
      nextDue: pick({ fr: 'Prochaine échéance : 1 juillet 2026', en: 'Next charge: 1 July 2026', ar: 'الاستحقاق القادم: 1 يوليو 2026' }),
      changePlan: pick({ fr: 'Changer de plan', en: 'Change plan', ar: 'تغيير الباقة' }),
      goUltra: pick({ fr: 'Passer à Ultra →', en: 'Upgrade to Ultra →', ar: 'الترقية إلى Ultra ←' }),
      payMethod: pick({ fr: 'Méthode de paiement', en: 'Payment method', ar: 'طريقة الدفع' }),
      card: pick({ fr: 'Visa •• 4291 · prélèvement le 1er du mois', en: 'Visa •• 4291 · charged on the 1st', ar: 'فيزا •• 4291 · الخصم يوم 1' }),
      update: pick({ fr: 'Mettre à jour', en: 'Update', ar: 'تحديث' }),
      usage: pick({ fr: 'Utilisation', en: 'Usage', ar: 'الاستخدام' }),
      terminals: pick({ fr: 'Terminaux', en: 'Terminals', ar: 'الطرفيات' }),
      venues: pick({ fr: 'Établissements', en: 'Venues', ar: 'المؤسسات' }),
      team: pick({ fr: "Membres d'équipe", en: 'Team members', ar: 'أعضاء الفريق' }),
      included: pick({ fr: 'Inclus dans Kiwi Pro', en: 'Included in Kiwi Pro', ar: 'مشمول في Kiwi Pro' }),
      history: pick({ fr: 'Historique des factures', en: 'Invoice history', ar: 'سجل الفواتير' }),
      period: pick({ fr: 'Période', en: 'Period', ar: 'الفترة' }),
      amount: pick({ fr: 'Montant', en: 'Amount', ar: 'المبلغ' }),
      status: pick({ fr: 'Statut', en: 'Status', ar: 'الحالة' }),
      invoice: pick({ fr: 'Facture', en: 'Invoice', ar: 'الفاتورة' }),
      paid: pick({ fr: 'Payée', en: 'Paid', ar: 'مدفوعة' }),
      pdf: pick({ fr: 'PDF', en: 'PDF', ar: 'PDF' }),
      dlToast: pick({ fr: 'Facture téléchargée (PDF)', en: 'Invoice downloaded (PDF)', ar: 'تم تنزيل الفاتورة (PDF)' }),
      payToast: pick({ fr: 'Pour des raisons de sécurité, mettez à jour votre carte depuis l\'app bancaire.', en: 'For security, update your card from your banking app.', ar: 'لأسباب أمنية، حدّث بطاقتك من تطبيق البنك.' }),
    };
    const incl = pick({
      fr: ['Caisse complète multi-vertical', '1 caisse Kiwi offerte', 'Règlement T+1 garanti', "Jusqu'à 8 membres d'équipe", 'Maintenance & remplacement matériel', 'Support WhatsApp 7j/7'],
      en: ['Full multi-vertical register', '1 free Kiwi cashier', 'Guaranteed T+1 settlement', 'Up to 8 team members', 'Hardware maintenance & replacement', '7-day WhatsApp support'],
      ar: ['صندوق كامل متعدد الأنشطة', 'صندوق كيوي مجاني', 'تسوية T+1 مضمونة', 'حتى 8 أعضاء فريق', 'صيانة واستبدال العتاد', 'دعم واتساب 7/7'],
    });
    const months = pick({
      fr: ['Mai 2026', 'Avril 2026', 'Mars 2026', 'Février 2026', 'Janvier 2026', 'Décembre 2025'],
      en: ['May 2026', 'April 2026', 'March 2026', 'February 2026', 'January 2026', 'December 2025'],
      ar: ['ماي 2026', 'أبريل 2026', 'مارس 2026', 'فبراير 2026', 'يناير 2026', 'دجنبر 2025'],
    });
    Kiwi.appPage('account-billing', {
      title: T.title, subtitle: T.sub,
      body: `
        <div class="acc-plan">
          <div>
            <div class="acc-plan-name">${esc(T.current)}</div>
            <div class="acc-plan-price">${esc(PLAN.name)} · 399 MAD<small>${esc(PLAN.cycle)}</small></div>
            <div class="acc-plan-meta">${esc(T.nextDue)}</div>
          </div>
          <div class="acc-plan-acts">
            <button class="acc-cta light" data-action="upgrade-pro">${esc(T.changePlan)}</button>
            <button class="acc-cta ghost" style="color:#fff;border-color:rgba(255,255,255,0.4);" data-action="upgrade-pro">${esc(T.goUltra)}</button>
          </div>
        </div>
        <div class="acc-grid">
          <div class="acc-card">
            <div class="acc-eyebrow">${esc(T.payMethod)}</div>
            <p style="font-size:13.5px; margin:0 0 12px;">${esc(T.card)}</p>
            <button class="acc-cta ghost" data-action="account-update-card">${esc(T.update)}</button>
          </div>
          <div class="acc-card">
            <div class="acc-eyebrow">${esc(T.usage)}</div>
            <div class="acc-row"><span>${esc(T.terminals)}</span><b>4</b></div>
            <div class="acc-row"><span>${esc(T.venues)}</span><b>3</b></div>
            <div class="acc-row"><span>${esc(T.team)}</span><b>15</b></div>
          </div>
        </div>
        <div class="acc-sec-title">${esc(T.included)}</div>
        <div class="acc-card span2"><div class="acc-chips">${incl.map((i) => `<span class="acc-chip">${esc(i)}</span>`).join('')}</div></div>
        <div class="acc-sec-title">${esc(T.history)}</div>
        <div class="acc-card span2">
          <table class="acc-tbl">
            <thead><tr><th>${esc(T.period)}</th><th>${esc(T.amount)}</th><th>${esc(T.status)}</th><th>${esc(T.invoice)}</th></tr></thead>
            <tbody>${months.map((m) => `<tr><td>${esc(m)}</td><td>399 MAD</td><td><span class="acc-paid">✓ ${esc(T.paid)}</span></td><td><a class="acc-dl" data-action="account-dl-invoice">${esc(T.pdf)}</a></td></tr>`).join('')}</tbody>
          </table>
        </div>`,
    });
    handlers['account-dl-invoice'] = () => Kiwi.toast(T.dlToast, { type: 'success', force: true });
    handlers['account-update-card'] = () => Kiwi.toast(T.payToast, { type: 'info', force: true });
  }

  /* ════════════════════════════ CENTRE D'AIDE ════════════════════════════ */
  function openHelp() {
    const T = {
      title: pick({ fr: "Centre d'aide", en: 'Help centre', ar: 'مركز المساعدة' }),
      sub: pick({ fr: 'Support · guides · état du système', en: 'Support · guides · system status', ar: 'الدعم · الأدلة · حالة النظام' }),
      search: pick({ fr: 'Rechercher dans l\'aide…', en: 'Search help…', ar: 'ابحث في المساعدة…' }),
      waT: pick({ fr: 'WhatsApp', en: 'WhatsApp', ar: 'واتساب' }),
      waD: pick({ fr: 'Réponse < 5 min · 7j/7', en: 'Reply < 5 min · 7 days', ar: 'رد خلال 5 دقائق · 7/7' }),
      mailT: pick({ fr: 'Email', en: 'Email', ar: 'البريد' }),
      mailD: 'support@kiwi.ma',
      phoneT: pick({ fr: 'Téléphone', en: 'Phone', ar: 'الهاتف' }),
      phoneD: '+212 5 39 00 12 00',
      topics: pick({ fr: 'Sujets populaires', en: 'Popular topics', ar: 'مواضيع شائعة' }),
      guides: pick({ fr: 'Guides récents', en: 'Recent guides', ar: 'أدلة حديثة' }),
      statusT: pick({ fr: 'Kiwi Status · 99,99 % opérationnel · aucun incident', en: 'Kiwi Status · 99.99% operational · no incident', ar: 'حالة كيوي · 99.99٪ تعمل · لا أعطال' }),
      open: pick({ fr: 'Ouvrir le chat WhatsApp', en: 'Open WhatsApp chat', ar: 'فتح محادثة واتساب' }),
    };
    const topics = pick({
      fr: [['Démarrer avec Kiwi', '6 articles'], ['Caisse & encaissement', '9 articles'], ['Matériel & terminaux', '5 articles'], ['Équipe & accès', '4 articles'], ['Stock & fournisseurs', '7 articles'], ['Facturation & abonnement', '3 articles']],
      en: [['Getting started', '6 articles'], ['Register & payments', '9 articles'], ['Hardware & terminals', '5 articles'], ['Team & access', '4 articles'], ['Stock & suppliers', '7 articles'], ['Billing & subscription', '3 articles']],
      ar: [['البدء مع كيوي', '6 مقالات'], ['الصندوق والتحصيل', '9 مقالات'], ['العتاد والطرفيات', '5 مقالات'], ['الفريق والصلاحيات', '4 مقالات'], ['المخزون والموردون', '7 مقالات'], ['الفواتير والاشتراك', '3 مقالات']],
    });
    const guides = pick({
      fr: ['Configurer le plan de salle en 5 minutes', 'Router les commandes vers le bon écran cuisine', 'Clôturer la caisse et générer le rapport Z'],
      en: ['Set up your floor plan in 5 minutes', 'Route orders to the right kitchen screen', 'Close the register and generate the Z report'],
      ar: ['إعداد مخطط القاعة في 5 دقائق', 'توجيه الطلبات إلى شاشة المطبخ الصحيحة', 'إغلاق الصندوق وإنشاء تقرير Z'],
    });
    Kiwi.appPage('account-help', {
      title: T.title, subtitle: T.sub,
      body: `
        <input class="acc-search" type="search" placeholder="${esc(T.search)}" data-action="" aria-label="${esc(T.search)}"/>
        <div class="acc-contact">
          <div class="acc-contact-card" data-action="help-whatsapp"><div class="t">${esc(T.waT)}</div><div class="d">${esc(T.waD)}</div></div>
          <div class="acc-contact-card" data-action="account-help-mail"><div class="t">${esc(T.mailT)}</div><div class="d">${esc(T.mailD)}</div></div>
          <div class="acc-contact-card" data-action="account-help-phone"><div class="t">${esc(T.phoneT)}</div><div class="d">${esc(T.phoneD)}</div></div>
        </div>
        <div class="acc-sec-title">${esc(T.topics)}</div>
        <div class="acc-topics">
          ${topics.map(([t, n]) => `<div class="acc-topic" data-action="account-help-topic"><b>${esc(t)}</b><span>${esc(n)} →</span></div>`).join('')}
        </div>
        <div class="acc-sec-title">${esc(T.guides)}</div>
        <div class="acc-card span2">
          ${guides.map((g) => `<div class="acc-venue" style="cursor:pointer;" data-action="account-help-topic"><b>${esc(g)}</b><span>→</span></div>`).join('')}
        </div>
        <div class="acc-status"><span class="dot"></span>${esc(T.statusT)}</div>`,
    });
    handlers['account-help-mail'] = () => Kiwi.toast(T.mailD, { type: 'info', force: true });
    handlers['account-help-phone'] = () => Kiwi.toast(T.phoneD, { type: 'info', force: true });
    handlers['account-help-topic'] = () => Kiwi.toast(pick({ fr: 'Article ouvert · help.kiwi.ma', en: 'Article opened · help.kiwi.ma', ar: 'تم فتح المقال · help.kiwi.ma' }), { type: 'info', force: true });
  }

  /* ── Edit-profile modal (persists to kiwiSet:* like the Settings editors) ── */
  function editProfile() {
    const fld = 'width:100%;padding:11px 13px;border:1px solid var(--n-200);border-radius:10px;font-family:var(--sans);font-size:14px;color:var(--ink);background:var(--surface);outline:none;box-sizing:border-box;';
    const lbl = 'display:block;font-size:12px;font-weight:500;color:var(--n-600);margin:16px 0 6px;';
    const L = (k) => pick(k);
    const fields = [
      { k: 'ownerName', label: L({ fr: 'Nom complet', en: 'Full name', ar: 'الاسم الكامل' }), cur: ownerName() },
      { k: 'ownerEmail', label: L({ fr: 'Email', en: 'Email', ar: 'البريد الإلكتروني' }), cur: ownerEmail() },
      { k: 'ownerPhone', label: L({ fr: 'Téléphone', en: 'Phone', ar: 'الهاتف' }), cur: ownerPhone() },
    ];
    const m = Kiwi.modal({
      tag: pick({ fr: 'PROFIL', en: 'PROFILE', ar: 'الملف' }),
      title: L({ fr: 'Modifier mon profil', en: 'Edit my profile', ar: 'تعديل ملفي' }),
      width: 460,
      body: '<style>.acc-f:focus{border-color:var(--atlas)!important;}</style>' + fields.map((f, i) =>
        `<label style="${lbl}${i === 0 ? 'margin-top:2px;' : ''}">${esc(f.label)}</label><input class="acc-f" data-f="${f.k}" maxlength="60" style="${fld}"/>`).join(''),
      foot: `<button class="kb atlas" data-save type="button" style="width:100%;justify-content:center;padding:12px;font-size:15px;">${esc(L({ fr: 'Enregistrer', en: 'Save', ar: 'حفظ' }))}</button>`,
    });
    fields.forEach((f) => { m.el.querySelector(`[data-f="${f.k}"]`).value = f.cur; });
    setTimeout(() => { const a = m.el.querySelector('.acc-f'); if (a) a.focus(); }, 320);
    m.el.addEventListener('click', (e) => {
      if (!e.target.closest('[data-save]')) return;
      fields.forEach((f) => { const v = (m.el.querySelector(`[data-f="${f.k}"]`).value || '').trim(); if (v) { try { localStorage.setItem('kiwiSet:' + f.k, v); } catch (_) {} } });
      m.close();
      setTimeout(() => openProfile(), 80);
      Kiwi.toast(pick({ fr: 'Profil mis à jour', en: 'Profile updated', ar: 'تم تحديث الملف' }), { type: 'success', force: true });
    });
  }

  handlers['account-profile'] = openProfile;
  handlers['account-billing'] = openBilling;
  handlers['account-help'] = openHelp;
  handlers['account-edit-profile'] = editProfile;
})();
