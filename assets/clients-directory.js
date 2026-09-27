/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · CLIENTS — dashboard directory  (assets/clients-directory.js)
 * ---------------------------------------------------------------------------
 * The owner's address book: every client captured on the caisse (name, phone,
 * EMAIL, city, birthday…) with their fidelity stats, segment and consent — the
 * "see their email & phone number" surface, distinct from the marketing composer
 * (growth-crm.js). Reads the same shared KiwiClients book (clients-store.js), so
 * a client added on the till appears here live. Searchable, filterable, exportable.
 *
 * Triggered from the sidebar « Clients » entry (data-action="clients-directory").
 * Falls back to a demo directory when there is no real/paired store, so the pitch
 * demo (Café Atlas) stays populated. Vanilla; requires interactive.js (window.Kiwi).
 * ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (!window.Kiwi) { console.warn('clients-directory.js loaded before interactive.js'); return; }
  var Kiwi = window.Kiwi;
  var lang = function () { try { return (window.KiwiI18n && KiwiI18n.getLang && KiwiI18n.getLang()) || 'fr'; } catch (_) { return 'fr'; } };
  var fmt = function (n) { try { return (Math.round(n) || 0).toLocaleString('fr-FR'); } catch (_) { return String(Math.round(n) || 0); } };
  var esc = function (x) { return String(x == null ? '' : x).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); };
  var ICON = { search: 'M784-120 532-372q-30 24-69 38t-83 14q-109 0-184.5-75.5T120-580q0-109 75.5-184.5T380-840q109 0 184.5 75.5T640-580q0 44-14 83t-38 69l252 252-56 56ZM380-400q75 0 127.5-52.5T560-580q0-75-52.5-127.5T380-760q-75 0-127.5 52.5T200-580q0 75 52.5 127.5T380-400Z', download: 'M480-320 280-520l56-58 104 104v-326h80v326l104-104 56 58-200 200ZM240-160q-33 0-56.5-23.5T160-240v-120h80v120h480v-120h80v120q0 33-23.5 56.5T720-160H240Z', redeem: 'M160-280v80h640v-80H160Zm0-440h88q-5-9-6.5-19t-1.5-21q0-50 35-85t85-35q30 0 55.5 15.5T460-826l20 26 20-26q18-24 44-39t56-15q50 0 85 35t35 85q0 11-1.5 21t-6.5 19h88q33 0 56.5 23.5T880-640v440q0 33-23.5 56.5T800-120H160q-33 0-56.5-23.5T80-200v-440q0-33 23.5-56.5T160-720Zm0 320h640v-240H596l84 114-64 46-136-184-136 184-64-46 82-114H160v240Zm228.5-331.5Q400-743 400-760t-11.5-28.5Q377-800 360-800t-28.5 11.5Q320-777 320-760t11.5 28.5Q343-720 360-720t28.5-11.5ZM600-720q17 0 28.5-11.5T640-760q0-17-11.5-28.5T600-800q-17 0-28.5 11.5T560-760q0 17 11.5 28.5T600-720Z', personAdd: 'M720-400v-120H600v-80h120v-120h80v120h120v80H800v120h-80ZM247-527q-47-47-47-113t47-113q47-47 113-47t113 47q47 47 47 113t-47 113q-47 47-113 47t-113-47ZM40-160v-112q0-34 17.5-62.5T104-378q62-31 126-46.5T360-440q66 0 130 15.5T616-378q29 15 46.5 43.5T680-272v112H40Zm80-80h480v-32q0-11-5.5-20T580-306q-54-27-109-40.5T360-360q-56 0-111 13.5T140-306q-9 5-14.5 14t-5.5 20v32Zm296.5-343.5Q440-607 440-640t-23.5-56.5Q393-720 360-720t-56.5 23.5Q280-673 280-640t23.5 56.5Q327-560 360-560t56.5-23.5ZM360-640Zm0 400Z', group: 'M40-160v-112q0-34 17.5-62.5T104-378q62-31 126-46.5T360-440q66 0 130 15.5T616-378q29 15 46.5 43.5T680-272v112H40Zm720 0v-120q0-44-24.5-84.5T666-434q51 6 96 20.5t84 35.5q36 20 55 44.5t19 53.5v120H760ZM247-527q-47-47-47-113t47-113q47-47 113-47t113 47q47 47 47 113t-47 113q-47 47-113 47t-113-47Zm466 0q-47 47-113 47-11 0-28-2.5t-28-5.5q27-32 41.5-71t14.5-81q0-42-14.5-81T544-792q14-5 28-6.5t28-1.5q66 0 113 47t47 113q0 66-47 113ZM120-240h480v-32q0-11-5.5-20T580-306q-54-27-109-40.5T360-360q-56 0-111 13.5T140-306q-9 5-14.5 14t-5.5 20v32Zm296.5-343.5Q440-607 440-640t-23.5-56.5Q393-720 360-720t-56.5 23.5Q280-673 280-640t23.5 56.5Q327-560 360-560t56.5-23.5ZM360-240Zm0-400Z', campaign: 'M720-440v-80h160v80H720Zm48 280-128-96 48-64 128 96-48 64Zm-80-480-48-64 128-96 48 64-128 96ZM200-200v-160h-40q-33 0-56.5-23.5T80-440v-80q0-33 23.5-56.5T160-600h160l200-120v480L320-360h-40v160h-80Zm240-182v-196l-98 58H160v80h182l98 58Zm120 36v-268q27 24 43.5 58.5T620-480q0 41-16.5 75.5T560-346ZM300-480Z' };
  var ico = function (k) { return '<svg viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true"><path d="' + ICON[k] + '"/></svg>'; };
  // Campaign delivery is not offered to regular stores. Preserve the composer
  // for a future Ultra rollout, but opt in explicitly rather than guessing
  // eligibility from venue type or a marketing label.
  var campaignsEnabled = function () { return window.KiwiConfig?.features?.ultraCampaigns === true; };

  var STR = {
    fr: { title: 'Clients', sub: 'Le carnet complet · coordonnées, fidélité et consentement.',
      search: 'Rechercher un nom, téléphone ou email…', export: 'Exporter (CSV)', campaign: 'Campagne', program: 'Programme de fidélité', newClient: '+ Nouveau client',
      total: 'clients', withEmail: 'avec email', withPhone: 'avec téléphone', consented: 'contactables',
      seg: { all: 'Tous', reg: 'Réguliers', vip: 'VIP', new: 'Nouveaux', win: 'Dormants' },
      th: { name: 'Client', phone: 'Téléphone', email: 'Email', city: 'Ville', visits: 'Visites', spend: 'Dépensé', points: 'Points', seg: 'Segment', last: 'Dernière visite' },
      tag: { reg: 'Régulier', vip: 'VIP', new: 'Nouveau', win: 'Dormant' }, none: '·', empty: 'Aucun client · créez la première fiche avec « Nouveau client ».',
      ago: function (d) { return d === 0 ? "aujourd'hui" : 'il y a ' + d + ' j'; }, close: 'Fermer',
      detail: 'Fiche client', birthday: 'Anniversaire', gender: 'Genre', address: 'Adresse', notes: 'Notes', consent: 'Consentement', consentWa: 'WhatsApp / SMS', consentEmail: 'Email', firstSeen: 'Client depuis',
      history: 'Historique des achats', noHistory: 'Aucun détail d’achat enregistré.', noHistorySub: 'Les prochains tickets attachés à ce client apparaîtront ici.', ticket: 'Ticket', unknownDate: 'Date inconnue', unknownPayment: 'Mode non renseigné', purchase: 'Achat enregistré',
      newShort: 'Nouveau client', loyalty: 'Fidélité', emptyTitle: 'Votre carnet est encore vide', emptyText: 'Ajoutez une fiche ici, ou enregistrez un client sur la caisse : il apparaîtra automatiquement.', noMatch: 'Aucun client ne correspond', noMatchText: 'Essayez un autre nom, numéro ou segment.', clear: 'Tout afficher', noneYet: 'Aucun pour l’instant', ofBook: 'du carnet', shared: 'Partagé avec la caisse', currency: 'MAD',
      form: { title: 'Nouveau client', sub: 'La fiche rejoint le carnet partagé, avec ou sans caisse.', save: 'Ajouter', cancel: 'Annuler',
        needNameOrPhone: 'Renseignez au moins un nom ou un numéro.', badPhone: 'Numéro invalide · pour l’étranger, ajoutez + et l’indicatif pays.',
        consentRequired: 'Le consentement est requis · cochez la case WhatsApp / SMS pour enregistrer.', alreadyExists: 'Client déjà enregistré', added: 'Client ajouté' } },
    en: { title: 'Customers', sub: 'The full book · contacts, loyalty and consent.',
      search: 'Search name, phone or email…', export: 'Export (CSV)', campaign: 'Campaign', program: 'Loyalty program', newClient: '+ New customer', total: 'customers', withEmail: 'with email', withPhone: 'with phone', consented: 'contactable',
      seg: { all: 'All', reg: 'Regulars', vip: 'VIP', new: 'New', win: 'Dormant' },
      th: { name: 'Customer', phone: 'Phone', email: 'Email', city: 'City', visits: 'Visits', spend: 'Spent', points: 'Points', seg: 'Segment', last: 'Last visit' },
      tag: { reg: 'Regular', vip: 'VIP', new: 'New', win: 'Dormant' }, none: '·', empty: 'No customers yet · create the first record with “New customer”.',
      ago: function (d) { return d === 0 ? 'today' : d + 'd ago'; }, close: 'Close',
      detail: 'Customer', birthday: 'Birthday', gender: 'Gender', address: 'Address', notes: 'Notes', consent: 'Consent', consentWa: 'WhatsApp / SMS', consentEmail: 'Email', firstSeen: 'Customer since',
      history: 'Purchase history', noHistory: 'No purchase details recorded.', noHistorySub: 'Future tickets attached to this customer will appear here.', ticket: 'Ticket', unknownDate: 'Unknown date', unknownPayment: 'Payment method unavailable', purchase: 'Recorded purchase',
      newShort: 'New customer', loyalty: 'Loyalty', emptyTitle: 'Your book is still empty', emptyText: 'Add a record here, or save a customer on the till: it shows up here automatically.', noMatch: 'No customer matches', noMatchText: 'Try another name, number or segment.', clear: 'Show all', noneYet: 'None yet', ofBook: 'of the book', shared: 'Shared with the till', currency: 'MAD',
      form: { title: 'New customer', sub: 'The record joins the shared book, with or without a till.', save: 'Add', cancel: 'Cancel',
        needNameOrPhone: 'Enter at least a name or a phone number.', badPhone: 'Invalid number · abroad, add + and the country code.',
        consentRequired: 'Consent is required · tick WhatsApp / SMS to save.', alreadyExists: 'Customer already on file', added: 'Customer added' } },
    ar: { title: 'العملاء', sub: 'الدفتر الكامل · جهات الاتصال والوفاء والموافقة.',
      search: 'ابحث بالاسم أو الهاتف أو البريد…', export: 'تصدير (CSV)', campaign: 'حملة', program: 'برنامج الوفاء', newClient: '+ عميل جديد', total: 'عميل', withEmail: 'ببريد', withPhone: 'بهاتف', consented: 'قابلون للتواصل',
      seg: { all: 'الكل', reg: 'دائمون', vip: 'كبار', new: 'جدد', win: 'خاملون' },
      th: { name: 'العميل', phone: 'الهاتف', email: 'البريد', city: 'المدينة', visits: 'الزيارات', spend: 'الإنفاق', points: 'النقاط', seg: 'الفئة', last: 'آخر زيارة' },
      tag: { reg: 'دائم', vip: 'كبير', new: 'جديد', win: 'خامل' }, none: '·', empty: 'لا يوجد عملاء بعد · أنشئ أول بطاقة بزر «عميل جديد».',
      ago: function (d) { return d === 0 ? 'اليوم' : 'منذ ' + d + ' ي'; }, close: 'إغلاق',
      detail: 'بطاقة العميل', birthday: 'الميلاد', gender: 'الجنس', address: 'العنوان', notes: 'ملاحظات', consent: 'الموافقة', consentWa: 'واتساب / SMS', consentEmail: 'بريد', firstSeen: 'عميل منذ',
      history: 'سجل المشتريات', noHistory: 'لا توجد تفاصيل مشتريات مسجلة.', noHistorySub: 'ستظهر هنا التذاكر القادمة المرتبطة بهذا العميل.', ticket: 'التذكرة', unknownDate: 'تاريخ غير معروف', unknownPayment: 'طريقة الدفع غير مسجلة', purchase: 'عملية شراء مسجلة',
      newShort: 'عميل جديد', loyalty: 'الوفاء', emptyTitle: 'دفترك ما زال فارغاً', emptyText: 'أضف بطاقة هنا، أو سجّل عميلاً على الصندوق وسيظهر هنا تلقائياً.', noMatch: 'لا يوجد عميل مطابق', noMatchText: 'جرّب اسماً أو رقماً أو فئة أخرى.', clear: 'عرض الكل', noneYet: 'لا أحد بعد', ofBook: 'من الدفتر', shared: 'مشترك مع الصندوق', currency: 'درهم',
      form: { title: 'عميل جديد', sub: 'ينضم الملف إلى الدفتر المشترك، بالصندوق أو بدونه.', save: 'إضافة', cancel: 'إلغاء',
        needNameOrPhone: 'أدخل الاسم أو رقم الهاتف على الأقل.', badPhone: 'رقم غير صالح · للخارج أضف + ورمز البلد.',
        consentRequired: 'الموافقة مطلوبة · حدّد واتساب / SMS للحفظ.', alreadyExists: 'العميل مسجل مسبقاً', added: 'تمت إضافة العميل' } },
  };

  var SEG_LBL = function (T, id) { return T.tag[id] || id; };
  var DAY = 86400000;
  function daysSince(ts) { return ts ? Math.floor((Date.now() - ts) / DAY) : Infinity; }
  function hospitalityMode() {
    try {
      var V = window.KiwiVenue;
      var d = V && V.getCurrentVenueData && V.getCurrentVenueData();
      var type = (V && V.getVenueType && V.getVenueType()) || (d && (d.type || d.kind)) || '';
      return String(type).toLowerCase() === 'hotel';
    } catch (_) { return false; }
  }
  var HOTEL = {
    fr: { title: 'Hospitality+', sub: 'Chaque séjour enrichit une seule fiche client · identité, préférences et attention personnalisée.', empty: 'Aucun client · créez la première fiche avec « Nouveau client ».',
      nationality: 'Nationalité', identity: 'Passeport / ID', language: 'Langue', room: 'Préférences chambre', food: 'Préférences repas', allergies: 'Allergies', access: 'Besoins particuliers', stays: 'Séjours' },
    en: { title: 'Hospitality+', sub: 'Every stay enriches one guest profile · identity, preferences and personalised care.', empty: 'No guests yet · create the first profile with “New customer”.',
      nationality: 'Nationality', identity: 'Passport / ID', language: 'Language', room: 'Room preferences', food: 'Food preferences', allergies: 'Allergies', access: 'Accessibility needs', stays: 'Stays' },
    ar: { title: 'Hospitality+', sub: 'كل إقامة تثري ملف ضيف واحداً · الهوية والتفضيلات والعناية الشخصية.', empty: 'لا يوجد ضيوف بعد · أنشئ أول ملف بزر «عميل جديد».',
      nationality: 'الجنسية', identity: 'جواز السفر / الهوية', language: 'اللغة', room: 'تفضيلات الغرفة', food: 'تفضيلات الطعام', allergies: 'الحساسيات', access: 'احتياجات خاصة', stays: 'الإقامات' },
  };

  // Demo directory — shown only when there's no real/paired store (pitch demo).
  var DEMO = [
    { name: 'Salma Fassi', phone: '0661 42 18 30', email: 'salma.fassi@gmail.com', city: 'Casablanca', birthday: '1988-03-14', gender: 'Femme', visits: 31, spend: 11780, points: 11780, consent: true, consentEmail: true, seg: 'vip', last: 2, firstSeen: 420 },
    { name: 'Nawal Karimi', phone: '0662 55 09 77', email: 'nawal.k@outlook.fr', city: 'Rabat', birthday: '1990-11-02', gender: 'Femme', visits: 24, spend: 3408, points: 3408, consent: true, consentEmail: false, seg: 'reg', last: 3, firstSeen: 300 },
    { name: 'Imane Saidi', phone: '0655 71 20 44', email: '', city: 'Tanger', birthday: '', gender: 'Femme', visits: 22, spend: 3124, points: 3124, consent: true, consentEmail: false, seg: 'reg', last: 7, firstSeen: 260 },
    { name: 'Karim Bennani', phone: '0670 88 12 05', email: 'k.bennani@gmail.com', city: 'Casablanca', birthday: '1983-06-21', gender: 'Homme', visits: 19, spend: 2698, points: 2698, consent: true, consentEmail: true, seg: 'reg', last: 5, firstSeen: 240 },
    { name: 'Youssef Amrani', phone: '0661 03 44 88', email: 'y.amrani@gmail.com', city: 'Marrakech', birthday: '1979-01-09', gender: 'Homme', visits: 14, spend: 6210, points: 6210, consent: true, consentEmail: true, seg: 'win', last: 41, firstSeen: 500 },
    { name: 'Mehdi Cherkaoui', phone: '0678 22 61 30', email: 'mehdi.c@gmail.com', city: 'Fès', birthday: '1995-08-17', gender: 'Homme', visits: 8, spend: 1136, points: 1136, consent: true, consentEmail: false, seg: 'new', last: 12, firstSeen: 22 },
    { name: 'Hind Moujahid', phone: '0654 90 71 12', email: '', city: 'Agadir', birthday: '', gender: 'Femme', visits: 6, spend: 940, points: 940, consent: false, consentEmail: false, seg: 'win', last: 38, firstSeen: 210 },
    { name: 'Walid Fassi', phone: '0663 18 55 40', email: 'walid.fassi@gmail.com', city: 'Casablanca', birthday: '1998-12-05', gender: 'Homme', visits: 5, spend: 720, points: 720, consent: true, consentEmail: true, seg: 'new', last: 9, firstSeen: 18 },
  ];

  function isRealTenant() {
    try { if (window.KiwiEnv && KiwiEnv.isReal && KiwiEnv.isReal()) return true; } catch (_) {} // hosted / signed-in → always real
    try { if (window.KiwiMe) return true; } catch (_) {}
    try {
      if (window.KiwiPlatform && typeof window.KiwiPlatform.isPaired === 'function' && window.KiwiPlatform.isPaired()) return true;
      var P = window.KiwiCaissePairing;
      if (P && P.isPaired && P.isPaired() && P.pairedVenue && (P.pairedVenue() || {}).merchant) return true;
      if (localStorage.getItem('kiwiPaired') === '1') {
        var pv = JSON.parse(localStorage.getItem('kiwiPairedVenue') || 'null');
        if ((pv && pv.merchant) || localStorage.getItem('kiwiLiveMerchant')) return true;
      }
    } catch (_) {}
    try { if (window.KiwiVenue && KiwiVenue.isCustom && KiwiVenue.isCustom()) return true; } catch (_) {}
    return false;
  }
  // Returns { rows:[…], real:bool }. Rows carry a uniform shape for the table.
  function load() {
    var KCl = window.KiwiClients;
    /* A real tenant with no book is an empty address book, not permission to
       fall through to Salma/Nawal and their phone numbers. */
    if (isRealTenant() && (!KCl || !KCl.hasBook || !KCl.hasBook())) {
      return { rows: [], real: true };
    }
    if (KCl && KCl.hasBook && KCl.hasBook() && (KCl.count() > 0 || isRealTenant())) {
      var rows = KCl.list().map(function (c) {
        return { id: c.id, name: c.name, phone: c.phone, email: c.email, city: c.city, address: c.address,
          birthday: c.birthday, gender: c.gender, notes: c.notes, hospitality: c.hospitality || {}, visits: c.visits, spend: c.spend,
          points: c.points, consent: c.consent, consentEmail: c.consentEmail, seg: KCl.segment(c),
          history: Array.isArray(c.history) ? c.history.slice(0, 50) : [],
          last: daysSince(c.lastSeen) === Infinity ? 0 : daysSince(c.lastSeen), firstSeen: daysSince(c.firstSeen) };
      });
      return { rows: rows, real: true };
    }
    return { rows: DEMO.map(function (c, i) { return Object.assign({ id: 'demo' + i, address: '', notes: '' }, c); }), real: false };
  }

  var CSS = [
    '.cd{display:flex;flex-direction:column;gap:16px;min-width:0;}',
    '.cd-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;}',
    '.cd-kpi{border:1px solid var(--n-200);border-radius:20px;background:var(--surface);padding:18px 20px;min-width:0;}',
    '.cd-kpi .l{display:flex;align-items:center;gap:8px;font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--n-500);}',
    '.cd-kpi .l i{width:6px;height:6px;border-radius:50%;background:var(--atlas);flex:none;}',
    '.cd-kpi .v{font-size:32px;font-weight:600;line-height:1;letter-spacing:-.025em;margin-top:14px;font-variant-numeric:tabular-nums;color:var(--ink);}',
    '.cd-kpi .h{font-size:12px;color:var(--n-500);margin-top:8px;font-variant-numeric:tabular-nums;}',
    '.cd-kpi .h b{color:var(--atlas);font-weight:600;}',
    '.cd-bar{display:flex;flex-direction:column;align-items:flex-start;gap:12px;}',
    '.cd-segs{display:flex;gap:2px;padding:4px;border-radius:999px;background:var(--n-100);border:1px solid var(--n-200);overflow-x:auto;scrollbar-width:none;max-width:100%;}',
    '.cd-segs::-webkit-scrollbar{display:none;}',
    '.cd-seg{flex:none;border:0;background:transparent;color:var(--n-600);font:inherit;font-size:13px;font-weight:500;padding:7px 14px;border-radius:999px;cursor:pointer;white-space:nowrap;transition:color .2s;}',
    '.cd-seg em{font-style:normal;color:var(--n-500);margin-inline-start:6px;font-variant-numeric:tabular-nums;}',
    '.cd-seg.on{color:var(--ink);}',
    '.cd-seg:not([data-kw-lens] *).on{background:var(--surface);box-shadow:0 1px 2px rgba(0,0,0,.08);}',
    '.genpage-body .cd-segs .kw-lens{background:var(--surface);box-shadow:0 1px 3px rgba(0,0,0,.10),inset 0 1px 0 rgba(255,255,255,.4);}',
    '.cd-seg:focus-visible{outline:2px solid var(--atlas);outline-offset:1px;}',
    '.cd-actions{display:flex;align-items:center;gap:8px;width:100%;flex-wrap:wrap;}',
    '.cd-field{position:relative;display:flex;align-items:center;flex:1;min-width:220px;}',
    '.cd-field svg{position:absolute;inset-inline-start:13px;width:18px;height:18px;color:var(--n-500);pointer-events:none;}',
    '.cd-search{width:100%;height:42px;box-sizing:border-box;padding:0 14px 0 40px;border:1px solid var(--n-200);border-radius:999px;font:inherit;font-size:14px;background:var(--surface);color:var(--ink);}',
    '[dir="rtl"] .cd-search{padding:0 40px 0 14px;}',
    '.cd-search:focus{outline:none;border-color:var(--atlas);box-shadow:0 0 0 3px color-mix(in srgb,var(--atlas) 14%,transparent);}',
    '.cd-exp{display:inline-flex;align-items:center;gap:7px;height:42px;box-sizing:border-box;padding:0 16px;border:1px solid var(--n-200);border-radius:999px;background:var(--surface);color:var(--ink);font:inherit;font-size:13.5px;font-weight:600;cursor:pointer;white-space:nowrap;}',
    '.cd-exp svg{width:18px;height:18px;flex:none;}',
    '.cd-exp:hover{border-color:var(--atlas);color:var(--atlas);}',
    '.cd-exp:focus-visible{outline:2px solid var(--atlas);outline-offset:2px;}',
    '.cd-exp.cd-new,.cd-exp.cd-camp{background:var(--atlas);color:#fff;border-color:var(--atlas);}',
    '.cd-exp.cd-new:hover,.cd-exp.cd-camp:hover{filter:brightness(1.07);color:#fff;}',
    '.cd-tblwrap{overflow-x:auto;border:1px solid var(--n-200);border-radius:20px;background:var(--surface);}',
    '.cd-tbl{width:100%;border-collapse:collapse;min-width:860px;}',
    '.cd-tbl th{font-size:11px;font-weight:600;letter-spacing:.07em;text-transform:uppercase;color:var(--n-500);text-align:start;padding:14px 16px;white-space:nowrap;border-bottom:1px solid var(--n-200);}',
    '.cd-tbl th.num,.cd-tbl td.num{text-align:end;font-variant-numeric:tabular-nums;}',
    '.cd-tbl td{padding:12px 16px;font-size:13.5px;border-top:1px solid var(--n-200);white-space:nowrap;color:var(--ink);}',
    '.cd-tbl tbody tr:first-child td{border-top:0;}',
    '.cd-tbl tbody tr{cursor:pointer;transition:background-color .12s;}',
    '.cd-tbl tbody tr:hover td{background:color-mix(in srgb,var(--atlas) 5%,transparent);}',
    '.cd-tbl td.mono{font-variant-numeric:tabular-nums;}',
    '.cd-who{display:flex;align-items:center;gap:12px;}',
    '.cd-av{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;flex:none;font-size:12.5px;font-weight:600;letter-spacing:.02em;background:color-mix(in srgb,var(--atlas) 12%,transparent);color:var(--atlas);}',
    '.cd-nm{font-weight:600;}',
    '.cd-sub{display:block;font-size:12px;color:var(--n-500);font-weight:400;margin-top:2px;}',
    '.cd-muted{color:var(--n-500);}',
    '.cd-tag{display:inline-block;font-size:11.5px;font-weight:600;padding:4px 10px;border-radius:999px;}',
    '.cd-tag.reg{background:var(--mint-soft);color:#075238;}.cd-tag.vip{background:#FBF0D6;color:#8A6210;}.cd-tag.new{background:#E4ECF8;color:#3E78C9;}.cd-tag.win{background:#FBE3DD;color:#C0492F;}',
    '.cd-ok{color:var(--atlas);font-weight:700;}.cd-no{color: var(--n-500);}',
    '.cd-empty{display:flex;flex-direction:column;align-items:center;text-align:center;gap:10px;padding:56px 20px;border:1px dashed var(--n-200);border-radius:20px;background:var(--surface);}',
    '.cd-empty-ic{width:56px;height:56px;border-radius:50%;display:grid;place-items:center;background:color-mix(in srgb,var(--atlas) 10%,transparent);color:var(--atlas);margin-bottom:4px;}',
    '.cd-empty-ic svg{width:28px;height:28px;}',
    '.cd-empty b{font-size:17px;font-weight:600;color:var(--ink);text-wrap:balance;}',
    '.cd-empty p{margin:0;max-width:44ch;color:var(--n-500);font-size:14px;line-height:1.5;text-wrap:pretty;}',
    '.cd-empty .cd-exp{margin-top:8px;}',
    '.cd-drow{display:flex;justify-content:space-between;gap:16px;padding:11px 0;border-top:1px solid var(--n-200);font-size:13.5px;}',
    '.cd-drow:first-child{border-top:0;}.cd-drow .k{color:var(--n-500);}.cd-drow .v{font-weight:600;text-align:end;word-break:break-word;}',
    '.cd-f-sub{color:var(--n-500);font-size:13px;margin:2px 0 14px;}',
    '.cd-f-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px 12px;}',
    '.cd-f{display:flex;flex-direction:column;gap:6px;font-size:12.5px;color:var(--n-600);min-width:0;}',
    '.cd-f input,.cd-f select{padding:11px 12px;border:1px solid var(--n-200);border-radius:10px;font-size:14px;background:var(--surface);color:var(--ink);min-width:0;}',
    '.cd-f input:focus,.cd-f select:focus{outline:none;border-color:var(--atlas);box-shadow:0 0 0 3px rgba(11,110,79,.12);}',
    '.cd-f-check{display:flex;align-items:center;gap:8px;font-size:13px;margin-top:12px;cursor:pointer;}',
    '.cd-f-check input{width:17px;height:17px;accent-color:var(--atlas);flex:none;}',
    '.cd-f-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:18px;}',
    '.cd-history{margin-top:18px;}.cd-history-title{font:600 13px/1.2 inherit;margin-bottom:8px;color:var(--ink);}',
    '.cd-history-list{border:1px solid var(--n-200);border-radius:14px;overflow:hidden;background:var(--surface);}',
    '.cd-history-row{display:grid;grid-template-columns:minmax(112px,.7fr) minmax(180px,1.7fr) auto;gap:14px;align-items:start;padding:13px 14px;border-top:1px solid var(--n-200);font-size:13px;}',
    '.cd-history-row:first-child{border-top:0;}.cd-history-date,.cd-history-meta{color:var(--n-500);font-size:12px;}.cd-history-method{display:block;margin-top:3px;color:var(--ink);font-weight:600;}',
    '.cd-history-items{font-weight:600;line-height:1.4;overflow-wrap:anywhere;}.cd-history-meta{display:block;margin-top:4px;}.cd-history-amount{font-weight:700;white-space:nowrap;font-feature-settings:"tnum" 1;}',
    '.cd-history-empty{padding:22px 16px;text-align:center;color:var(--n-500);font-size:13px;}.cd-history-empty b{display:block;color:var(--ink);margin-bottom:4px;}',
    '@media(max-width:760px){.cd-kpis{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;}.cd-kpi{padding:14px 16px;border-radius:16px;}.cd-kpi .v{font-size:26px;margin-top:10px;}',
    '  .cd-actions .cd-exp:not(.cd-new) span{display:none;}.cd-actions .cd-exp:not(.cd-new){width:42px;padding:0;justify-content:center;}.cd-field{flex-basis:100%;}.cd-actions .cd-new{flex:1;justify-content:center;}}',
    '@media(max-width:620px){.cd-history-row{grid-template-columns:1fr auto;}.cd-history-date{grid-column:1/-1}.cd-history-amount{grid-column:2;grid-row:2}.cd-history-items{grid-column:1;grid-row:2}.cd-f-grid{grid-template-columns:1fr;}}',
    'html[data-theme="dark"] .cd-history-list{border-color:var(--n-200);}',
  ].join('');
  var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);

  function csvExport(rows, T) {
    var head = [T.th.name, T.th.phone, T.th.email, T.th.city, T.birthday, T.th.visits, T.th.spend, T.th.points, T.th.seg, T.consentWa, T.consentEmail];
    var body = rows.map(function (c) {
      return [c.name || '', c.phone || '', c.email || '', c.city || '', c.birthday || '', c.visits || 0, c.spend || 0, c.points || 0, SEG_LBL(T, c.seg), c.consent ? 'oui' : 'non', c.consentEmail ? 'oui' : 'non'];
    });
    if (hospitalityMode()) {
      var H = HOTEL[lang()] || HOTEL.fr;
      head = head.concat([H.nationality, H.identity, H.language, H.room, H.food, H.allergies, H.access]);
      body = body.map(function (r, i) {
        var h = rows[i].hospitality || {};
        return r.concat([h.nationality || '', [h.documentType, h.documentNumber].filter(Boolean).join(' · '), h.preferredLanguage || '', h.roomPreferences || '', h.foodPreferences || '', h.allergies || '', h.accessibilityNeeds || '']);
      });
    }
    var csvCell = function (v) {
      var s = String(v == null ? '' : v);
      // Excel/LibreOffice execute cells beginning with these characters. Client
      // names and emails are untrusted input, even when correctly CSV-quoted.
      if (/^[\t\r ]*[=+\-@]/.test(s)) s = "'" + s;
      return '"' + s.replace(/"/g, '""') + '"';
    };
    var csv = [head].concat(body).map(function (r) { return r.map(csvCell).join(','); }).join('\r\n');
    try {
      var blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a'); a.href = url; a.download = 'kiwi-clients.csv';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
    } catch (_) {}
  }

  window.Kiwi.handlers['clients-directory'] = function () {
    var T = STR[lang()] || STR.fr;
    var hotel = hospitalityMode();
    var H = HOTEL[lang()] || HOTEL.fr;
    if (hotel) T = Object.assign({}, T, { title: H.title, sub: H.sub, empty: H.empty });
    var data = load();
    var all = data.rows.slice().sort(function (a, b) { return (b.spend || 0) - (a.spend || 0); });
    var state = { q: '', seg: 'all' };

    function withEmail() { return all.filter(function (c) { return c.email; }).length; }
    function withPhone() { return all.filter(function (c) { return c.phone; }).length; }
    function contactable() { return all.filter(function (c) { return c.consent; }).length; }

    function filtered() {
      var q = state.q.trim().toLowerCase();
      return all.filter(function (c) {
        if (state.seg !== 'all' && c.seg !== state.seg) return false;
        if (!q) return true;
        return (c.name || '').toLowerCase().indexOf(q) >= 0 ||
          String(c.phone || '').replace(/\s/g, '').indexOf(q.replace(/\s/g, '')) >= 0 ||
          (c.email || '').toLowerCase().indexOf(q) >= 0 ||
          (c.city || '').toLowerCase().indexOf(q) >= 0 ||
          (hotel && Object.keys(c.hospitality || {}).some(function (k) { return String(c.hospitality[k] || '').toLowerCase().indexOf(q) >= 0; }));
      });
    }

    function initials(name) {
      var parts = String(name || '').trim().split(/\s+/).filter(Boolean);
      return esc(((parts[0] || '·').charAt(0) + (parts.length > 1 ? parts[parts.length - 1].charAt(0) : '')).toUpperCase());
    }
    function whoCell(c, sub) {
      return '<td><div class="cd-who"><span class="cd-av" aria-hidden="true">' + initials(c.name || c.phone) + '</span><span class="cd-nm">' +
        esc(c.name || T.none) + (sub ? '<span class="cd-sub">' + esc(sub) + '</span>' : '') + '</span></div></td>';
    }
    function rowHtml(c) {
      if (hotel) {
        var h = c.hospitality || {};
        var identity = [h.documentType, h.documentNumber].filter(Boolean).join(' · ') || T.none;
        return '<tr data-cd-id="' + esc(c.id) + '">' +
          whoCell(c, h.preferredLanguage) +
          '<td class="mono">' + esc(c.phone || T.none) + '</td>' +
          '<td>' + esc(h.nationality || T.none) + '</td>' +
          '<td class="mono">' + esc(identity) + '</td>' +
          '<td>' + esc(h.roomPreferences || T.none) + '</td>' +
          '<td class="' + (h.allergies ? '' : 'cd-muted') + '">' + esc(h.allergies || T.none) + '</td>' +
          '<td class="num">' + (c.visits || 0) + '</td>' +
          '<td class="num">' + fmt(c.spend) + ' ' + T.currency + '</td>' +
          '<td class="cd-muted">' + T.ago(c.last) + '</td></tr>';
      }
      return '<tr data-cd-id="' + esc(c.id) + '">' +
        whoCell(c, c.city) +
        '<td class="mono">' + esc(c.phone || T.none) + '</td>' +
        '<td class="' + (c.email ? '' : 'cd-muted') + '">' + esc(c.email || T.none) + '</td>' +
        '<td class="num">' + (c.visits || 0) + '</td>' +
        '<td class="num">' + fmt(c.spend) + ' ' + T.currency + '</td>' +
        '<td class="num">' + fmt(c.points) + '</td>' +
        '<td><span class="cd-tag ' + c.seg + '">' + SEG_LBL(T, c.seg) + '</span></td>' +
        '<td class="cd-muted">' + T.ago(c.last) + '</td></tr>';
    }
    function tableHtml() {
      var rows = filtered();
      if (!rows.length) {
        if (!all.length) return '<div class="cd-empty"><span class="cd-empty-ic">' + ico('group') + '</span><b>' + esc(T.emptyTitle) + '</b><p>' + esc(T.emptyText) + '</p>' +
          '<button type="button" class="cd-exp cd-new" data-cd-new>' + ico('personAdd') + '<span>' + esc(T.newShort) + '</span></button></div>';
        return '<div class="cd-empty"><span class="cd-empty-ic">' + ico('search') + '</span><b>' + esc(T.noMatch) + '</b><p>' + esc(T.noMatchText) + '</p>' +
          '<button type="button" class="cd-exp" data-cd-clear>' + esc(T.clear) + '</button></div>';
      }
      if (hotel) return '<div class="cd-tblwrap"><table class="cd-tbl"><thead><tr>' +
        [T.th.name, T.th.phone, H.nationality, H.identity, H.room, H.allergies, H.stays, T.th.spend, T.th.last].map(function (label, i) { return '<th' + (i === 6 || i === 7 ? ' class="num"' : '') + '>' + esc(label) + '</th>'; }).join('') +
        '</tr></thead><tbody>' + rows.map(rowHtml).join('') + '</tbody></table></div>';
      return '<div class="cd-tblwrap"><table class="cd-tbl"><thead><tr>' +
        ['name', 'phone', 'email', 'visits', 'spend', 'points', 'seg', 'last'].map(function (k) { return '<th' + (k === 'visits' || k === 'spend' || k === 'points' ? ' class="num"' : '') + '>' + T.th[k] + '</th>'; }).join('') +
        '</tr></thead><tbody>' + rows.map(rowHtml).join('') + '</tbody></table></div>';
    }
    var SEGS = ['all', 'reg', 'vip', 'new', 'win'];
    function segCount(id) { return id === 'all' ? all.length : all.filter(function (c) { return c.seg === id; }).length; }
    function segChips() {
      return SEGS.map(function (id) {
        var on = state.seg === id;
        return '<button type="button" class="cd-seg' + (on ? ' on' : '') + '" data-lens-item data-cd-seg="' + id + '" aria-pressed="' + on + '">' + T.seg[id] + '<em>' + segCount(id) + '</em></button>';
      }).join('');
    }
    function share(n) { return all.length ? Math.round(n / all.length * 100) + ' % ' + T.ofBook : T.noneYet; }
    function kpi(id, label, value, hint) {
      return '<div class="cd-kpi cd-stat" data-cd-kpi="' + id + '"><div class="l"><i></i>' + esc(label) + '</div><div class="v">' + fmt(value) + '</div><div class="h">' + esc(hint) + '</div></div>';
    }
    function kpis() {
      return kpi('total', T.total, all.length, T.shared) + kpi('phone', T.withPhone, withPhone(), share(withPhone())) +
        kpi('email', T.withEmail, withEmail(), share(withEmail())) + kpi('ok', T.consented, contactable(), share(contactable()));
    }

    var body = '<div class="gk-reveal-root cd">' +
      '<div class="cd-kpis" id="cd-stats">' + kpis() + '</div>' +
      '<div class="cd-bar">' +
        '<div class="cd-actions">' +
          '<label class="cd-field">' + ico('search') + '<input class="cd-search" id="cd-q" type="search" placeholder="' + esc(T.search) + '" aria-label="' + esc(T.search) + '"></label>' +
          '<button type="button" class="cd-exp" id="cd-exp" title="' + esc(T.export) + '">' + ico('download') + '<span>' + T.export + '</span></button>' +
          '<button type="button" class="cd-exp" id="cd-loyalty" data-feature="loyalty" title="' + esc(T.program) + '">' + ico('redeem') + '<span>' + T.loyalty + '</span></button>' +
          (campaignsEnabled() ? '<button type="button" class="cd-exp cd-camp" id="cd-campaign">' + ico('campaign') + '<span>' + T.campaign + '</span></button>' : '') +
          '<button type="button" class="cd-exp cd-new" id="cd-new">' + ico('personAdd') + '<span>' + esc(T.newShort) + '</span></button>' +
        '</div>' +
        '<div class="cd-segs" id="cd-segs" data-lens-demo role="group" aria-label="' + esc(T.th.seg) + '">' + segChips() + '</div>' +
      '</div>' +
      '<div id="cd-table">' + tableHtml() + '</div></div>';

    // Render IN-FLOW like every other sidebar destination (Terminaux, Équipe…) —
    // the dashboard shell + sidebar stay visible instead of a full-viewport takeover.
    var d = (Kiwi.appPage
      ? Kiwi.appPage('crm', { title: T.title, subtitle: T.sub, body: body })
      : Kiwi.drawer({ title: T.title, subtitle: T.sub, fullpage: true, body: body }));
    // appPage highlights [data-nav]; the CRM link is [data-action], so mark it here.
    try {
      document.querySelectorAll('.sidebar nav a').forEach(function (a) { a.classList.remove('active'); });
      document.querySelectorAll('.sidebar nav a[data-action="clients-directory"], .sidebar nav a[data-action="growth-crm"]').forEach(function (a) { a.classList.add('active'); });
    } catch (_) {}
    if (window.KiwiKit) KiwiKit.reveal(d.el.querySelector('.gk-reveal-root'));
    var root = d.el;
    function rerenderTable() { root.querySelector('#cd-table').innerHTML = tableHtml(); }
    function rerenderSegs() {
      root.querySelectorAll('[data-cd-seg]').forEach(function (b) {
        var id = b.getAttribute('data-cd-seg'), on = state.seg === id;
        b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on));
        var em = b.querySelector('em'); if (em) em.textContent = segCount(id);
      });
    }

    var q = root.querySelector('#cd-q');
    q.addEventListener('input', function () { state.q = q.value; rerenderTable(); });
    root.addEventListener('click', function (e) {
      var sg = e.target.closest('[data-cd-seg]');
      if (sg) { state.seg = sg.getAttribute('data-cd-seg'); rerenderSegs(); rerenderTable(); return; }
      if (e.target.closest('#cd-new,[data-cd-new]')) { openNewClient(); return; }
      if (e.target.closest('[data-cd-clear]')) { state.seg = 'all'; state.q = ''; q.value = ''; rerenderSegs(); rerenderTable(); return; }
      if (e.target.closest('#cd-exp')) { csvExport(filtered(), T); Kiwi.toast && Kiwi.toast(T.export, { type: 'success', desc: fmt(filtered().length) + ' ' + T.total }); return; }
      if (e.target.closest('#cd-loyalty')) { if (window.Kiwi.handlers && Kiwi.handlers['loyalty']) Kiwi.handlers['loyalty'](); return; }
      // In-flow: growth-crm's appPage replaces this page's host, so no close() needed
      // (calling it would flash the home page in between).
      if (e.target.closest('#cd-campaign')) { if (campaignsEnabled() && window.Kiwi.handlers && Kiwi.handlers['growth-crm']) Kiwi.handlers['growth-crm'](); return; }
      var tr = e.target.closest('[data-cd-id]');
      if (tr) { openDetail(all.filter(function (c) { return c.id === tr.getAttribute('data-cd-id'); })[0], T); }
    });

    // Ticket #0004 · dashboard-native creation: reception has no till, so the
    // directory creates fiches itself through the same shared book + server
    // sync as the caisse (KiwiClients.upsert), with the same validation.
    function openNewClient() {
      if (!window.KiwiClients || !window.Kiwi.modal) return;
      var F = T.form;
      var fld = function (id, label, inner) { return '<label class="cd-f"><span>' + esc(label) + '</span>' + inner + '</label>'; };
      var inp = function (id, val, ph, type) { return '<input id="' + id + '" value="' + esc(val || '') + '"' + (type ? ' type="' + type + '"' : '') + (ph ? ' placeholder="' + esc(ph) + '"' : '') + ' autocomplete="off">'; };
      var hotelBox = hotel ?
        fld('cdn-h-nationality', H.nationality, inp('cdn-h-nationality', '', '')) +
        fld('cdn-h-identity', H.identity, inp('cdn-h-identity', '', '')) +
        fld('cdn-h-language', H.language, inp('cdn-h-language', '', '')) +
        fld('cdn-h-room', H.room, inp('cdn-h-room', '', '')) +
        fld('cdn-h-food', H.food, inp('cdn-h-food', '', '')) +
        fld('cdn-h-allergies', H.allergies, inp('cdn-h-allergies', '', '')) +
        fld('cdn-h-access', H.access, inp('cdn-h-access', '', '')) : '';
      var m = window.Kiwi.modal({ tag: F.title, title: hotel ? H.title + ' · ' + F.title : F.title, width: 520,
        body: '<p class="cd-f-sub">' + esc(F.sub) + '</p><div class="cd-f-grid">' +
        fld('cdn-name', T.th.name, inp('cdn-name', '', '')) +
        fld('cdn-phone', T.th.phone, inp('cdn-phone', '', '06…')) +
        fld('cdn-email', T.th.email, inp('cdn-email', '', '', 'email')) +
        fld('cdn-city', T.th.city, inp('cdn-city', '', '')) +
        fld('cdn-birthday', T.birthday, inp('cdn-birthday', '', '', 'date')) +
        '<label class="cd-f"><span>' + esc(T.gender) + '</span><select id="cdn-gender"><option value=""></option><option>Femme</option><option>Homme</option><option>Autre</option></select></label>' +
        hotelBox +
        fld('cdn-notes', T.notes, inp('cdn-notes', '', '')) +
        '</div><label class="cd-f-check"><input type="checkbox" id="cdn-consent"' + (hotel ? '' : ' checked') + '><span>' + esc(T.consentWa) + (hotel ? '' : ' · requis CNDP 09-08') + '</span></label>' +
        '<label class="cd-f-check"><input type="checkbox" id="cdn-consent-email"><span>' + esc(T.consentEmail) + '</span></label>' +
        '<div class="cd-f-actions"><button class="cd-exp" data-close>' + esc(F.cancel) + '</button><button class="cd-exp cd-new" data-save>' + esc(F.save) + '</button></div>' });
      var val = function (sel) { var n = m.el.querySelector(sel); return n ? String(n.value || '').trim() : ''; };
      m.el.addEventListener('click', function (e) {
        if (e.target.closest('[data-close]')) { m.close(); return; }
        if (!e.target.closest('[data-save]')) return;
        var name = val('#cdn-name'), phone = val('#cdn-phone');
        if (!name && !phone) { Kiwi.toast && Kiwi.toast(F.needNameOrPhone, { type: 'warn' }); return; }
        if (phone && window.KiwiPhone && !window.KiwiPhone.valid(phone)) { Kiwi.toast && Kiwi.toast(F.badPhone, { type: 'warn' }); return; }
        var consent = !!m.el.querySelector('#cdn-consent').checked;
        if (!hotel && !consent) { Kiwi.toast && Kiwi.toast(F.consentRequired, { type: 'warn' }); return; }
        if (phone) {
          var dupe = KiwiClients.findByPhone(phone);
          if (dupe) { m.close(); openDetail(all.filter(function (c) { return c.id === dupe.id; })[0] || dupe, T); Kiwi.toast && Kiwi.toast(F.alreadyExists, { type: 'info' }); return; }
        }
        var rec = KiwiClients.upsert({
          id: '', name: name, phone: phone, email: val('#cdn-email'), city: val('#cdn-city'),
          birthday: val('#cdn-birthday'), gender: val('#cdn-gender'), notes: val('#cdn-notes'),
          hospitality: hotel ? { nationality: val('#cdn-h-nationality'), documentType: '', documentNumber: val('#cdn-h-identity'),
            preferredLanguage: val('#cdn-h-language'), roomPreferences: val('#cdn-h-room'), foodPreferences: val('#cdn-h-food'),
            allergies: val('#cdn-h-allergies'), accessibilityNeeds: val('#cdn-h-access') } : {},
          consent: consent, consentEmail: !!m.el.querySelector('#cdn-consent-email').checked, source: 'dashboard',
        });
        m.close();
        refreshData();
        Kiwi.toast && Kiwi.toast(F.added, { type: 'success', desc: rec.name || rec.phone });
      });
    }

    // Live: pull the shared book from the server (cross-device) and refresh when it
    // changes here or on another device. Guarded so a closed drawer unsubscribes.
    var offSub = null;
    function rerenderStats() {
      var s = root.querySelector('#cd-stats'); if (!s) return;
      s.innerHTML = kpis();
    }
    function refreshData() {
      if (!root || !document.body.contains(root)) { if (offSub) { offSub(); offSub = null; } return; }
      data = load();
      all = data.rows.slice().sort(function (a, b) { return (b.spend || 0) - (a.spend || 0); });
      rerenderStats(); rerenderSegs(); rerenderTable();
    }
    if (window.KiwiClients) {
      if (KiwiClients.pull) KiwiClients.pull(function (ch) { if (ch) refreshData(); });
      if (KiwiClients.subscribe) offSub = KiwiClients.subscribe(function () { refreshData(); });
    }
  };

  function openDetail(c, T) {
    if (!c || !window.Kiwi.modal) return;
    function row(k, v) { return v ? '<div class="cd-drow"><span class="k">' + esc(k) + '</span><span class="v">' + esc(v) + '</span></div>' : ''; }
    var consent = [c.consent ? T.consentWa : '', c.consentEmail ? T.consentEmail : ''].filter(Boolean).join(' · ') || T.none;
    var hotel = hospitalityMode();
    var H = HOTEL[lang()] || HOTEL.fr;
    var h = c.hospitality || {};
    var hospitalityRows = hotel ?
      row(H.nationality, h.nationality) + row(H.identity, [h.documentType, h.documentNumber].filter(Boolean).join(' · ')) +
      row(H.language, h.preferredLanguage) + row(H.room, h.roomPreferences) + row(H.food, h.foodPreferences) +
      row(H.allergies, h.allergies) + row(H.access, h.accessibilityNeeds) : '';
    var locale = lang() === 'ar' ? 'ar-MA' : (lang() === 'en' ? 'en-GB' : 'fr-FR');
    var payment = function (value) {
      var key = String(value || '').toLowerCase();
      var labels = lang() === 'ar'
        ? { cash: 'نقداً', 'espèces': 'نقداً', card: 'بطاقة', carte: 'بطاقة', wallet: 'محفظة', delivery: 'عند التسليم', livraison: 'عند التسليم' }
        : lang() === 'en'
          ? { cash: 'Cash', 'espèces': 'Cash', card: 'Card', carte: 'Card', wallet: 'Wallet', delivery: 'Pay on delivery', livraison: 'Pay on delivery' }
          : { cash: 'Espèces', 'espèces': 'Espèces', card: 'Carte', carte: 'Carte', wallet: 'Portefeuille', delivery: 'Livraison', livraison: 'Livraison' };
      return labels[key] || value || T.unknownPayment;
    };
    var purchaseHistory = (Array.isArray(c.history) ? c.history : []).slice().sort(function (a, b) {
      return Number((b && (b.ts || b.createdAt)) || 0) - Number((a && (a.ts || a.createdAt)) || 0);
    }).slice(0, 50);
    var historyBody = purchaseHistory.length ? purchaseHistory.map(function (entry) {
      entry = entry || {};
      var stamp = Number(entry.ts || entry.createdAt || 0);
      var when = stamp ? new Date(stamp).toLocaleString(locale, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : T.unknownDate;
      var items = Array.isArray(entry.items) && entry.items.length ? entry.items.map(function (item) {
        return (item.qty || 1) + '× ' + (item.name || T.purchase);
      }).join(' · ') : T.purchase;
      return '<div class="cd-history-row"><span class="cd-history-date">' + esc(when) + '<span class="cd-history-method">' + esc(payment(entry.method)) + '</span></span>' +
        '<span class="cd-history-items">' + esc(items) + (entry.ref ? '<span class="cd-history-meta">' + esc(T.ticket + ' ' + entry.ref) + '</span>' : '') + '</span>' +
        '<span class="cd-history-amount">' + fmt(entry.amount || entry.amt || 0) + ' MAD</span></div>';
    }).join('') : '<div class="cd-history-empty"><b>' + esc(T.noHistory) + '</b>' + esc(T.noHistorySub) + '</div>';
    var body = '<div style="margin-top:4px">' +
      row(T.th.phone, c.phone) + row(T.th.email, c.email) + row(T.th.city, c.city) + row(T.address, c.address) +
      row(T.birthday, c.birthday) + row(T.gender, c.gender) +
      hospitalityRows +
      '<div class="cd-drow"><span class="k">' + T.th.visits + ' · ' + T.th.spend + '</span><span class="v">' + (c.visits || 0) + ' · ' + fmt(c.spend) + ' MAD</span></div>' +
      '<div class="cd-drow"><span class="k">' + T.th.points + ' · ' + T.th.seg + '</span><span class="v">' + fmt(c.points) + ' · ' + SEG_LBL(T, c.seg) + '</span></div>' +
      row(T.notes, c.notes) +
      '<div class="cd-drow"><span class="k">' + T.consent + '</span><span class="v">' + esc(consent) + '</span></div>' +
      '<div class="cd-history"><div class="cd-history-title">' + esc(T.history) + '</div><div class="cd-history-list">' + historyBody + '</div></div>' +
      '</div>';
    var m = window.Kiwi.modal({ tag: T.detail, title: c.name || T.none, width: 460, body: body + '<div style="display:flex;justify-content:flex-end;margin-top:18px"><button class="kb ghost" data-close>' + T.close + '</button></div>' });
    m.el.addEventListener('click', function (e) { if (e.target.closest('[data-close]')) m.close(); });
  }
})();
