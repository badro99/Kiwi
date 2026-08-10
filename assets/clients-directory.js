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

  var STR = {
    fr: { title: 'Clients', sub: 'Le carnet complet — coordonnées, fidélité et consentement.',
      search: 'Rechercher un nom, téléphone ou email…', export: 'Exporter (CSV)', campaign: 'Campagne', program: 'Programme de fidélité', total: 'clients', withEmail: 'avec email', withPhone: 'avec téléphone', consented: 'contactables',
      seg: { all: 'Tous', reg: 'Réguliers', vip: 'VIP', new: 'Nouveaux', win: 'Dormants' },
      th: { name: 'Client', phone: 'Téléphone', email: 'Email', city: 'Ville', visits: 'Visites', spend: 'Dépensé', points: 'Points', seg: 'Segment', last: 'Dernière visite' },
      tag: { reg: 'Régulier', vip: 'VIP', new: 'Nouveau', win: 'Dormant' }, none: '—', empty: 'Aucun client — ajoutez-en depuis la caisse.',
      ago: function (d) { return d === 0 ? "aujourd'hui" : 'il y a ' + d + ' j'; }, close: 'Fermer',
      detail: 'Fiche client', birthday: 'Anniversaire', gender: 'Genre', address: 'Adresse', notes: 'Notes', consent: 'Consentement', consentWa: 'WhatsApp / SMS', consentEmail: 'Email', firstSeen: 'Client depuis' },
    en: { title: 'Customers', sub: 'The full book — contacts, loyalty and consent.',
      search: 'Search name, phone or email…', export: 'Export (CSV)', campaign: 'Campaign', program: 'Loyalty program', total: 'customers', withEmail: 'with email', withPhone: 'with phone', consented: 'contactable',
      seg: { all: 'All', reg: 'Regulars', vip: 'VIP', new: 'New', win: 'Dormant' },
      th: { name: 'Customer', phone: 'Phone', email: 'Email', city: 'City', visits: 'Visits', spend: 'Spent', points: 'Points', seg: 'Segment', last: 'Last visit' },
      tag: { reg: 'Regular', vip: 'VIP', new: 'New', win: 'Dormant' }, none: '—', empty: 'No customers yet — add them from the till.',
      ago: function (d) { return d === 0 ? 'today' : d + 'd ago'; }, close: 'Close',
      detail: 'Customer', birthday: 'Birthday', gender: 'Gender', address: 'Address', notes: 'Notes', consent: 'Consent', consentWa: 'WhatsApp / SMS', consentEmail: 'Email', firstSeen: 'Customer since' },
    ar: { title: 'العملاء', sub: 'الدفتر الكامل — جهات الاتصال والوفاء والموافقة.',
      search: 'ابحث بالاسم أو الهاتف أو البريد…', export: 'تصدير (CSV)', campaign: 'حملة', program: 'برنامج الوفاء', total: 'عميل', withEmail: 'ببريد', withPhone: 'بهاتف', consented: 'قابلون للتواصل',
      seg: { all: 'الكل', reg: 'دائمون', vip: 'كبار', new: 'جدد', win: 'خاملون' },
      th: { name: 'العميل', phone: 'الهاتف', email: 'البريد', city: 'المدينة', visits: 'الزيارات', spend: 'الإنفاق', points: 'النقاط', seg: 'الفئة', last: 'آخر زيارة' },
      tag: { reg: 'دائم', vip: 'كبير', new: 'جديد', win: 'خامل' }, none: '—', empty: 'لا يوجد عملاء بعد — أضِفهم من الصندوق.',
      ago: function (d) { return d === 0 ? 'اليوم' : 'منذ ' + d + ' ي'; }, close: 'إغلاق',
      detail: 'بطاقة العميل', birthday: 'الميلاد', gender: 'الجنس', address: 'العنوان', notes: 'ملاحظات', consent: 'الموافقة', consentWa: 'واتساب / SMS', consentEmail: 'بريد', firstSeen: 'عميل منذ' },
  };

  var SEG_LBL = function (T, id) { return T.tag[id] || id; };
  var DAY = 86400000;
  function daysSince(ts) { return ts ? Math.floor((Date.now() - ts) / DAY) : Infinity; }

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
          birthday: c.birthday, gender: c.gender, notes: c.notes, visits: c.visits, spend: c.spend,
          points: c.points, consent: c.consent, consentEmail: c.consentEmail, seg: KCl.segment(c),
          last: daysSince(c.lastSeen) === Infinity ? 0 : daysSince(c.lastSeen), firstSeen: daysSince(c.firstSeen) };
      });
      return { rows: rows, real: true };
    }
    return { rows: DEMO.map(function (c, i) { return Object.assign({ id: 'demo' + i, address: '', notes: '' }, c); }), real: false };
  }

  var CSS = [
    '.cd-head{display:flex;flex-wrap:wrap;gap:12px;align-items:center;margin-bottom:16px;}',
    '.cd-stats{display:flex;gap:22px;flex-wrap:wrap;}',
    '.cd-stat .v{font-size:28px;font-weight:600;line-height:1;letter-spacing:-.02em;font-feature-settings:"tnum" 1;}',
    '.cd-stat .l{font-size:11px;color:var(--n-500);margin-top:3px;text-transform:uppercase;letter-spacing:.04em;font-family:var(--mono);}',
    '.cd-tools{display:flex;gap:10px;align-items:center;margin-inline-start:auto;flex-wrap:wrap;}',
    '.cd-search{width:min(340px,60vw);padding:11px 14px;border:1px solid var(--n-200);border-radius:11px;font-size:14px;background:var(--surface);color:var(--ink);}',
    '.cd-search:focus{outline:none;border-color:var(--atlas);box-shadow:0 0 0 3px rgba(11,110,79,.12);}',
    '.cd-exp{display:inline-flex;align-items:center;gap:7px;padding:11px 15px;border:1px solid var(--n-200);border-radius:11px;background:var(--surface);color:var(--ink);font:600 13px/1 inherit;cursor:pointer;}',
    '.cd-exp:hover{border-color:var(--atlas);color:var(--atlas);}',
    '.cd-exp.cd-camp{background:var(--atlas);color:#fff;border-color:var(--atlas);}',
    '.cd-exp.cd-camp:hover{filter:brightness(1.07);color:#fff;}',
    '.cd-segs{display:flex;gap:7px;flex-wrap:wrap;margin-bottom:14px;}',
    '.cd-segchip{font-size:12.5px;padding:7px 13px;border-radius:999px;border:1px solid var(--n-200);background:var(--surface,#fff);cursor:pointer;color:var(--ink);transition: transform .12s, opacity .12s, background-color .12s, border-color .12s, color .12s, box-shadow .12s;}',
    '.cd-segchip:hover:not(.on){border-color:var(--n-300);}',
    '.cd-segchip.on{background:var(--atlas);color:#fff;border-color:var(--atlas);}',
    '.cd-tblwrap{overflow-x:auto;border:1px solid var(--n-200);border-radius:16px;background:var(--surface);}',
    '.cd-tbl{width:100%;border-collapse:collapse;min-width:820px;}',
    '.cd-tbl th{font-family:var(--mono);font-size:10px;letter-spacing:.07em;text-transform:uppercase;color:var(--n-500);text-align:start;padding:12px 14px;background:var(--paper-soft);font-weight:500;white-space:nowrap;}',
    '.cd-tbl td{padding:12px 14px;font-size:13px;border-top:1px solid var(--n-200);white-space:nowrap;}',
    '.cd-tbl tbody tr{cursor:pointer;transition:background-color .12s;}',
    '.cd-tbl tbody tr:hover td{background:var(--paper-soft);}',
    '.cd-tbl td.mono{font-family:var(--mono);font-size:12px;}',
    '.cd-nm{font-weight:600;}',
    '.cd-muted{color:var(--n-500);}',
    '.cd-tag{font-size:10.5px;font-family:var(--mono);padding:3px 9px;border-radius:999px;}',
    '.cd-tag.reg{background:var(--mint-soft);color:#075238;}.cd-tag.vip{background:#FBF0D6;color:#8A6210;}.cd-tag.new{background:#E4ECF8;color:#3E78C9;}.cd-tag.win{background:#FBE3DD;color:#C0492F;}',
    '.cd-ok{color:var(--atlas);font-weight:700;}.cd-no{color:var(--n-400);}',
    '.cd-empty{text-align:center;color:var(--n-500);padding:40px 14px;}',
    '.cd-drow{display:flex;justify-content:space-between;gap:16px;padding:11px 0;border-top:1px solid var(--n-200);font-size:13.5px;}',
    '.cd-drow:first-child{border-top:0;}.cd-drow .k{color:var(--n-500);}.cd-drow .v{font-weight:600;text-align:end;word-break:break-word;}',
    'html[data-theme="dark"] .cd-tblwrap,html[data-theme="dark"] .cd-search,html[data-theme="dark"] .cd-exp,html[data-theme="dark"] .cd-segchip,html[data-theme="dark"] .cd-tbl{background:#131916;border-color:#26302b;color:var(--paper);}',
    'html[data-theme="dark"] .cd-tbl th{background:#0f1714;}html[data-theme="dark"] .cd-tbl td{border-color:#26302b;}',
    'html[data-theme="dark"] .cd-tbl tbody tr:hover td{background:#0f1714;}',
    'html[data-theme="dark"] .cd-segchip.on{background:var(--atlas);color:#fff;}',
  ].join('');
  var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);

  function csvExport(rows, T) {
    var head = [T.th.name, T.th.phone, T.th.email, T.th.city, T.birthday, T.th.visits, T.th.spend, T.th.points, T.th.seg, T.consentWa, T.consentEmail];
    var body = rows.map(function (c) {
      return [c.name || '', c.phone || '', c.email || '', c.city || '', c.birthday || '', c.visits || 0, c.spend || 0, c.points || 0, SEG_LBL(T, c.seg), c.consent ? 'oui' : 'non', c.consentEmail ? 'oui' : 'non'];
    });
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
          (c.city || '').toLowerCase().indexOf(q) >= 0;
      });
    }

    function rowHtml(c) {
      return '<tr data-cd-id="' + esc(c.id) + '">' +
        '<td class="cd-nm">' + esc(c.name || T.none) + '</td>' +
        '<td class="mono">' + esc(c.phone || T.none) + '</td>' +
        '<td class="' + (c.email ? '' : 'cd-muted') + '">' + esc(c.email || T.none) + '</td>' +
        '<td>' + esc(c.city || T.none) + '</td>' +
        '<td class="mono">' + (c.visits || 0) + '</td>' +
        '<td class="mono">' + fmt(c.spend) + '</td>' +
        '<td class="mono">' + fmt(c.points) + '</td>' +
        '<td><span class="cd-tag ' + c.seg + '">' + SEG_LBL(T, c.seg) + '</span></td>' +
        '<td class="cd-muted">' + T.ago(c.last) + '</td></tr>';
    }
    function tableHtml() {
      var rows = filtered();
      if (!rows.length) return '<div class="cd-empty">' + esc(T.empty) + '</div>';
      return '<div class="cd-tblwrap"><table class="cd-tbl"><thead><tr>' +
        ['name', 'phone', 'email', 'city', 'visits', 'spend', 'points', 'seg', 'last'].map(function (k) { return '<th>' + T.th[k] + '</th>'; }).join('') +
        '</tr></thead><tbody>' + rows.map(rowHtml).join('') + '</tbody></table></div>';
    }
    function segChips() {
      return ['all', 'reg', 'vip', 'new', 'win'].map(function (id) {
        var n = id === 'all' ? all.length : all.filter(function (c) { return c.seg === id; }).length;
        return '<button class="cd-segchip' + (state.seg === id ? ' on' : '') + '" data-cd-seg="' + id + '">' + T.seg[id] + ' · ' + n + '</button>';
      }).join('');
    }

    var body = '<div class="gk-reveal-root">' +
      '<div class="cd-head"><div class="cd-stats" id="cd-stats">' +
        '<div class="cd-stat"><div class="v">' + fmt(all.length) + '</div><div class="l">' + T.total + '</div></div>' +
        '<div class="cd-stat"><div class="v">' + fmt(withPhone()) + '</div><div class="l">' + T.withPhone + '</div></div>' +
        '<div class="cd-stat"><div class="v">' + fmt(withEmail()) + '</div><div class="l">' + T.withEmail + '</div></div>' +
        '<div class="cd-stat"><div class="v">' + fmt(contactable()) + '</div><div class="l">' + T.consented + '</div></div>' +
      '</div><div class="cd-tools">' +
        '<input class="cd-search" id="cd-q" type="search" placeholder="' + esc(T.search) + '">' +
        '<button class="cd-exp" id="cd-exp"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>' + T.export + '</button>' +
        '<button class="cd-exp" id="cd-loyalty" data-feature="loyalty"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg>' + T.program + '</button>' +
        '<button class="cd-exp cd-camp" id="cd-campaign"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/></svg>' + T.campaign + '</button>' +
      '</div></div>' +
      '<div class="cd-segs" id="cd-segs">' + segChips() + '</div>' +
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
    function rerenderSegs() { root.querySelector('#cd-segs').innerHTML = segChips(); }

    var q = root.querySelector('#cd-q');
    q.addEventListener('input', function () { state.q = q.value; rerenderTable(); });
    root.addEventListener('click', function (e) {
      var sg = e.target.closest('[data-cd-seg]');
      if (sg) { state.seg = sg.getAttribute('data-cd-seg'); rerenderSegs(); rerenderTable(); return; }
      if (e.target.closest('#cd-exp')) { csvExport(filtered(), T); Kiwi.toast && Kiwi.toast(T.export, { type: 'success', desc: fmt(filtered().length) + ' ' + T.total }); return; }
      if (e.target.closest('#cd-loyalty')) { if (window.Kiwi.handlers && Kiwi.handlers['loyalty']) Kiwi.handlers['loyalty'](); return; }
      // In-flow: growth-crm's appPage replaces this page's host, so no close() needed
      // (calling it would flash the home page in between).
      if (e.target.closest('#cd-campaign')) { if (window.Kiwi.handlers && Kiwi.handlers['growth-crm']) Kiwi.handlers['growth-crm'](); else { try { d.close(); } catch (_) {} } return; }
      var tr = e.target.closest('[data-cd-id]');
      if (tr) { openDetail(all.filter(function (c) { return c.id === tr.getAttribute('data-cd-id'); })[0], T); }
    });

    // Live: pull the shared book from the server (cross-device) and refresh when it
    // changes here or on another device. Guarded so a closed drawer unsubscribes.
    var offSub = null;
    function rerenderStats() {
      var s = root.querySelector('#cd-stats'); if (!s) return;
      var vals = [all.length, withPhone(), withEmail(), contactable()];
      var vs = s.querySelectorAll('.cd-stat .v');
      for (var i = 0; i < vs.length && i < vals.length; i++) vs[i].textContent = fmt(vals[i]);
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
    var body = '<div style="margin-top:4px">' +
      row(T.th.phone, c.phone) + row(T.th.email, c.email) + row(T.th.city, c.city) + row(T.address, c.address) +
      row(T.birthday, c.birthday) + row(T.gender, c.gender) +
      '<div class="cd-drow"><span class="k">' + T.th.visits + ' · ' + T.th.spend + '</span><span class="v">' + (c.visits || 0) + ' · ' + fmt(c.spend) + ' MAD</span></div>' +
      '<div class="cd-drow"><span class="k">' + T.th.points + ' · ' + T.th.seg + '</span><span class="v">' + fmt(c.points) + ' · ' + SEG_LBL(T, c.seg) + '</span></div>' +
      row(T.notes, c.notes) +
      '<div class="cd-drow"><span class="k">' + T.consent + '</span><span class="v">' + esc(consent) + '</span></div>' +
      '</div>';
    var m = window.Kiwi.modal({ tag: T.detail, title: c.name || T.none, width: 460, body: body + '<div style="display:flex;justify-content:flex-end;margin-top:18px"><button class="kb ghost" data-close>' + T.close + '</button></div>' });
    m.el.addEventListener('click', function (e) { if (e.target.closest('[data-close]')) m.close(); });
  }
})();
