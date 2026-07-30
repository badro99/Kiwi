/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · RAPPORT JOURNALIER — la destination du tableau de bord
 * ---------------------------------------------------------------------------
 * Ce que le patron ouvre à 8h du matin, avant d'ouvrir la boutique. Pas un
 * chiffre d'affaires : une journée racontée. Qui a ouvert, qui a fermé, ce qui
 * s'est vendu, dans quel rayon, à quelle heure, réglé comment, et ce qu'il y
 * avait dans le tiroir par rapport à ce qu'il aurait dû y avoir.
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
 * ── POURQUOI LA FRISE DES QUATORZE JOURS ───────────────────────────────────
 * Parce que sans elle la page était un cul-de-sac. On atterrissait sur « aucune
 * vente ce jour-là » — l'état le plus probable, puisque la page ouvre sur hier
 * — avec deux flèches et un sélecteur de date, et AUCUN moyen de savoir quel
 * jour contenait quelque chose. Il fallait reculer à l'aveugle, un clic par
 * jour. La frise répond à la seule question qu'on se pose en arrivant : où est
 * la matière. Elle s'affiche même quand la journée est vide — surtout quand la
 * journée est vide.
 *
 * ── ET LA COMPARAISON ──────────────────────────────────────────────────────
 * « 4 200 MAD » ne veut rien dire tout seul. La référence est le MÊME JOUR DE
 * LA SEMAINE PRÉCÉDENTE, pas la veille : un lundi de café ne ressemble pas à
 * un dimanche, et comparer les deux fabrique une alerte tous les lundis. Elle
 * est nommée à l'écran (« vs. lundi dernier ») pour qu'aucun pourcentage ne
 * reste mystérieux, et elle s'efface quand il n'y a pas de référence.
 *
 * Chargez-moi APRÈS day-report.js et pages-pro.js (dont j'emprunte la coquille
 * de page, Kiwi.appPage).
 * ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var NAV = 'rapport';
  var STRIP_DAYS = 14;      /* deux semaines : assez pour voir le rythme hebdo */

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
  /* Le format machine, pour le CSV : point décimal, pas d'espace insécable.
     Un tableur ne sait pas lire « 4 200,5 ». */
  function raw2(n) { return String(Math.round((+n || 0) * 100) / 100); }
  function qty(n) { var v = Math.round((+n || 0) * 100) / 100; return String(v); }
  function pad2(n) { return String(n).padStart(2, '0'); }
  function hm(ms) {
    if (!ms) return '';
    var d = new Date(ms);
    return pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }
  function hourLabel(h) { return LANG() === 'fr' ? pad2(h) + 'h' : pad2(h) + ':00'; }

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
    movesNone: { fr: 'Aucune entrée ni sortie hors ventes.', en: 'No non-sale cash in or out.', ar: 'لا حركات نقدية خارج المبيعات.' },
    openedAt:  { fr: 'Ouverture', en: 'Opened', ar: 'الافتتاح' },
    closedAt:  { fr: 'Fermeture', en: 'Closed', ar: 'الإغلاق' },
    lastSale:  { fr: 'Dernière vente', en: 'Last sale', ar: 'آخر عملية' },
    openedBy:  { fr: 'Ouvert par', en: 'Opened by', ar: 'فتحها' },
    closedBy:  { fr: 'Fermé par', en: 'Closed by', ar: 'أغلقها' },
    inProg:    { fr: 'Journée en cours', en: 'Day in progress', ar: 'يوم جارٍ' },
    closed:    { fr: 'Journée clôturée', en: 'Day closed', ar: 'يوم مُقفل' },
    notClosed: { fr: 'Journée non clôturée', en: 'Day not closed', ar: 'يوم غير مُقفل' },
    noDrawer:  { fr: 'Le comptage du tiroir vient de la caisse. Cette journée n’a pas été clôturée sur la caisse, il n’y a donc ni attendu ni écart à afficher.', en: 'The drawer count comes from the register. This day was never closed on the register, so there is no expected total and no difference to show.', ar: 'يأتي جرد الدرج من الصندوق. لم يُقفل هذا اليوم على الصندوق، لذا لا يوجد مبلغ متوقع ولا فرق.' },
    empty:     { fr: 'Aucune vente ce jour-là.', en: 'No sales that day.', ar: 'لا مبيعات في ذلك اليوم.' },
    emptyHint: { fr: 'Dès que la caisse encaisse, la journée se remplit ici toute seule.', en: 'As soon as the register takes a payment, the day fills itself in here.', ar: 'بمجرد أن يسجّل الصندوق عملية، يمتلئ اليوم هنا تلقائياً.' },
    goLast:    { fr: 'Voir le {d}, dernier jour avec des ventes', en: 'Go to {d}, the last day with sales', ar: 'عرض {d}، آخر يوم بمبيعات' },
    print:     { fr: 'Imprimer', en: 'Print', ar: 'طباعة' },
    csv:       { fr: 'Exporter', en: 'Export', ar: 'تصدير' },
    today:     { fr: "Aujourd'hui", en: 'Today', ar: 'اليوم' },
    yesterday: { fr: 'Hier', en: 'Yesterday', ar: 'أمس' },
    pickDay:   { fr: 'Choisir une date', en: 'Pick a date', ar: 'اختر تاريخاً' },
    prevDay:   { fr: 'Jour précédent', en: 'Previous day', ar: 'اليوم السابق' },
    nextDay:   { fr: 'Jour suivant', en: 'Next day', ar: 'اليوم التالي' },
    reopened:  { fr: 'Clôturée {n} fois', en: 'Closed {n} times', ar: 'أُقفل {n} مرات' },
    revision:  { fr: 'Historique des clôtures', en: 'Closing history', ar: 'سجل الإقفال' },
    coverage:  { fr: 'Ce détail porte sur {p}% du chiffre encaissé — les ventes sans panier détaillé n’y figurent pas.', en: 'This breakdown covers {p}% of revenue — sales with no itemised basket are not in it.', ar: 'يغطي هذا التفصيل {p}٪ من المداخيل — المبيعات بدون سلة مفصّلة غير مدرجة.' },
    noDetail:  { fr: 'Aucun détail produit pour cette journée — les ventes ont été encaissées sans panier détaillé.', en: 'No product detail for this day — sales were taken without an itemised basket.', ar: 'لا تفاصيل للمنتجات في هذا اليوم.' },
    divers:    { fr: 'Divers', en: 'Other', ar: 'متفرقات' },
    total:     { fr: 'Total', en: 'Total', ar: 'المجموع' },
    /* ── les blocs ajoutés ── */
    history:   { fr: 'Les {n} derniers jours', en: 'The last {n} days', ar: 'آخر {n} يوماً' },
    hourly:    { fr: 'Le rythme de la journée', en: 'Rhythm of the day', ar: 'إيقاع اليوم' },
    peak:      { fr: 'Pic {h}', en: 'Peak {h}', ar: 'الذروة {h}' },
    noHours:   { fr: 'Les ventes de cette journée ne portent pas d’heure exploitable.', en: 'This day’s sales carry no usable timestamp.', ar: 'مبيعات هذا اليوم لا تحمل توقيتاً صالحاً.' },
    top:       { fr: 'Ce qui a fait la journée', en: 'What made the day', ar: 'ما صنع اليوم' },
    cashiers:  { fr: 'Par encaisseur', en: 'By cashier', ar: 'حسب الصندوقي' },
    /* En arabe, « بـ » collé à un mot qui commence par « ال » donne « بـالجمعة ».
       « مقارنة مع » évite l'agglutination et dit la même chose. */
    vsPrev:    { fr: 'vs. {d} dernier', en: 'vs. last {d}', ar: 'مقارنة مع {d} الماضي' },
    noBase:    { fr: 'pas de référence', en: 'no baseline', ar: 'لا مرجع' },
    tx:        { fr: 'tickets', en: 'tickets', ar: 'تذاكر' },
    noSale:    { fr: 'aucune vente', en: 'no sales', ar: 'لا مبيعات' },
  };
  var METHODS = {
    fr: { cash: 'Espèces', card: 'Carte', wallet: 'Virement', tap: 'Kiwi Tap', qr: 'QR', link: 'Lien', delivery: 'Livraison · à recevoir' },
    en: { cash: 'Cash', card: 'Card', wallet: 'Transfer', tap: 'Kiwi Tap', qr: 'QR', link: 'Link', delivery: 'Delivery · receivable' },
    ar: { cash: 'نقدًا', card: 'بطاقة', wallet: 'تحويل', tap: 'Kiwi Tap', qr: 'QR', link: 'رابط', delivery: 'توصيل · مبلغ مستحق' },
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
  function dayDate(day) {
    var p = String(day || '').split('-');
    if (p.length !== 3) return null;
    return new Date(+p[0], +p[1] - 1, +p[2]);
  }
  function dayLabel(day) {
    var d = dayDate(day); if (!d) return day || '';
    var l = LANG();
    return (DAYS[l] || DAYS.fr)[d.getDay()] + ' ' + d.getDate() + ' ' + (MONTHS[l] || MONTHS.fr)[d.getMonth()] + ' ' + d.getFullYear();
  }
  /* Sans l'année ni le nom du jour — pour les infobulles de la frise. */
  function shortLabel(day) {
    var d = dayDate(day); if (!d) return day || '';
    var l = LANG();
    return (DAYS[l] || DAYS.fr)[d.getDay()] + ' ' + d.getDate() + ' ' + (MONTHS[l] || MONTHS.fr)[d.getMonth()];
  }
  function weekdayName(day) {
    var d = dayDate(day); if (!d) return '';
    return (DAYS[LANG()] || DAYS.fr)[d.getDay()];
  }

  /* ─────────────────────────── les styles ─────────────────────────── */
  function ensureStyles() {
    if (document.getElementById('kdr-style')) return;
    var s = document.createElement('style');
    s.id = 'kdr-style';
    s.textContent = [
      /* ── la barre de navigation ── */
      '.kdr-nav{display:flex;align-items:center;gap:8px;margin-bottom:14px;flex-wrap:wrap}',
      '.kdr-arrow{width:34px;height:34px;border-radius:10px;border:1px solid var(--n-200);background:transparent;color:var(--ink);display:grid;place-items:center;cursor:pointer;font-size:15px;line-height:1;transition:background 140ms,border-color 140ms}',
      '.kdr-arrow:hover:not(:disabled){background:color-mix(in srgb,var(--atlas) 8%,transparent);border-color:var(--atlas)}',
      '.kdr-arrow:disabled{opacity:.32;cursor:default}',
      /* `kdr-day` et non `kdr-date` : le sélecteur de plage de dates
         (assets/dashboard-extra.js, où kdr = Kiwi Date Range) possède déjà un
         `.kdr-date`, et son `width:100%` — écrit pour un champ de formulaire —
         tombait sur ce libellé. La date partait sur toute la largeur et
         cassait la barre d'outils en trois lignes. Deux fonctionnalités
         partagent ce préfixe : vérifier les deux avant d'ajouter une classe. */
      '.kdr-day{font-size:15px;font-weight:600;color:var(--ink);margin-inline-start:4px}',
      '.kdr-day b{font-weight:600}',
      '.kdr-day i{font-style:normal;color:var(--n-500);font-weight:400}',
      /* Le sélecteur natif affichait « 07/27/2026 » — la date américaine, à côté
         de « lundi 27 juillet 2026 » écrit juste avant. On garde le champ (c'est
         lui qui ouvre le calendrier du système) mais on le réduit à son icône :
         la date lisible est déjà là, deux fois c'était une de trop. */
      '.kdr-pick{position:relative;display:inline-grid;place-items:center;width:34px;height:34px;border:1px solid var(--n-200);border-radius:10px;color:var(--n-500);cursor:pointer;transition:background 140ms,border-color 140ms,color 140ms}',
      '.kdr-pick:hover{background:color-mix(in srgb,var(--atlas) 8%,transparent);border-color:var(--atlas);color:var(--atlas)}',
      '.kdr-pick input{position:absolute;inset:0;width:100%;height:100%;opacity:0;border:0;padding:0;margin:0;cursor:pointer;font:inherit}',
      '.kdr-pick input::-webkit-calendar-picker-indicator{position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer}',
      '.kdr-spacer{flex:1;min-width:8px}',
      '.kdr-chip{font-size:11px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;padding:5px 11px;border-radius:999px;white-space:nowrap}',
      '.kdr-chip.is-closed{background:color-mix(in srgb,var(--atlas) 13%,transparent);color:var(--atlas)}',
      '.kdr-chip.is-live{background:color-mix(in srgb,var(--mint) 30%,transparent);color:var(--riad)}',
      '.kdr-chip.is-open{background:var(--n-100);color:var(--n-500)}',
      '.kdr-btn{border:1px solid var(--n-200);border-radius:10px;padding:8px 14px;background:transparent;color:var(--ink);font:inherit;font-size:13px;cursor:pointer;transition:background 140ms,border-color 140ms}',
      '.kdr-btn:hover{background:color-mix(in srgb,var(--atlas) 8%,transparent);border-color:var(--atlas)}',
      /* ── la frise des quatorze jours ── */
      '.kdr-strip{border:1px solid var(--n-200);border-radius:14px;padding:13px 15px 10px;margin-bottom:16px}',
      '.kdr-strip-h{display:flex;justify-content:space-between;align-items:baseline;gap:12px;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--n-500);margin-bottom:11px}',
      '.kdr-strip-h em{font-style:normal;font-family:var(--mono);color:var(--ink);text-transform:none;letter-spacing:0;font-size:12px}',
      '.kdr-bars{display:flex;align-items:flex-end;gap:4px}',
      '.kdr-sd{flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;gap:6px;border:0;background:transparent;padding:0;cursor:pointer;font:inherit;border-radius:6px}',
      '.kdr-sd-t{width:100%;height:52px;display:flex;align-items:flex-end}',
      '.kdr-sd-b{width:100%;min-height:2px;border-radius:3px 3px 0 0;background:color-mix(in srgb,var(--atlas) 34%,transparent);transition:background 140ms}',
      '.kdr-sd:hover .kdr-sd-b{background:color-mix(in srgb,var(--atlas) 62%,transparent)}',
      '.kdr-sd.is-void .kdr-sd-b{background:var(--n-200)}',
      '.kdr-sd.is-sel .kdr-sd-b{background:var(--riad)}',
      '.kdr-sd-n{font-family:var(--mono);font-size:10.5px;color:var(--n-500);line-height:1}',
      '.kdr-sd.is-sel .kdr-sd-n{color:var(--ink);font-weight:600}',
      '.kdr-sd:focus-visible{outline:2px solid var(--atlas);outline-offset:2px}',
      /* ── en-tête d'identité — l'établissement et la séance ── */
      '.kdr-id{border:1px solid var(--n-200);border-radius:14px;padding:15px 18px;margin-bottom:16px;display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px 22px}',
      '.kdr-id-cell b{display:block;font-family:var(--mono);font-size:13.5px;color:var(--ink);font-weight:600}',
      '.kdr-id-cell span{display:block;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--n-500);margin-bottom:3px}',
      /* ── les quatre chiffres de tête ── */
      '.kdr-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:22px}',
      '.kdr-kpi{border:1px solid var(--n-200);border-radius:14px;padding:15px 17px}',
      '.kdr-kpi.is-lead{background:var(--riad);border-color:var(--riad)}',
      '.kdr-kpi.is-lead .kdr-kpi-l{color:rgba(247,245,240,.62)}',
      '.kdr-kpi.is-lead .kdr-kpi-v{color:#fff}',
      '.kdr-kpi-l{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--n-500)}',
      '.kdr-kpi-v{font-family:var(--mono);font-size:25px;font-weight:600;color:var(--ink);margin-top:7px;letter-spacing:-.02em}',
      '.kdr-kpi-v small{font-size:13px;font-weight:400;opacity:.6;margin-inline-start:3px}',
      '.kdr-kpi-v.is-off{color:#B4472F}',
      '.kdr-kpi-v.is-ok{color:var(--atlas)}',
      /* Le delta : une référence nommée, jamais un pourcentage orphelin. */
      '.kdr-d{display:block;margin-top:7px;font-size:11.5px;line-height:1.35;color:var(--n-500)}',
      '.kdr-d b{font-family:var(--mono);font-weight:600}',
      '.kdr-d.up b{color:var(--atlas)}',
      '.kdr-d.down b{color:#B4472F}',
      '.kdr-kpi.is-lead .kdr-d{color:rgba(247,245,240,.5)}',
      '.kdr-kpi.is-lead .kdr-d.up b{color:var(--mint)}',
      '.kdr-kpi.is-lead .kdr-d.down b{color:#F2A48F}',
      /* ── blocs ── */
      '.kdr-sec{margin-bottom:22px}',
      '.kdr-two{display:grid;grid-template-columns:1fr 1fr;gap:0 26px}',
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
      /* ── la courbe horaire ── */
      '.kdr-hrs{display:flex;align-items:stretch;gap:3px;height:96px;padding-top:4px}',
      '.kdr-hr{flex:1;min-width:0;display:flex;align-items:flex-end}',
      '.kdr-hr-b{width:100%;min-height:2px;border-radius:3px 3px 0 0;background:color-mix(in srgb,var(--atlas) 30%,transparent);transition:background 140ms}',
      '.kdr-hr:hover .kdr-hr-b{background:color-mix(in srgb,var(--atlas) 60%,transparent)}',
      '.kdr-hr.is-peak .kdr-hr-b{background:var(--atlas)}',
      '.kdr-hrx{display:flex;gap:3px;margin-top:7px}',
      '.kdr-hrx span{flex:1;min-width:0;text-align:center;font-family:var(--mono);font-size:10px;color:var(--n-500);white-space:nowrap;overflow:hidden}',
      /* ── ce qui a fait la journée ── */
      '.kdr-top{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px}',
      '.kdr-top-c{border:1px solid var(--n-200);border-radius:12px;padding:12px 14px;display:flex;align-items:baseline;gap:10px}',
      '.kdr-top-r{font-family:var(--mono);font-size:12px;color:var(--atlas);font-weight:600}',
      '.kdr-top-m{flex:1;min-width:0}',
      '.kdr-top-n{display:block;font-size:13.5px;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.kdr-top-s{display:block;font-family:var(--mono);font-size:11.5px;color:var(--n-500);margin-top:3px}',
      /* ── le détail par catégorie — le cœur du rapport ── */
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
      /* ── le vide ── */
      '.kdr-empty{text-align:center;padding:40px 20px}',
      '.kdr-empty h3{font-family:var(--serif);font-weight:400;font-size:24px;color:var(--ink);margin:0 0 8px}',
      '.kdr-empty p{font-size:13.5px;color:var(--n-500);margin:0 0 18px;line-height:1.6}',
      '@media (max-width:820px){.kdr-two{grid-template-columns:1fr;gap:0}}',
      '@media (max-width:640px){.kdr-day{font-size:13.5px}.kdr-kpi-v{font-size:21px}.kdr-sd-t{height:40px}.kdr-hrs{height:76px}}',
    ].join('');
    document.head.appendChild(s);
  }

  var CAL_SVG = '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"'
    + ' stroke-linecap="round" aria-hidden="true"><rect x="2" y="3.2" width="12" height="10.8" rx="2"/>'
    + '<path d="M2 6.6h12M5.5 1.7v2.6M10.5 1.7v2.6"/></svg>';

  /* ─────────────────────── résoudre la journée ─────────────────────── */

  var current = null;   /* la journée à l'écran */

  /* L'index du catalogue coûte une traversée de tous les catalogues chargés.
     Un rendu résout jusqu'à trois journées (celle à l'écran, la référence de
     la semaine passée, parfois la veille) : on le calcule une fois par rendu,
     pas une fois par journée. Remis à zéro à chaque rendu — un produit peut
     avoir changé de rayon entre deux visites. */
  var idxMemo = null;
  function catIndex() {
    if (idxMemo) return idxMemo;
    try { idxMemo = DR().categoryIndex(); } catch (_) { idxMemo = Object.create(null); }
    return idxMemo;
  }

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

  /* Les totaux du jour vus par le FEED du tableau de bord (KiwiSales), sans
     construire le rapport entier. Sert deux fois : le repli sans instantané,
     et le contrôle de cohérence ci-dessous. */
  function feedTotals(day) {
    var d = DR(); if (!d) return null;
    var b;
    try { b = d.dayBounds(day); } catch (_) { return null; }
    var net = 0, gross = 0, txns = 0, seen = Object.create(null);
    dashSales().forEach(function (raw) {
      var s = null;
      try { s = d.normSale(raw); } catch (_) {}
      if (!s || s.ts < b.from || s.ts >= b.to) return;
      var k = s.id || (s.ts + ':' + s.amount + ':' + s.ref);
      if (seen[k]) return;
      seen[k] = 1;
      if (s.kind === 'refund' || s.amount < 0) { net -= Math.abs(s.amount); }
      else { net += s.amount; gross += s.amount; txns++; }
    });
    return { net: Math.round(net * 100) / 100, gross: Math.round(gross * 100) / 100, txns: txns };
  }

  /* L'instantané de la caisse peut avoir RATÉ des ventes que le serveur, lui,
     a bien reçues — une vente encaissée sans service ouvert n'entre dans aucun
     journal local, donc dans aucun instantané, mais part quand même en
     synchronisation. Quand le feed du jour dépasse l'instantané, l'instantané
     ment par omission et on ne le montre pas tel quel. L'inverse (feed en
     retrait) ne prouve rien — synchronisation en retard, historique élagué —
     et l'instantané garde alors le dernier mot. */
  function snapMissesSales(snap, day) {
    if (!snap) return false;
    var f = feedTotals(day);
    if (!f) return false;
    return f.txns > (+snap.txns || 0) || f.gross > (+snap.gross || 0) + 0.005;
  }

  /* Ce que seule la caisse sait, relu depuis son instantané, pour le rendre à
     build() quand les ventes se recalculent depuis le feed. */
  function sessionOf(snap) {
    var c = snap.cash || {};
    return {
      openedAt: snap.openedAt, closedAt: snap.closedAt,
      openedBy: snap.openedBy, closedBy: snap.closedBy,
      openingFloat: c.opening,
      cashMovements: c.movements || [],
      countedCash: c.counted,
      discounts: snap.discounts && snap.discounts.amount,
      discountsCount: snap.discounts && snap.discounts.count,
      cancels: snap.cancels,
      handovers: snap.handovers || [],
    };
  }

  /* L'instantané s'il existe ET couvre tout ce que le feed connaît, sinon un
     calcul direct. `live` dit lequel, parce que la page n'affiche pas les mêmes
     promesses dans les deux cas — un recalcul qui a hérité du tiroir de
     l'instantané n'est PAS `live` : son tiroir, lui, est connu. */
  function resolve(day) {
    var d = DR(); if (!d) return null;
    var snap = null;
    try { snap = d.load(day); } catch (_) {}
    if (snap && !snapMissesSales(snap, day)) return snap;
    var built = null;
    try {
      built = d.build({ day: day, sales: dashSales(), session: snap ? sessionOf(snap) : {},
                        store: storeInfo(), source: 'dashboard', categoryIndex: catIndex() });
    } catch (_) { return snap; }
    if (!built) return snap;
    if (snap) {
      /* La comptabilité de l'instantané suit : clôtures et révisions sont un
         historique, pas un calcul. */
      built.closedCount = snap.closedCount || 0;
      built.revisions = snap.revisions || [];
    } else {
      built.live = true;   /* aucun instantané : le tiroir est inconnu */
    }
    return built;
  }

  /* Le total d'une journée SANS la construire entièrement — la frise en demande
     quatorze et la comparaison deux ou trois, et aucune n'a besoin du détail
     produit ni du tiroir. Un build() complet par barre ferait payer le
     regroupement par catégorie quatorze fois pour afficher une hauteur. */
  function totalsFor(day) {
    var d = DR(); if (!d) return { net: 0, gross: 0, txns: 0, has: false, closed: false };
    var snap = null;
    try { snap = d.load(day); } catch (_) {}
    if (snap && !snapMissesSales(snap, day)) {
      return {
        net: +snap.net || 0, gross: +snap.gross || 0, txns: +snap.txns || 0,
        has: !!(snap.txns || (snap.refunds && snap.refunds.count)),
        closed: isClosed(snap),
      };
    }
    var f = feedTotals(day) || { net: 0, gross: 0, txns: 0 };
    return {
      net: f.net, gross: f.gross, txns: f.txns, has: f.txns > 0,
      closed: snap ? isClosed(snap) : false,
    };
  }

  /* Une journée est close quand la caisse a posé une heure de fermeture. Les
     archives écrites avant que `closed` n'existe n'ont que `closedAt` et
     `closedCount` — on les lit aussi, sinon tout l'historique déjà classé
     s'afficherait « non clôturée » à jamais. */
  function isClosed(r) {
    if (!r || r.live) return false;
    return !!(r.closed || r.closedAt || (r.closedCount || 0) > 0);
  }

  /* Le dernier jour qui contient quelque chose, à partir de `before` inclus.
     Deux pistes : le classeur des instantanés, et la vente la plus récente
     connue du tableau de bord. On prend la plus proche des deux. */
  function lastDayWithSales(before) {
    var d = DR(); if (!d) return '';
    var best = '';
    try {
      var arch = d.days() || [];                       /* déjà trié récent → ancien */
      for (var i = 0; i < arch.length; i++) {
        if (arch[i] > before) continue;
        var s = d.load(arch[i]);
        if (s && (s.txns || (s.refunds && s.refunds.count))) { best = arch[i]; break; }
      }
    } catch (_) {}
    try {
      var top = 0;
      dashSales().forEach(function (raw) {
        var s = d.normSale(raw);
        if (s && s.ts > top) { var dd = d.businessDay(s.ts); if (dd <= before) top = s.ts; }
      });
      if (top) {
        var cand = d.businessDay(top);
        if (cand <= before && cand > best) best = cand;
      }
    } catch (_) {}
    return best;
  }

  /* ─────────────────────────── le rendu ─────────────────────────── */

  function kpi(label, value, cls, sub, delta) {
    return '<div class="kdr-kpi' + (cls === 'lead' ? ' is-lead' : '') + '">'
      + '<div class="kdr-kpi-l">' + esc(label) + '</div>'
      + '<div class="kdr-kpi-v' + (cls === 'off' ? ' is-off' : cls === 'ok' ? ' is-ok' : '') + '">'
      + esc(value) + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</div>'
      + (delta || '') + '</div>';
  }
  function row(label, value, mod) {
    return '<div class="kdr-r' + (mod ? ' is-' + mod : '') + '">'
      + '<span class="kdr-r-l">' + esc(label) + '</span>'
      + '<span class="kdr-r-v">' + esc(value) + '</span></div>';
  }

  /* Le delta, avec sa référence NOMMÉE. Rendu vide quand la journée de
     référence n'a rien vendu : « +100 % contre zéro » n'est pas une
     information, c'est un artefact de division. */
  function delta(now, base, baseDay, hasBase) {
    var name = weekdayName(baseDay);
    if (!hasBase || !base) {
      return '<span class="kdr-d">' + esc(T(L.vsPrev).replace('{d}', name)) + ' · ' + esc(T(L.noBase)) + '</span>';
    }
    var pct = Math.round(((now - base) / Math.abs(base)) * 100);
    var cls = pct > 0 ? ' up' : pct < 0 ? ' down' : '';
    var sign = pct > 0 ? '+' : pct < 0 ? '−' : '';
    return '<span class="kdr-d' + cls + '"><b>' + sign + Math.abs(pct) + '&nbsp;%</b> '
      + esc(T(L.vsPrev).replace('{d}', name)) + '</span>';
  }

  /* La frise. Chaque barre est un bouton : c'est la navigation réelle de cette
     page, les flèches ne servent qu'au pas-à-pas. */
  function stripHtml(sel, todayD) {
    var d = DR(); if (!d) return '';
    var days = [];
    var cur = sel;
    /* On remonte STRIP_DAYS-1 jours depuis la journée à l'écran, puis on avance
       si elle est ancienne — la frise cadre toujours la sélection. */
    var end = sel > todayD ? todayD : sel;
    var lastIdx = Math.min(STRIP_DAYS - 1, 2);   /* garde 2 jours de contexte à droite */
    for (var f = 0; f < lastIdx; f++) { var nx = d.shiftDay(end, 1); if (nx > todayD) break; end = nx; }
    cur = end;
    for (var i = 0; i < STRIP_DAYS; i++) { days.unshift(cur); cur = d.shiftDay(cur, -1); }

    var rows = days.map(function (day) { return { day: day, t: totalsFor(day) }; });
    var max = rows.reduce(function (m, r) { return Math.max(m, r.t.net); }, 0);
    var sum = rows.reduce(function (m, r) { return m + r.t.net; }, 0);

    var bars = rows.map(function (r) {
      var dd = dayDate(r.day);
      var pct = max > 0 ? Math.max(4, Math.round(r.t.net / max * 100)) : 0;
      var cls = 'kdr-sd' + (r.day === sel ? ' is-sel' : '') + (r.t.has ? '' : ' is-void');
      var tip = shortLabel(r.day) + ' · ' + (r.t.has
        ? money(r.t.net) + ' MAD · ' + r.t.txns + ' ' + T(L.tx)
        : T(L.noSale));
      return '<button type="button" class="' + cls + '" data-kdr="day" data-day="' + esc(r.day) + '"'
        + ' title="' + esc(tip) + '" aria-label="' + esc(tip) + '"'
        + (r.day === sel ? ' aria-current="true"' : '') + '>'
        + '<span class="kdr-sd-t"><span class="kdr-sd-b" style="height:' + pct + '%"></span></span>'
        + '<span class="kdr-sd-n">' + (dd ? dd.getDate() : '') + '</span></button>';
    }).join('');

    return '<div class="kdr-strip"><div class="kdr-strip-h">'
      + '<span>' + esc(T(L.history).replace('{n}', STRIP_DAYS)) + '</span>'
      + '<em>' + esc(money(sum)) + ' MAD</em></div>'
      + '<div class="kdr-bars">' + bars + '</div></div>';
  }

  function hourlyHtml(r) {
    var hrs = (r.hours || []).filter(function (h) { return h && (h.net > 0 || h.txns > 0); });
    if (!hrs.length) {
      return '<div class="kdr-sec"><div class="kdr-h"><span>' + esc(T(L.hourly)) + '</span></div>'
        + '<div class="kdr-note">' + esc(T(L.noHours)) + '</div></div>';
    }
    var max = hrs.reduce(function (m, h) { return Math.max(m, h.net); }, 0);
    var peak = hrs.reduce(function (m, h) { return (!m || h.net > m.net) ? h : m; }, null);
    /* Une étiquette sous chaque colonne devient illisible dès dix heures
       d'ouverture : on n'en garde qu'une sur deux au-delà de huit colonnes. */
    var every = hrs.length > 8 ? 2 : 1;
    var cols = hrs.map(function (h) {
      var pct = max > 0 ? Math.max(3, Math.round(h.net / max * 100)) : 3;
      var tip = hourLabel(h.h) + ' · ' + money(h.net) + ' MAD · ' + h.txns + ' ' + T(L.tx);
      return '<div class="kdr-hr' + (peak && h.h === peak.h ? ' is-peak' : '') + '" title="' + esc(tip) + '">'
        + '<span class="kdr-hr-b" style="height:' + pct + '%"></span></div>';
    }).join('');
    var labels = hrs.map(function (h, i) {
      return '<span>' + (i % every === 0 ? esc(hourLabel(h.h)) : '') + '</span>';
    }).join('');
    var head = peak
      ? '<em>' + esc(T(L.peak).replace('{h}', hourLabel(peak.h))) + ' · ' + esc(money(peak.net)) + ' MAD</em>'
      : '';
    return '<div class="kdr-sec"><div class="kdr-h"><span>' + esc(T(L.hourly)) + '</span>' + head + '</div>'
      + '<div class="kdr-hrs">' + cols + '</div><div class="kdr-hrx">' + labels + '</div></div>';
  }

  /* Les trois produits qui ont fait le chiffre, tous rayons confondus. Le
     détail par catégorie les contient déjà, mais noyés : un patron qui ouvre
     son rapport veut ce podium avant la liste. */
  function topHtml(r, V) {
    var all = [];
    (r.categories || []).forEach(function (c) {
      (c.products || []).forEach(function (p) { if (p.total > 0) all.push({ n: p.name, q: p.qty, t: p.total }); });
    });
    if (all.length < 2) return '';
    all.sort(function (a, b) { return b.t - a.t; });
    var cards = all.slice(0, 3).map(function (p, i) {
      return '<div class="kdr-top-c"><span class="kdr-top-r">' + (i + 1) + '</span>'
        + '<span class="kdr-top-m"><span class="kdr-top-n">' + esc(p.n) + '</span>'
        + '<span class="kdr-top-s">' + esc(qty(p.q)) + ' ' + esc(V.items) + ' · ' + esc(money(p.t)) + ' MAD</span>'
        + '</span></div>';
    }).join('');
    return '<div class="kdr-sec"><div class="kdr-h"><span>' + esc(T(L.top)) + '</span></div>'
      + '<div class="kdr-top">' + cards + '</div></div>';
  }

  function render(day) {
    ensureStyles();
    idxMemo = null;
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
    var closed = isClosed(r);
    var hasSales = !!(r && (r.txns || (r.refunds && r.refunds.count)));
    var nav = '<div class="kdr-nav">'
      + '<button type="button" class="kdr-arrow" data-kdr="prev" aria-label="' + esc(T(L.prevDay)) + '">‹</button>'
      + '<button type="button" class="kdr-arrow" data-kdr="next" aria-label="' + esc(T(L.nextDay)) + '"' + (isToday ? ' disabled' : '') + '>›</button>'
      + '<label class="kdr-pick" title="' + esc(T(L.pickDay)) + '">' + CAL_SVG
      + '<input type="date" data-kdr="pick" value="' + esc(current) + '" max="' + esc(todayD) + '" aria-label="' + esc(T(L.pickDay)) + '" /></label>'
      + '<div class="kdr-day"><b>' + esc(dayLabel(current)) + '</b>' + (rel ? ' <i>· ' + esc(rel) + '</i>' : '') + '</div>'
      + '<div class="kdr-spacer"></div>';
    if (hasSales) {
      var chip = closed ? 'is-closed' : (isToday ? 'is-live' : 'is-open');
      var chipTxt = closed ? T(L.closed) : (isToday ? T(L.inProg) : T(L.notClosed));
      nav += '<span class="kdr-chip ' + chip + '">' + esc(chipTxt) + '</span>'
        + '<button type="button" class="kdr-btn" data-kdr="csv">' + esc(T(L.csv)) + '</button>'
        + '<button type="button" class="kdr-btn" data-kdr="print">' + esc(T(L.print)) + '</button>';
    }
    nav += '</div>';

    var strip = stripHtml(current, todayD);

    /* ── la journée vide ─────────────────────────────────────────────────
       Elle garde la frise : c'est justement là qu'on a besoin de voir où sont
       les ventes. Et si un jour en contient, on y va d'un clic au lieu de
       reculer flèche par flèche. */
    if (!hasSales) {
      var lastGood = lastDayWithSales(current);
      if (lastGood === current) lastGood = '';
      var cta = lastGood
        ? '<button type="button" class="kdr-btn" data-kdr="day" data-day="' + esc(lastGood) + '">'
          + esc(T(L.goLast).replace('{d}', shortLabel(lastGood))) + '</button>'
        : '';
      var pageE = window.Kiwi.appPage(NAV, {
        title: T(L.title),
        subtitle: (st.name || '') + (st.name ? ' · ' : '') + dayLabel(current),
        body: nav + strip + '<div class="kdr-empty"><h3>' + esc(T(L.empty)) + '</h3><p>'
          + esc(T(L.emptyHint)) + '</p>' + cta + '</div>',
      });
      bind(pageE, r);
      return pageE;
    }

    /* ── qui, quand ── */
    var idCells = [];
    var push = function (lab, val) { if (val) idCells.push('<div class="kdr-id-cell"><span>' + esc(lab) + '</span><b>' + esc(val) + '</b></div>'); };
    push(T(L.openedAt), hm(r.openedAt || r.firstSaleAt));
    /* L'astérisque muet d'avant (« 19:42 * ») ne disait pas ce qu'il marquait.
       Une journée non clôturée n'a pas d'heure de fermeture — elle a une
       dernière vente, et c'est ce mot-là qu'on écrit. */
    if (r.closedAt) push(T(L.closedAt), hm(r.closedAt));
    else if (r.lastSaleAt) push(T(L.lastSale), hm(r.lastSaleAt));
    push(T(L.openedBy), r.openedBy);
    push(T(L.closedBy), r.closedBy);
    var idBlock = idCells.length ? '<div class="kdr-id">' + idCells.join('') + '</div>' : '';

    /* ── les quatre chiffres, chacun avec sa référence ── */
    var baseDay = d.shiftDay(current, -7);
    var base = totalsFor(baseDay);
    var baseBasket = base.txns ? base.gross / base.txns : 0;
    var ec = r.cash && r.cash.ecart;
    var kpis = '<div class="kdr-kpis">'
      + kpi(T(L.net), money(r.net) + ' MAD', 'lead', '', delta(r.net, base.net, baseDay, base.has))
      + kpi(T(L.txns), String(r.txns), null, '', delta(r.txns, base.txns, baseDay, base.has))
      + kpi(T(L.basket), money(r.basket), null, 'MAD', delta(r.basket, baseBasket, baseDay, base.has && base.txns > 0))
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

    /* ── qui a encaissé — seulement s'ils sont plusieurs ── */
    var cshBlock = '';
    if ((r.cashiers || []).length > 1) {
      var crows = r.cashiers.map(function (c) {
        return row(c.name, money(c.net) + ' MAD · ' + c.txns + ' ' + T(L.tx));
      }).join('');
      cshBlock = '<div class="kdr-sec"><div class="kdr-h"><span>' + esc(T(L.cashiers)) + '</span><em>'
        + esc(String(r.cashiers.length)) + '</em></div>' + crows + '</div>';
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

    /* Deux colonnes sur large écran : sur 1080 px de large, empiler « moyens de
       paiement » (quatre lignes) sous « tiroir » (six) laissait la moitié droite
       de la page vide sur toute sa hauteur. */
    var page = window.Kiwi.appPage(NAV, {
      title: T(L.title),
      subtitle: (st.name || '') + (st.name ? ' · ' : '') + dayLabel(current),
      body: nav + strip + idBlock + kpis
        + hourlyHtml(r)
        + '<div class="kdr-two">' + payBlock + cashBlock + '</div>'
        + topHtml(r, V)
        + catBlock
        + '<div class="kdr-two">' + adj + cshBlock + '</div>'
        + revBlock,
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
      if (a === 'day') {
        var t = b.getAttribute('data-day');
        if (t && t <= d.today()) render(t);
        return;
      }
      if (a === 'print') { printReport(report); return; }
      if (a === 'csv') { exportCsv(report); return; }
    });
    var pick = page.el.querySelector('[data-kdr="pick"]');
    if (pick) {
      pick.addEventListener('change', function () {
        var v = this.value; if (!v) return;
        var d = DR(); if (d && v > d.today()) v = d.today();
        render(v);
      });
      /* Le champ est invisible (l'icône tient sa place) : sur les navigateurs
         qui l'exposent, on ouvre le calendrier explicitement plutôt que de
         compter sur un clic dans un contrôle qu'on ne voit pas. */
      var wrap = pick.closest('.kdr-pick');
      if (wrap) wrap.addEventListener('click', function () {
        try { if (pick.showPicker) pick.showPicker(); } catch (_) {}
      });
    }
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
      copy: isClosed(r) ? '' : 'PROVISOIRE',
      openedLabel: hm(r.openedAt || r.firstSaleAt),
      closedLabel: r.closedAt ? hm(r.closedAt) : '',
      detailTitle: String(V.cats || 'catégories').toUpperCase(),
      drawerTitle: T(L.drawer).toUpperCase(),
      netLabel: T(L.net).toUpperCase(),
      unitWord: V.items,
      unitWordOne: V.item,
      notCounted: T(L.notCount),
      methodLabels: METHODS[LANG()] || METHODS.fr,
      fmt: money,
    });
  }

  /* Le CSV, pour le comptable — qui ne veut ni un PDF ni une capture d'écran.
     Les nombres partent en format machine (point décimal, pas de séparateur de
     milliers) : « 4 200,50 » n'est pas un nombre pour un tableur. Le BOM en
     tête est ce qui fait qu'Excel ouvre les accents sans les casser. */
  function exportCsv(r) {
    if (!r) return;
    var st = storeInfo();
    var V = (DR() ? DR().vocab(st.type || undefined) : { cats: 'catégories', items: 'articles' });
    var q = function (arr) {
      return arr.map(function (v) {
        var s = String(v == null ? '' : v);
        if (/^[\t\r ]*[=+\-@]/.test(s)) s = "'" + s;
        return '"' + s.replace(/"/g, '""') + '"';
      }).join(',');
    };
    var out = [];
    out.push(q([T(L.title), st.name || (r.store && r.store.name) || '', dayLabel(r.day)]));
    out.push(q([isClosed(r) ? T(L.closed) : T(L.notClosed)]));
    out.push('');
    out.push(q([T(L.net), raw2(r.net), 'MAD']));
    out.push(q([T(L.gross), raw2(r.gross), 'MAD']));
    out.push(q([T(L.txns), r.txns]));
    out.push(q([T(L.basket), raw2(r.basket), 'MAD']));
    if (r.refunds && r.refunds.count) out.push(q([T(L.refunds), raw2(r.refunds.amount), 'MAD', r.refunds.count]));
    if (r.discounts && r.discounts.amount) out.push(q([T(L.discounts), raw2(r.discounts.amount), 'MAD', r.discounts.count || '']));
    if (r.tips) out.push(q([LANG() === 'en' ? 'Tips' : 'Pourboires', raw2(r.tips), 'MAD']));
    out.push('');
    out.push(q([T(L.payments), 'MAD']));
    Object.keys(r.methods || {}).forEach(function (k) {
      if (r.methods[k]) out.push(q([methodLabel(k), raw2(r.methods[k])]));
    });
    if (!r.live && r.cash) {
      out.push('');
      out.push(q([T(L.drawer), 'MAD']));
      out.push(q([T(L.opening), raw2(r.cash.opening)]));
      out.push(q([T(L.cashIn), raw2(r.cash.sales)]));
      (r.cash.movements || []).forEach(function (m) {
        out.push(q([m.reason || m.type, (m.type === 'out' ? '-' : '') + raw2(m.amount)]));
      });
      out.push(q([T(L.expected), raw2(r.cash.expected)]));
      out.push(q([T(L.counted), r.cash.counted == null ? T(L.notCount) : raw2(r.cash.counted)]));
      if (r.cash.counted != null) out.push(q([T(L.ecart), raw2(r.cash.ecart)]));
    }
    if ((r.hours || []).length) {
      out.push('');
      out.push(q([T(L.hourly), T(L.net) + ' (MAD)', T(L.txns)]));
      r.hours.forEach(function (h) { out.push(q([hourLabel(h.h), raw2(h.net), h.txns])); });
    }
    if ((r.cashiers || []).length) {
      out.push('');
      out.push(q([T(L.cashiers), T(L.net) + ' (MAD)', T(L.txns)]));
      r.cashiers.forEach(function (c) { out.push(q([c.name, raw2(c.net), c.txns])); });
    }
    if ((r.categories || []).length) {
      out.push('');
      out.push(q([V.cat || 'Catégorie', V.item || 'Article', 'Qté', T(L.total) + ' (MAD)']));
      r.categories.forEach(function (c) {
        var name = c.uncat ? T(L.divers) : c.name;
        (c.products || []).forEach(function (p) { out.push(q([name, p.name, raw2(p.qty), raw2(p.total)])); });
      });
    }
    try {
      var blob = new Blob(['﻿' + out.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'kiwi-rapport-' + ((r.store && r.store.slug) || 'jour') + '-' + r.day + '.csv';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
    } catch (_) {}
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
