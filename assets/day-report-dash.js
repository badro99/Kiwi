/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · RAPPORT JOURNALIER — la destination du tableau de bord
 * ---------------------------------------------------------------------------
 * Ce que le patron ouvre à 8h du matin, avant d'ouvrir la boutique. Pas un
 * chiffre d'affaires : une journée racontée. Qui a ouvert, qui a fermé, ce qui
 * s'est vendu, dans quel rayon, réglé comment, et ce qu'il y avait dans le
 * tiroir par rapport à ce qu'il aurait dû y avoir.
 *
 * ── D'OÙ VIENNENT LES CHIFFRES ─────────────────────────────────────────────
 * Deux sources, dans cet ordre, et la différence est visible à l'écran :
 *
 *  1. L'INSTANTANÉ écrit par la caisse (assets/day-report.js). C'est la source
 *     complète : lui seul porte le fond d'ouverture, les mouvements d'espèces,
 *     les remises, les remboursements et le comptage du tiroir — des faits que
 *     le serveur n'a jamais vus, parce que /api/sale ne transporte que des
 *     encaissements positifs.
 *  2. À DÉFAUT, un calcul direct sur les ventes remontées (window.KiwiSales).
 *     C'est le repli pour une journée d'AVANT cette fonctionnalité, ou pour un
 *     commerce qui encaisse sans jamais clôturer (commandes OrderPro seules).
 *     Le total et le détail produit y sont justes ; le tiroir, lui, est
 *     forcément muet, et la page le DIT au lieu d'afficher un écart de 0 MAD
 *     qui laisserait croire que la caisse tombe juste.
 *
 * Le rapport n'est jamais recalculé par-dessus l'instantané : si la caisse a
 * clôturé, c'est SA version qui fait foi. Deux vérités pour une journée, c'est
 * exactement ce qu'un rapport de clôture doit empêcher.
 *
 * Chargez-moi APRÈS day-report.js et pages-pro.js (dont j'emprunte la coquille
 * de page, Kiwi.appPage).
 * ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var NAV = 'rapport';

  function DR() { return window.KiwiDayReport; }
  var LANG = function () { try { return (window.KiwiI18n && window.KiwiI18n.getLang && window.KiwiI18n.getLang()) || 'fr'; } catch (_) { return 'fr'; } };
  var T = function (o) { return o == null ? '' : (o[LANG()] != null ? o[LANG()] : o.fr); };
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  function money(n) {
    var v = Math.round((+n || 0) * 100) / 100;
    try { return v.toLocaleString(LANG() === 'ar' ? 'ar-MA' : 'fr-FR', { maximumFractionDigits: 2 }); }
    catch (_) { return String(v); }
  }
  function qty(n) { var v = Math.round((+n || 0) * 100) / 100; return String(v); }
  function hm(ms) {
    if (!ms) return '';
    var d = new Date(ms);
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  var L = {
    title:     { fr: 'Rapport journalier', en: 'Daily report', ar: 'التقرير اليومي' },
    net:       { fr: 'Net du jour', en: 'Net for the day', ar: 'صافي اليوم' },
    txns:      { fr: 'Transactions', en: 'Transactions', ar: 'المعاملات' },
    basket:    { fr: 'Ticket moyen', en: 'Average basket', ar: 'متوسط السلة' },
    gross:     { fr: 'Total encaissé', en: 'Total taken', ar: 'إجمالي المقبوض' },
    payments:  { fr: 'Moyens de paiement', en: 'Payment methods', ar: 'طرق الدفع' },
    drawer:    { fr: 'Tiroir-caisse', en: 'Cash drawer', ar: 'درج النقد' },
    opening:   { fr: "Fond d'ouverture", en: 'Opening float', ar: 'رصيد الافتتاح' },
    cashIn:    { fr: 'Espèces encaissées', en: 'Cash taken', ar: 'النقد المقبوض' },
    cashTips:  { fr: 'Pourboires espèces', en: 'Cash tips', ar: 'إكراميات نقدية' },
    expected:  { fr: 'Attendu en caisse', en: 'Expected in drawer', ar: 'المتوقع في الدرج' },
    counted:   { fr: 'Compté', en: 'Counted', ar: 'المحسوب' },
    ecart:     { fr: 'Écart', en: 'Difference', ar: 'الفرق' },
    notCount:  { fr: 'non compté', en: 'not counted', ar: 'غير محسوب' },
    adjust:    { fr: 'Ajustements', en: 'Adjustments', ar: 'التعديلات' },
    refunds:   { fr: 'Remboursements', en: 'Refunds', ar: 'المبالغ المستردة' },
    discounts: { fr: 'Remises accordées', en: 'Discounts given', ar: 'التخفيضات' },
    cancels:   { fr: 'Annulations', en: 'Cancellations', ar: 'الإلغاءات' },
    moves:     { fr: 'Mouvements de caisse', en: 'Cash movements', ar: 'حركات الصندوق' },
    movesNone: { fr: 'Aucune entrée ni sortie hors ventes.', en: 'No non-sale cash in or out.', ar: 'لا حركات نقدية خارج المبيعات.' },
    openedAt:  { fr: 'Ouverture', en: 'Opened', ar: 'الافتتاح' },
    closedAt:  { fr: 'Fermeture', en: 'Closed', ar: 'الإغلاق' },
    openedBy:  { fr: 'Ouvert par', en: 'Opened by', ar: 'فتحها' },
    closedBy:  { fr: 'Fermé par', en: 'Closed by', ar: 'أغلقها' },
    inProg:    { fr: 'Journée en cours', en: 'Day in progress', ar: 'يوم جارٍ' },
    closed:    { fr: 'Journée clôturée', en: 'Day closed', ar: 'يوم مُقفل' },
    notClosed: { fr: 'Journée non clôturée', en: 'Day not closed', ar: 'يوم غير مُقفل' },
    noDrawer:  { fr: 'Le comptage du tiroir vient de la caisse. Cette journée n’a pas été clôturée sur la caisse, il n’y a donc ni attendu ni écart à afficher.', en: 'The drawer count comes from the register. This day was never closed on the register, so there is no expected total and no difference to show.', ar: 'يأتي جرد الدرج من الصندوق. لم يُقفل هذا اليوم على الصندوق، لذا لا يوجد مبلغ متوقع ولا فرق.' },
    empty:     { fr: 'Aucune vente ce jour-là.', en: 'No sales that day.', ar: 'لا مبيعات في ذلك اليوم.' },
    emptyHint: { fr: 'Dès que la caisse encaisse, la journée se remplit ici toute seule.', en: 'As soon as the register takes a payment, the day fills itself in here.', ar: 'بمجرد أن يسجّل الصندوق عملية، يمتلئ اليوم هنا تلقائياً.' },
    print:     { fr: 'Imprimer', en: 'Print', ar: 'طباعة' },
    today:     { fr: "Aujourd'hui", en: 'Today', ar: 'اليوم' },
    yesterday: { fr: 'Hier', en: 'Yesterday', ar: 'أمس' },
    reopened:  { fr: 'Clôturée {n} fois', en: 'Closed {n} times', ar: 'أُقفل {n} مرات' },
    revision:  { fr: 'Historique des clôtures', en: 'Closing history', ar: 'سجل الإقفال' },
    coverage:  { fr: 'Ce détail porte sur {p}% du chiffre encaissé — les ventes sans panier détaillé n’y figurent pas.', en: 'This breakdown covers {p}% of revenue — sales with no itemised basket are not in it.', ar: 'يغطي هذا التفصيل {p}٪ من المداخيل — المبيعات بدون سلة مفصّلة غير مدرجة.' },
    noDetail:  { fr: 'Aucun détail produit pour cette journée — les ventes ont été encaissées sans panier détaillé.', en: 'No product detail for this day — sales were taken without an itemised basket.', ar: 'لا تفاصيل للمنتجات في هذا اليوم.' },
    divers:    { fr: 'Divers', en: 'Other', ar: 'متفرقات' },
    total:     { fr: 'Total', en: 'Total', ar: 'المجموع' },
  };
  var METHODS = {
    fr: { cash: 'Espèces', card: 'Carte', wallet: 'Virement', tap: 'Kiwi Tap', qr: 'QR', link: 'Lien' },
    en: { cash: 'Cash', card: 'Card', wallet: 'Transfer', tap: 'Kiwi Tap', qr: 'QR', link: 'Link' },
    ar: { cash: 'نقدًا', card: 'بطاقة', wallet: 'تحويل', tap: 'Kiwi Tap', qr: 'QR', link: 'رابط' },
  };
  function methodLabel(k) { return (METHODS[LANG()] || METHODS.fr)[k] || k; }

  var DAYS = {
    fr: ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'],
    en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    ar: ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'],
  };
  var MONTHS = {
    fr: ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'],
    en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
    ar: ['يناير', 'فبراير', 'مارس', 'أبريل', 'ماي', 'يونيو', 'يوليوز', 'غشت', 'شتنبر', 'أكتوبر', 'نونبر', 'دجنبر'],
  };
  function dayLabel(day) {
    var p = String(day || '').split('-');
    if (p.length !== 3) return day || '';
    var d = new Date(+p[0], +p[1] - 1, +p[2]);
    var l = LANG();
    return (DAYS[l] || DAYS.fr)[d.getDay()] + ' ' + d.getDate() + ' ' + (MONTHS[l] || MONTHS.fr)[d.getMonth()] + ' ' + d.getFullYear();
  }

  /* ─────────────────────────── les styles ─────────────────────────── */
  function ensureStyles() {
    if (document.getElementById('kdr-style')) return;
    var s = document.createElement('style');
    s.id = 'kdr-style';
    s.textContent = [
      '.kdr-nav{display:flex;align-items:center;gap:10px;margin-bottom:18px;flex-wrap:wrap}',
      '.kdr-arrow{width:34px;height:34px;border-radius:10px;border:1px solid var(--n-200);background:transparent;color:var(--ink);display:grid;place-items:center;cursor:pointer;font-size:15px;line-height:1;transition:background 140ms,border-color 140ms}',
      '.kdr-arrow:hover:not(:disabled){background:color-mix(in srgb,var(--atlas) 8%,transparent);border-color:var(--atlas)}',
      '.kdr-arrow:disabled{opacity:.32;cursor:default}',
      '.kdr-date{font-size:15px;font-weight:600;color:var(--ink);min-width:190px}',
      '.kdr-pick{border:1px solid var(--n-200);border-radius:10px;padding:7px 10px;background:transparent;color:var(--ink);font:inherit;font-size:13px;cursor:pointer}',
      '.kdr-spacer{flex:1}',
      '.kdr-chip{font-size:11px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;padding:5px 11px;border-radius:999px;white-space:nowrap}',
      '.kdr-chip.is-closed{background:color-mix(in srgb,var(--atlas) 13%,transparent);color:var(--atlas)}',
      '.kdr-chip.is-live{background:color-mix(in srgb,var(--mint) 30%,transparent);color:var(--riad)}',
      '.kdr-chip.is-open{background:var(--n-100);color:var(--n-500)}',
      '.kdr-btn{border:1px solid var(--n-200);border-radius:10px;padding:8px 14px;background:transparent;color:var(--ink);font:inherit;font-size:13px;cursor:pointer;transition:background 140ms}',
      '.kdr-btn:hover{background:color-mix(in srgb,var(--atlas) 8%,transparent)}',
      /* En-tête d'identité — l'établissement et la séance. */
      '.kdr-id{border:1px solid var(--n-200);border-radius:14px;padding:15px 18px;margin-bottom:16px;display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px 22px}',
      '.kdr-id-cell b{display:block;font-family:var(--mono);font-size:13.5px;color:var(--ink);font-weight:600}',
      '.kdr-id-cell span{display:block;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--n-500);margin-bottom:3px}',
      /* Les quatre chiffres de tête. */
      '.kdr-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:22px}',
      '.kdr-kpi{border:1px solid var(--n-200);border-radius:14px;padding:15px 17px}',
      '.kdr-kpi.is-lead{background:var(--riad);border-color:var(--riad)}',
      '.kdr-kpi.is-lead .kdr-kpi-l{color:rgba(247,245,240,.62)}',
      '.kdr-kpi.is-lead .kdr-kpi-v{color:#fff}',
      '.kdr-kpi-l{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--n-500)}',
      '.kdr-kpi-v{font-family:var(--mono);font-size:25px;font-weight:600;color:var(--ink);margin-top:7px;letter-spacing:-.02em}',
      '.kdr-kpi-v small{font-size:13px;font-weight:400;opacity:.6;margin-inline-start:3px}',
      '.kdr-kpi-v.is-off{color:#B4472F}',
      '.kdr-kpi-v.is-ok{color:var(--atlas)}',
      /* Blocs. */
      '.kdr-sec{margin-bottom:22px}',
      '.kdr-h{font-size:12px;font-weight:600;letter-spacing:.09em;text-transform:uppercase;color:var(--n-500);padding-bottom:9px;border-bottom:1px solid var(--n-200);margin-bottom:11px;display:flex;justify-content:space-between;align-items:baseline;gap:12px}',
      '.kdr-h em{font-style:normal;font-family:var(--mono);color:var(--ink);text-transform:none;letter-spacing:0;font-size:13px}',
      '.kdr-r{display:flex;justify-content:space-between;align-items:baseline;gap:14px;padding:8px 2px;border-bottom:1px solid var(--n-100)}',
      '.kdr-r:last-child{border-bottom:0}',
      '.kdr-r-l{font-size:14px;color:var(--ink)}',
      '.kdr-r-v{font-family:var(--mono);font-size:14px;color:var(--ink);white-space:nowrap}',
      '.kdr-r.is-total{border-top:1px solid var(--n-200);border-bottom:0;margin-top:3px;padding-top:11px}',
      '.kdr-r.is-total .kdr-r-l,.kdr-r.is-total .kdr-r-v{font-weight:600}',
      '.kdr-r.is-sub .kdr-r-l{color:var(--n-500);font-size:13px;padding-inline-start:14px}',
      '.kdr-r.is-sub .kdr-r-v{color:var(--n-500);font-size:13px}',
      /* Le détail par catégorie — le cœur du rapport. */
      '.kdr-cat{border:1px solid var(--n-200);border-radius:14px;margin-bottom:10px;overflow:hidden}',
      '.kdr-cat-h{display:flex;justify-content:space-between;align-items:baseline;gap:14px;padding:12px 16px;background:color-mix(in srgb,var(--atlas) 6%,transparent)}',
      '.kdr-cat-n{font-size:14.5px;font-weight:600;color:var(--ink)}',
      '.kdr-cat-v{font-family:var(--mono);font-size:14px;font-weight:600;color:var(--atlas);white-space:nowrap}',
      '.kdr-cat-b{padding:4px 16px 10px}',
      '.kdr-p{display:grid;grid-template-columns:auto 1fr auto;align-items:baseline;gap:12px;padding:7px 0;border-bottom:1px solid var(--n-100)}',
      '.kdr-p:last-child{border-bottom:0}',
      '.kdr-p-q{font-family:var(--mono);font-size:13px;color:var(--atlas);font-weight:600;min-width:34px}',
      '.kdr-p-n{font-size:13.5px;color:var(--ink)}',
      '.kdr-p-t{font-family:var(--mono);font-size:13.5px;color:var(--ink);white-space:nowrap}',
      '.kdr-cat-f{display:flex;justify-content:space-between;gap:12px;padding:9px 16px;border-top:1px solid var(--n-200);font-size:12.5px;color:var(--n-500)}',
      '.kdr-cat-f b{font-family:var(--mono);color:var(--ink);font-weight:600}',
      '.kdr-note{font-size:12.5px;line-height:1.55;color:var(--n-500);margin-top:10px}',
      '.kdr-empty{text-align:center;padding:48px 20px}',
      '.kdr-empty h3{font-family:var(--serif);font-weight:400;font-size:24px;color:var(--ink);margin:0 0 8px}',
      '.kdr-empty p{font-size:13.5px;color:var(--n-500);margin:0;line-height:1.6}',
      '@media (max-width:640px){.kdr-date{min-width:0;font-size:13.5px}.kdr-kpi-v{font-size:21px}}',
    ].join('');
    document.head.appendChild(s);
  }

  /* ─────────────────────── résoudre la journée ─────────────────────── */

  var current = null;   /* la journée à l'écran */

  /* Les ventes que le tableau de bord connaît, pour le repli sans instantané. */
  function dashSales() {
    try { return (window.KiwiSales && window.KiwiSales.list && window.KiwiSales.list()) || []; }
    catch (_) { return []; }
  }
  function storeInfo() {
    var vd = {};
    try { vd = (window.KiwiVenue && window.KiwiVenue.getCurrentVenueData && window.KiwiVenue.getCurrentVenueData()) || {}; } catch (_) {}
    return { slug: DR() ? DR().storeSlug() : '', name: vd.name || '', location: vd.location || vd.city || '', type: vd.type || '' };
  }

  /* L'instantané s'il existe, sinon un calcul direct. `live` dit lequel, parce
     que la page n'affiche pas les mêmes promesses dans les deux cas. */
  function resolve(day) {
    var d = DR(); if (!d) return null;
    var snap = null;
    try { snap = d.load(day); } catch (_) {}
    if (snap) return snap;
    var built = null;
    try {
      built = d.build({ day: day, sales: dashSales(), session: {}, store: storeInfo(), source: 'dashboard' });
    } catch (_) { return null; }
    if (built) built.live = true;   /* aucun instantané : le tiroir est inconnu */
    return built;
  }

  /* ─────────────────────────── le rendu ─────────────────────────── */

  function kpi(label, value, cls, sub) {
    return '<div class="kdr-kpi' + (cls === 'lead' ? ' is-lead' : '') + '">'
      + '<div class="kdr-kpi-l">' + esc(label) + '</div>'
      + '<div class="kdr-kpi-v' + (cls === 'off' ? ' is-off' : cls === 'ok' ? ' is-ok' : '') + '">'
      + esc(value) + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</div></div>';
  }
  function row(label, value, mod) {
    return '<div class="kdr-r' + (mod ? ' is-' + mod : '') + '">'
      + '<span class="kdr-r-l">' + esc(label) + '</span>'
      + '<span class="kdr-r-v">' + esc(value) + '</span></div>';
  }

  function render(day) {
    ensureStyles();
    var d = DR();
    if (!d || !window.Kiwi || !window.Kiwi.appPage) return;
    var last = d.lastClosedDay();
    current = day || current || last;
    var todayD = d.today();
    var r = resolve(current);
    /* Le rapport est une PIÈCE D'ARCHIVE : il s'intitule avec le magasin qu'il
       décrit et parle la langue du métier de CE magasin — pas de celui qui se
       trouve sélectionné dans le sélecteur au moment où on l'ouvre. Sans ça, le
       Z d'une boutique s'affichait « Café Atlas » et comptait ses jeans en
       « plats » dès que le tableau de bord avait un restaurant à l'écran. */
    var st = storeInfo();
    if (r && r.store) {
      if (r.store.name) st.name = r.store.name;
      if (r.store.location) st.location = r.store.location;
      if (r.store.type) st.type = r.store.type;
    }
    var V = d.vocab(st.type || undefined);

    /* ── la barre de navigation ── */
    var isToday = current === todayD;
    var rel = isToday ? T(L.today) : (current === last ? T(L.yesterday) : '');
    var nav = '<div class="kdr-nav">'
      + '<button class="kdr-arrow" data-kdr="prev" aria-label="précédent">‹</button>'
      + '<button class="kdr-arrow" data-kdr="next" aria-label="suivant"' + (isToday ? ' disabled' : '') + '>›</button>'
      + '<div class="kdr-date">' + esc(dayLabel(current)) + (rel ? ' · ' + esc(rel) : '') + '</div>'
      + '<input class="kdr-pick" type="date" data-kdr="pick" value="' + esc(current) + '" max="' + esc(todayD) + '" />'
      + '<div class="kdr-spacer"></div>';
    if (r && r.txns) {
      var chip = r.closed ? 'is-closed' : (isToday ? 'is-live' : 'is-open');
      var chipTxt = r.closed ? T(L.closed) : (isToday ? T(L.inProg) : T(L.notClosed));
      nav += '<span class="kdr-chip ' + chip + '">' + esc(chipTxt) + '</span>'
        + '<button class="kdr-btn" data-kdr="print">' + esc(T(L.print)) + '</button>';
    }
    nav += '</div>';

    if (!r || (!r.txns && !(r.refunds && r.refunds.count))) {
      return window.Kiwi.appPage(NAV, {
        title: T(L.title),
        subtitle: (st.name || '') + (st.name ? ' · ' : '') + dayLabel(current),
        body: nav + '<div class="kdr-empty"><h3>' + esc(T(L.empty)) + '</h3><p>' + esc(T(L.emptyHint)) + '</p></div>',
      });
    }

    /* ── qui, quand ── */
    var idCells = [];
    var push = function (lab, val) { if (val) idCells.push('<div class="kdr-id-cell"><span>' + esc(lab) + '</span><b>' + esc(val) + '</b></div>'); };
    push(T(L.openedAt), hm(r.openedAt || r.firstSaleAt));
    push(T(L.closedAt), r.closedAt ? hm(r.closedAt) : (r.lastSaleAt ? hm(r.lastSaleAt) + ' *' : ''));
    push(T(L.openedBy), r.openedBy);
    push(T(L.closedBy), r.closedBy);
    var idBlock = idCells.length ? '<div class="kdr-id">' + idCells.join('') + '</div>' : '';

    /* ── les quatre chiffres ── */
    var ec = r.cash && r.cash.ecart;
    var kpis = '<div class="kdr-kpis">'
      + kpi(T(L.net), money(r.net) + ' MAD', 'lead')
      + kpi(T(L.txns), String(r.txns))
      + kpi(T(L.basket), money(r.basket), null, 'MAD')
      + (r.cash && r.cash.counted != null
        ? kpi(T(L.ecart), (ec > 0 ? '+' : ec < 0 ? '−' : '') + money(Math.abs(ec)), Math.abs(ec) <= 5 ? 'ok' : 'off', 'MAD')
        : kpi(T(L.gross), money(r.gross), null, 'MAD'))
      + '</div>';

    /* ── moyens de paiement ── */
    var mRows = Object.keys(r.methods || {})
      .filter(function (k) { return r.methods[k]; })
      .sort(function (a, b) { return r.methods[b] - r.methods[a]; })
      .map(function (k) { return row(methodLabel(k), money(r.methods[k]) + ' MAD'); }).join('');
    var payBlock = mRows ? '<div class="kdr-sec"><div class="kdr-h"><span>' + esc(T(L.payments)) + '</span><em>' + esc(money(r.gross)) + ' MAD</em></div>' + mRows + '</div>' : '';

    /* ── le détail par catégorie ── */
    var catBlock = '';
    if ((r.categories || []).length) {
      /* « 1 plats » est le genre de détail qui fait douter du reste du chiffre.
         L'arabe ne marque pas le pluriel comme le français : on n'y touche pas,
         la forme du dictionnaire y est déjà la bonne. */
      var unit = function (n) {
        if (LANG() === 'ar') return V.items;
        return Math.abs(+n || 0) === 1 ? V.item : V.items;
      };
      var cats = r.categories.map(function (c) {
        /* Le fourre-tout est retraduit dans la langue du lecteur : le rapport a
           été figé dans celle de la caisse, la page est peut-être lue en arabe. */
        var name = c.uncat ? T(L.divers) : c.name;
        var prods = (c.products || []).map(function (p) {
          return '<div class="kdr-p"><span class="kdr-p-q">' + esc(qty(p.qty)) + '×</span>'
            + '<span class="kdr-p-n">' + esc(p.name) + '</span>'
            + '<span class="kdr-p-t">' + esc(money(p.total)) + ' MAD</span></div>';
        }).join('');
        return '<div class="kdr-cat">'
          + '<div class="kdr-cat-h"><span class="kdr-cat-n">' + esc(name) + '</span>'
          + '<span class="kdr-cat-v">' + esc(money(c.total)) + ' MAD</span></div>'
          + '<div class="kdr-cat-b">' + prods + '</div>'
          + '<div class="kdr-cat-f"><span>' + esc(T(L.total)) + ' ' + esc(name) + '</span>'
          + '<span><b>' + esc(qty(c.qty)) + '</b> ' + esc(unit(c.qty)) + ' · <b>' + esc(money(c.total)) + '</b> MAD</span></div>'
          + '</div>';
      }).join('');
      var cover = (r.coverage != null && r.coverage < 100)
        ? '<div class="kdr-note">' + esc(T(L.coverage).replace('{p}', r.coverage)) + '</div>' : '';
      catBlock = '<div class="kdr-sec"><div class="kdr-h"><span>' + esc(V.cats) + '</span><em>'
        + esc(String(r.categories.length)) + '</em></div>' + cats + cover + '</div>';
    } else {
      catBlock = '<div class="kdr-sec"><div class="kdr-h"><span>' + esc(V.cats) + '</span></div>'
        + '<div class="kdr-note">' + esc(T(L.noDetail)) + '</div></div>';
    }

    /* ── ajustements : ce qui a réduit la recette ── */
    var adj = '';
    if (r.refunds && r.refunds.count) adj += row(T(L.refunds) + ' (' + r.refunds.count + ')', '− ' + money(r.refunds.amount) + ' MAD');
    if (r.discounts && r.discounts.amount) adj += row(T(L.discounts) + (r.discounts.count ? ' (' + r.discounts.count + ')' : ''), '− ' + money(r.discounts.amount) + ' MAD');
    if (r.cancels) adj += row(T(L.cancels), String(r.cancels));
    if (r.tips) adj += row(LANG() === 'en' ? 'Tips' : (LANG() === 'ar' ? 'الإكراميات' : 'Pourboires'), money(r.tips) + ' MAD');
    if (adj) adj = '<div class="kdr-sec"><div class="kdr-h"><span>' + esc(T(L.adjust)) + '</span></div>' + adj
      + row(T(L.gross), money(r.gross) + ' MAD', 'sub')
      + row(T(L.net), money(r.net) + ' MAD', 'total') + '</div>';

    /* ── le tiroir ── */
    var cashBlock = '';
    var cash = r.cash || {};
    if (r.live) {
      cashBlock = '<div class="kdr-sec"><div class="kdr-h"><span>' + esc(T(L.drawer)) + '</span></div>'
        + '<div class="kdr-note">' + esc(T(L.noDrawer)) + '</div></div>';
    } else {
      var cr = row(T(L.opening), money(cash.opening) + ' MAD');
      cr += row(T(L.cashIn), '+ ' + money(cash.sales) + ' MAD');
      if (cash.tips) cr += row(T(L.cashTips), '+ ' + money(cash.tips) + ' MAD');
      (cash.movements || []).forEach(function (m) {
        cr += row(m.reason || (m.type === 'in' ? '↑' : '↓'), (m.type === 'in' ? '+ ' : '− ') + money(m.amount) + ' MAD', 'sub');
      });
      cr += row(T(L.expected), money(cash.expected) + ' MAD', 'total');
      cr += cash.counted != null
        ? row(T(L.counted), money(cash.counted) + ' MAD')
          + row(T(L.ecart), ((cash.ecart > 0 ? '+ ' : cash.ecart < 0 ? '− ' : '') + money(Math.abs(cash.ecart)) + ' MAD'))
        : row(T(L.counted), T(L.notCount));
      /* Les mouvements hors ventes se disent même quand il n'y en a pas : « rien
         n'est sorti du tiroir » est une information, une section absente non. */
      if (!(cash.movements || []).length) cr += '<div class="kdr-note">' + esc(T(L.movesNone)) + '</div>';
      cashBlock = '<div class="kdr-sec"><div class="kdr-h"><span>' + esc(T(L.drawer)) + '</span></div>' + cr + '</div>';
    }

    /* ── la trace des réouvertures ── */
    var revBlock = '';
    if ((r.closedCount || 0) > 1 && (r.revisions || []).length) {
      var revs = r.revisions.slice().reverse().map(function (v) {
        return row(hm(v.at) + (v.by ? ' · ' + v.by : ''), money(v.gross) + ' MAD · ' + v.txns + ' tx', 'sub');
      }).join('');
      revBlock = '<div class="kdr-sec"><div class="kdr-h"><span>' + esc(T(L.revision)) + '</span><em>'
        + esc(T(L.reopened).replace('{n}', r.closedCount)) + '</em></div>' + revs + '</div>';
    }

    var page = window.Kiwi.appPage(NAV, {
      title: T(L.title),
      subtitle: (st.name || '') + (st.name ? ' · ' : '') + dayLabel(current),
      body: nav + idBlock + kpis + payBlock + catBlock + adj + cashBlock + revBlock,
    });
    bind(page, r);
    return page;
  }

  function bind(page, report) {
    if (!page || !page.el) return;
    page.el.addEventListener('click', function (e) {
      var b = e.target.closest('[data-kdr]');
      if (!b) return;
      var a = b.getAttribute('data-kdr');
      var d = DR(); if (!d) return;
      if (a === 'prev') { render(d.shiftDay(current, -1)); return; }
      if (a === 'next') {
        var nxt = d.shiftDay(current, 1);
        /* Jamais au-delà d'aujourd'hui : un rapport de demain n'existe pas. */
        if (nxt > d.today()) return;
        render(nxt); return;
      }
      if (a === 'print') { printReport(report); return; }
    });
    var pick = page.el.querySelector('[data-kdr="pick"]');
    if (pick) pick.addEventListener('change', function () {
      var v = this.value; if (!v) return;
      var d = DR(); if (d && v > d.today()) v = d.today();
      render(v);
    });
  }

  /* Imprimer depuis le tableau de bord. Le patron n'a pas d'imprimante
     thermique dans son bureau : printDayReport retombe tout seul sur le pilote
     du système, donc « Enregistrer en PDF » — un archivage parfaitement valable
     pour une pièce qu'on classe. Même mise en page que le ticket de la caisse. */
  function printReport(r) {
    if (!r || !window.KiwiPrinter || !window.KiwiPrinter.printDayReport) return;
    var d = DR(); var V = d ? d.vocab() : { items: 'articles', cat: 'catégorie' };
    var st = storeInfo();
    window.KiwiPrinter.printDayReport({
      report: r,
      shop: st.name || (r.store && r.store.name) || 'Kiwi',
      address: st.location || (r.store && r.store.location) || '',
      title: T(L.title).toUpperCase(),
      dateLabel: dayLabel(r.day),
      copy: r.closed ? '' : 'PROVISOIRE',
      openedLabel: hm(r.openedAt || r.firstSaleAt),
      closedLabel: r.closedAt ? hm(r.closedAt) : '',
      detailTitle: String(V.cats || 'catégories').toUpperCase(),
      drawerTitle: T(L.drawer).toUpperCase(),
      netLabel: T(L.net).toUpperCase(),
      unitWord: V.items,
      notCounted: T(L.notCount),
      methodLabels: METHODS[LANG()] || METHODS.fr,
      fmt: money,
    });
  }

  /* ─────────────────────────── le câblage ─────────────────────────── */

  function install() {
    var K = window.Kiwi;
    if (!K || !K.handlers) return false;
    K.handlers['nav-' + NAV] = function () { render(null); };
    return true;
  }
  (function boot() {
    if (install()) return;
    var tries = 0;
    var t = setInterval(function () {
      if (install() || ++tries > 40) clearInterval(t);
    }, 120);
  })();

  /* Une clôture faite sur la caisse d'à côté (même navigateur, autre onglet) ou
     un instantané qui redescend du serveur : la page se repeint si elle est à
     l'écran, et seulement dans ce cas. */
  window.addEventListener('load', function () {
    if (window.KiwiDayReport && window.KiwiDayReport.subscribe) {
      window.KiwiDayReport.subscribe(function () {
        if (document.querySelector('.dash-genpage [data-kdr]')) render(current);
      });
    }
    if (window.KiwiSales && window.KiwiSales.subscribe) {
      window.KiwiSales.subscribe(function () {
        if (document.querySelector('.dash-genpage [data-kdr]')) render(current);
      });
    }
    /* Changement d'établissement : le rapport suit le magasin à l'écran. */
    if (window.KiwiVenue && window.KiwiVenue.subscribe) {
      window.KiwiVenue.subscribe(function () {
        current = null;
        if (document.querySelector('.dash-genpage [data-kdr]')) render(null);
      });
    }
  });
})();
