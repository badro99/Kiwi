/* Kiwi · pressing operational subpages
 * Keeps the shared owner dashboard intact and replaces only the navigation
 * destinations that are specific to the exact `pressing` trade.
 */
(function () {
  'use strict';

  var host = null;
  var current = false;
  var currentPage = '';

  /* Langue : le tableau de bord pressing n'existait qu'en français alors que la
     barre latérale, elle, se traduisait. Chaque phrase porte ses trois langues. */
  function lang() {
    try { return (window.KiwiI18n && KiwiI18n.getLang && KiwiI18n.getLang()) || 'fr'; } catch (_) { return 'fr'; }
  }
  function L(fr, en, ar) {
    var l = lang();
    return l === 'en' ? en : l === 'ar' ? ar : fr;
  }
  /* Pluriel : le français traite 0 et 1 au singulier (« 0 pièce »), l'anglais
     seulement 1. L'arabe a un duel et un pluriel de 3 à 10. */
  function plural(n, fr, en, ar) {
    n = Math.abs(Number(n) || 0);
    var l = lang();
    if (l === 'en') return n === 1 ? en[0] : en[1];
    if (l === 'ar') return n === 2 && ar[2] ? ar[2] : (n >= 3 && n <= 10 ? ar[1] : ar[0]);
    return n < 2 ? fr[0] : fr[1];
  }
  function pieces(n) { return plural(n, ['pièce', 'pièces'], ['piece', 'pieces'], ['قطعة', 'قطع', 'قطعتان']); }

  function pageMeta(nav) {
    var m = {
      'pressing-orders': [L('Dépôts & commandes', 'Drop-offs & orders', 'الإيداعات والطلبات'),
        L('Tous les bons, vêtements et échéances au même endroit', 'Every ticket, garment and due date in one place', 'كل الطلبات والقطع والمواعيد في مكان واحد')],
      'pressing-workshop': [L('Atelier & flux', 'Workshop & workflow', 'الورشة وسير العمل'),
        L('Suivez chaque commande de la réception à la remise', 'Follow every order from drop-off to hand-over', 'تابع كل طلب من الاستلام إلى التسليم')],
      'pressing-pickup': [L('Retraits & rack', 'Pick-up & rack', 'الاستلام والتعليق'),
        L('Les commandes prêtes, leur cintre et leur solde', 'Ready orders, their hanger and their balance', 'الطلبات الجاهزة وشماعتها ورصيدها')],
      'pressing-services': [L('Services & tarifs', 'Services & pricing', 'الخدمات والأسعار'),
        L('Les articles, traitements et prix du comptoir', 'The counter’s items, treatments and prices', 'القطع والمعالجات وأسعار الصندوق')],
      'pressing-quality': [L('Qualité & vigilances', 'Quality & care notes', 'الجودة والملاحظات'),
        L('Taches et instructions saisies au comptoir', 'Stains and instructions entered at the counter', 'البقع والتعليمات المسجلة عند الإيداع')],
      'pressing-delivery': [L('Collecte & livraison', 'Collection & delivery', 'الجمع والتوصيل'),
        L('Pas encore de tournées : les retraits se font au comptoir', 'No delivery rounds yet: pick-ups happen at the counter', 'لا جولات توصيل بعد: الاستلام يتم في الصندوق')]
    };
    return m[nav];
  }
  var PAGE_IDS = ['pressing-orders', 'pressing-workshop', 'pressing-pickup', 'pressing-services', 'pressing-quality', 'pressing-delivery'];

  var MATERIAL_ICONS = { shirt:'shirt', play:'play', scan:'scan-line', clock:'clock', rack:'inventory-2', alert:'alert-triangle', money:'banknote', workflow:'account-tree', bell:'bell', van:'truck', droplet:'droplets', check:'check', tag:'tag', message:'message-circle', list:'list', settings:'settings' };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]; }); }
  function num(n) { return (window.KiwiNumber?.format(Math.round(Number(n) || 0), {}) ?? Math.round(Number(n) || 0).toLocaleString(document.documentElement?.lang === 'en' ? 'en-GB' : 'fr-FR', {})); }
  /* Un montant : « 14,50 MAD » dès qu'il a des centimes, « 226 MAD » sinon.
     Arrondir à l'entier un solde de 14,50 faisait lire 15 au patron. */
  function mad(n) {
    n = Number(n) || 0;
    var whole = Math.abs(n - Math.round(n)) < 0.005;
    try { if (window.KiwiNumber && KiwiNumber.number) return KiwiNumber.number(n, whole ? 0 : 2) + ' MAD'; } catch (_) {}
    return (whole ? String(Math.round(n)) : n.toFixed(2).replace('.', ',')) + ' MAD';
  }
  /* L'heure du commerce, pas celle de l'appareil : un patron qui regarde son
     tableau de bord depuis un téléphone resté à l'heure d'un autre pays voyait
     « 18:00 » au lieu de l'heure promise au client. Même fuseau que la journée
     commerciale (KiwiDayReport). */
  function venueZone() {
    try { if (window.KiwiDayReport && KiwiDayReport.timezone) return KiwiDayReport.timezone(); } catch (_) {}
    return 'Africa/Casablanca';
  }
  function when(s) {
    var none = L('Échéance non définie', 'No due date', 'لا موعد محدد');
    if (!s) return none;
    var d = new Date(s); if (!Number.isFinite(d.getTime())) return none;
    var l = lang();
    var loc = l === 'en' ? 'en-GB' : l === 'ar' ? 'ar-MA-u-nu-latn' : 'fr-FR';
    try {
      var zone = venueZone();
      return d.toLocaleDateString(loc, { day: '2-digit', month: 'short', timeZone: (globalThis.KiwiZoneLaw?.effectiveZone(zone, d) || zone) }) + ' · ' +
        d.toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: (globalThis.KiwiZoneLaw?.effectiveZone(zone, d) || zone) });
    } catch (_) {
      return d.toLocaleDateString(loc, { day: '2-digit', month: 'short' }) + ' · ' + d.toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit' });
    }
  }
  function venue() { try { return window.KiwiVenue && KiwiVenue.getCurrentVenueData(); } catch (_) { return null; } }
  function isPressing() {
    var v = venue();
    return !!(v && (v.subtype === 'pressing' || v.trade === 'pressing'));
  }
  function summary() {
    try { return window.KiwiPressingOps ? KiwiPressingOps.summary() : { orders:[], active:0,received:0,treating:0,ready:0,late:0,due:0,pieces:0,attention:0,racks:0,unnotified:0 }; }
    catch (_) { return { orders:[], active:0,received:0,treating:0,ready:0,late:0,due:0,pieces:0,attention:0,racks:0,unnotified:0 }; }
  }
  /* L'encaissé du jour, sur la journée COMMERCIALE (fuseau du commerce, coupure
     à 5 h) : la même fenêtre que la tuile « Aujourd'hui » de l'Accueil. Minuit
     de l'appareil faisait diverger les deux chiffres, et ce pressing-ci
     compte les vêtements déposés tard le soir avec ceux du lendemain matin. */
  function todayRevenue() {
    try {
      var id = KiwiVenue.getVenue();
      var b = window.KiwiDateRange && KiwiDateRange.bounds ? KiwiDateRange.bounds('aujourdhui') : null;
      var start, end;
      if (b && b.length) { start = b[0]; end = b[1]; }
      else { var d = new Date(); d.setHours(0,0,0,0); start = d.getTime(); end = start + 86400000; }
      if (!Number.isFinite(end)) end = Date.now() + 1;
      return KiwiSales.totals(id, start, end).revenue || 0;
    } catch (_) { return 0; }
  }
  /* The ops snapshot freezes `status` when the till syncs. An order that crosses
     its readyAt while the till is idle still reads 'trait' there, even though
     summary() — which recomputes — already counts it ready. Deriving here keeps
     the lists and the counters above them answering the same question. */
  function effStatus(o) {
    try {
      if (window.KiwiPressingOps && KiwiPressingOps.orderStatus) {
        return KiwiPressingOps.orderStatus(o.pieces, o.readyAt);
      }
    } catch (_) {}
    return o.status;
  }
  /* Une commande annulée n'est ni active ni remise : elle ne doit plus figurer
     dans les files, où elle gardait son état d'avant et son bouton « Annuler ». */
  function isCancelled(o) { return !!(o && o.cancelledAt); }
  function statusLabel(o) {
    var st = effStatus(o);
    if (st === 'pret') return [L('Prêt', 'Ready', 'جاهز'), 'ready'];
    if (st === 'trait') return [L('En traitement', 'In progress', 'قيد المعالجة'), ''];
    if (st === 'livre') return [L('Remis', 'Handed over', 'تم التسليم'), 'muted'];
    var late = o.readyAt && new Date(o.readyAt).getTime() < Date.now();
    return late ? [L('En attente de retrait', 'Awaiting pick-up', 'بانتظار الاستلام'), 'ready'] : [L('Reçu', 'Received', 'مستلم'), ''];
  }
  function sortedActive(s) {
    return s.orders.filter(function (o) { return !isCancelled(o); }).filter(function (o) { return effStatus(o) !== 'livre'; }).sort(function (a,b) {
      var al = a.readyAt && new Date(a.readyAt).getTime() < Date.now();
      var bl = b.readyAt && new Date(b.readyAt).getTime() < Date.now();
      if (al !== bl) return al ? -1 : 1;
      return new Date(a.readyAt || 0) - new Date(b.readyAt || 0);
    });
  }

  function garmentPreview(pieces) {
    pieces = pieces || [];
    var shared = window.KiwiPressingGarmentIcons;
    if (!shared || !shared.render || !pieces.length) return '<span class="pxd-garments is-empty" aria-hidden="true"></span>';
    var labels = pieces.map(function (p) { return p.label || p.itemId || L('Article', 'Item', 'قطعة'); });
    var icons = pieces.slice(0,3).map(function (p) {
      return '<span class="pxd-garment">' + shared.render({ id:p.itemId, art:p.art, label:p.label, cat:p.cat, variantId:p.variantId }, 'pxd-garment-art') + '</span>';
    }).join('');
    if (pieces.length > 3) icons += '<b class="pxd-garment-more">+' + (pieces.length-3) + '</b>';
    return '<span class="pxd-garments" aria-label="' + esc(L('Articles : ', 'Items: ', 'القطع: ') + labels.join(', ')) + '">' + icons + '</span>';
  }

  function orderRows(rows, limit, emptyTitle, emptyBody) {
    rows = rows.slice(0, limit || rows.length);
    if (!rows.length) return empty('list', emptyTitle || L('Aucune commande à afficher', 'No orders to show', 'لا طلبات للعرض'),
      emptyBody || L('Les nouveaux dépôts apparaîtront ici dès qu’ils seront enregistrés sur la caisse.', 'New drop-offs will appear here as soon as they are saved on the till.', 'ستظهر الإيداعات الجديدة هنا فور تسجيلها في الصندوق.'),
      emptyTitle ? '' : L('Nouveau dépôt', 'New drop-off', 'إيداع جديد'), 'comptoir');
    return '<div class="pxd-order-list">' + rows.map(function (o) {
      var st = statusLabel(o);
      var canCancel = effStatus(o) !== 'livre';
      var n = (o.pieces || []).length;
      return '<div class="pxd-order" data-pxd-order="' + esc(o.id) + '">' +
        '<div><span class="pxd-order-id">' + esc(o.id) + '</span><span class="pxd-order-time">' + esc(when(o.readyAt)) + '</span></div>' +
        garmentPreview(o.pieces) +
        '<div class="pxd-order-main"><b>' + esc((o.customer && o.customer.name) || L('Client de passage', 'Walk-in customer', 'زبون عابر')) + '</b><span>' + num(n) + ' ' + pieces(n) + (o.rack ? ' · ' + L('cintre ', 'hanger ', 'شماعة ') + esc(o.rack) : '') + (o.due ? ' · ' + L('solde ', 'balance ', 'الرصيد ') + mad(o.due) : '') + '</span></div>' +
        '<div class="pxd-order-right"><span class="pxd-status ' + st[1] + '">' + st[0] + '</span>' +
        (canCancel ? '<button class="pxd-cancel-btn" type="button" data-pxd-cancel="' + esc(o.id) + '" title="' + esc(L('Annuler la commande', 'Cancel the order', 'إلغاء الطلب')) + '">' + L('Annuler', 'Cancel', 'إلغاء') + '</button>' : '') +
        '</div></div>';
    }).join('') + '</div>';
  }
  /* Les annulations restent consultables, avec qui les a faites : une commande
     qui disparaît sans trace est un litige qu'on ne peut plus trancher. */
  function cancelledRows(rows) {
    return '<div class="pxd-order-list">' + rows.slice(0, 20).map(function (o) {
      var who = o.cancelledBy && (o.cancelledBy.name || o.cancelledBy.role);
      /* Une annulation sans auteur n'a jamais été enregistrée par le serveur : c'est
         celle de l'ancien bouton, qui n'écrivait que dans ce navigateur. La caisse
         voit toujours cette commande vivante. On le dit, et on propose de la refaire
         pour de bon, plutôt que de l'annuler ou de la ressusciter à l'insu du patron. */
      var local = !who && !(o.cancelledBy && o.cancelledBy.id);
      var n = (o.pieces || []).length;
      return '<div class="pxd-order" data-pxd-order="' + esc(o.id) + '">' +
        '<div><span class="pxd-order-id">' + esc(o.id) + '</span><span class="pxd-order-time">' + esc(when(o.cancelledAt)) + '</span></div>' +
        garmentPreview(o.pieces) +
        '<div class="pxd-order-main"><b>' + esc((o.customer && o.customer.name) || L('Client de passage', 'Walk-in customer', 'زبون عابر')) + '</b><span>' + num(n) + ' ' + pieces(n) + (who ? ' · ' + L('annulée par ', 'cancelled by ', 'ألغاها ') + esc(who) : '') + (local ? ' · ' + L('annulation non enregistrée : la caisse la voit encore active', 'cancellation not saved: the till still sees it as active', 'الإلغاء غير مسجل: الصندوق لا يزال يراه نشطًا') : '') + (o.paid > 0 ? ' · ' + mad(o.paid) + ' ' + L('encaissés', 'collected', 'محصّل') : '') + '</span></div>' +
        '<div class="pxd-order-right"><span class="pxd-status late">' + (local ? L('À confirmer', 'To confirm', 'للتأكيد') : L('Annulée', 'Cancelled', 'ملغاة')) + '</span>' +
        (local ? '<button class="pxd-cancel-btn" type="button" data-pxd-cancel="' + esc(o.id) + '">' + L('Réessayer', 'Retry', 'إعادة المحاولة') + '</button>' : '') + '</div></div>';
    }).join('') + '</div>';
  }
  function empty(ic, title, body, cta, view) {
    return '<div class="pxd-empty"><div><span class="pxd-empty-icon">' + icon(ic) + '</span><b>' + esc(title) + '</b><p>' + esc(body) + '</p>' +
      (cta ? '<button class="pxd-btn" type="button" data-pxd-open="' + esc(view || 'comptoir') + '">' + esc(cta) + '</button>' : '') + '</div></div>';
  }
  function icon(name) {
    var icons = {
      shirt: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z"/></svg>',
      workflow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect width="8" height="8" x="3" y="3" rx="2"/><path d="M7 11v4a2 2 0 0 0 2 2h4"/><rect width="8" height="8" x="13" y="13" rx="2"/></svg>',
      rack: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m15 12-8.5 8.5c-.83.83-2.17.83-3 0 0 0 0 0 0 0a2.12 2.12 0 0 1 0-3L12 9"/><path d="M17.64 15 22 10.64"/><path d="m20.91 3.26-2.17-2.17a2.12 2.12 0 0 0-3 0L12 4.82l6.91 6.91 3.73-3.73a2.12 2.12 0 0 0 0-3z"/></svg>',
      alert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
      money: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect width="20" height="12" x="2" y="6" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/></svg>',
      play: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/></svg>',
      scan: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/></svg>',
      bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>',
      check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polyline points="20 6 9 17 4 12"/></svg>',
      list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>',
      clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
      van: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect width="14" height="10" x="1" y="6" rx="2"/><polygon points="15 8 19 8 23 12 23 16 15 16 15 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>'
    };
    return icons[name] || '';
  }
  /* Les classes de l'en-tête de carte étaient `pxd-card-ic` et `pxd-link-btn`,
     que la feuille de style ne connaît pas (elle définit `pxd-card-mark`,
     `pxd-card-title` et `pxd-link`) : l'icône n'avait aucune taille et
     s'affichait en grand, en noir, au-dessus du titre de chaque carte. */
  function cardHead(ic,title,sub,cta,view) {
    return '<div class="pxd-card-head"><div class="pxd-card-title"><span class="pxd-card-mark">' + icon(ic) + '</span><div><h3>' + esc(title) + '</h3><p>' + esc(sub) + '</p></div></div>' +
      (cta ? '<button class="pxd-link" type="button" data-pxd-page="' + esc(view) + '">' + esc(cta) + ' →</button>' : '') + '</div>';
  }
  function flow(s) {
    var stages = [
      [L('Reçues', 'Received', 'مستلمة'), s.received, L('À trier et contrôler', 'To sort and check', 'للفرز والمراجعة')],
      [L('En traitement', 'In progress', 'قيد المعالجة'), s.treating, L('Au moins une pièce en cours', 'At least one garment in progress', 'قطعة واحدة على الأقل قيد المعالجة')],
      [L('Prêtes', 'Ready', 'جاهزة'), s.ready, L('À ranger ou remettre', 'To rack or hand over', 'للتعليق أو التسليم')],
      [L('Remises', 'Handed over', 'مسلّمة'), s.delivered, L('Déjà rendues au client', 'Already returned to the customer', 'أُعيدت للزبون')]
    ];
    var mx = Math.max.apply(Math, stages.map(function (x) { return x[1]; }).concat([1]));
    return '<div class="pxd-flow">' + stages.map(function (x) {
      return '<div class="pxd-stage"><div class="pxd-stage-num">' + num(x[1]) + '</div><div class="pxd-stage-name">' + x[0] + '</div><div class="pxd-stage-sub">' + x[2] + '</div><div class="pxd-stage-bar"><i style="width:' + Math.max(3, Math.round(x[1] / mx * 100)) + '%"></i></div></div>';
    }).join('') + '</div>';
  }
  function rackBody(s) {
    var ready = s.orders.filter(function (o) { return !isCancelled(o); }).filter(function (o) { return effStatus(o) === 'pret'; }).sort(function (a,b) { return new Date(a.readyAt || 0) - new Date(b.readyAt || 0); });
    if (!ready.length) return empty('rack', L('Rien de prêt pour le moment', 'Nothing ready yet', 'لا شيء جاهز حاليًا'), L('Les commandes prêtes et leur emplacement apparaîtront ici.', 'Ready orders and their location will appear here.', 'ستظهر هنا الطلبات الجاهزة ومكانها.'), L('Ouvrir le rangement', 'Open the rack', 'فتح التعليق'), 'rangement');
    return '<div class="pxd-rack">' + ready.slice(0,5).map(function (o) {
      return '<div class="pxd-rack-row"><div><b>' + esc(o.customer && o.customer.name || o.id) + '</b><span>' + esc(o.id) + (o.notified ? ' · ' + L('client prévenu', 'customer notified', 'تم إبلاغ الزبون') : ' · ' + L('à prévenir', 'to notify', 'للإبلاغ')) + '</span></div><span class="pxd-rack-slot">' + esc(o.rack || L('À ranger', 'To rack', 'للتعليق')) + '</span></div>';
    }).join('') + '</div>' + (s.unnotified ? '<div class="pxd-callout"><b>' + num(s.unnotified) + ' ' + plural(s.unnotified, ['client à prévenir', 'clients à prévenir'], ['customer to notify', 'customers to notify'], ['زبون للإبلاغ', 'زبائن للإبلاغ', 'زبونان للإبلاغ']) + '</b><span>' + L('Depuis la fiche de la commande sur la caisse, ouvrez WhatsApp pour envoyer le message « c’est prêt ». Kiwi ne l’envoie pas tout seul.', 'From the order sheet on the till, open WhatsApp to send the “it’s ready” message. Kiwi does not send it by itself.', 'من بطاقة الطلب في الصندوق افتح واتساب لإرسال رسالة «جاهز». لا يرسلها Kiwi تلقائيًا.') + '</span></div>' : '');
  }

  function kpisBand(s) {
    return '<section class="pxd-kpis" aria-label="' + esc(L('État de l’atelier', 'Workshop status', 'حالة الورشة')) + '">' +
      kpi('shirt', L('Pièces dans l’atelier', 'Garments in the workshop', 'القطع في الورشة'), s.pieces, L('Toutes les pièces non remises', 'Every garment not yet handed over', 'كل القطع التي لم تُسلَّم'), '') +
      kpi('workflow', L('Commandes en traitement', 'Orders in progress', 'طلبات قيد المعالجة'), s.treating, L('Au moins une pièce en cours', 'At least one garment in progress', 'قطعة واحدة على الأقل قيد المعالجة'), '') +
      kpi('rack', L('Prêtes au retrait', 'Ready for pick-up', 'جاهزة للاستلام'), s.ready, num(s.racks) + ' ' + plural(s.racks, ['cintre occupé', 'cintres occupés'], ['hanger in use', 'hangers in use'], ['شماعة مستعملة', 'شماعات مستعملة', 'شماعتان مستعملتان']), '') +
      kpi('alert', L('En attente de retrait', 'Awaiting pick-up', 'بانتظار الاستلام'), s.late, L('Promesse dépassée, non remise', 'Promise date passed, not handed over', 'تجاوزت الموعد ولم تُسلَّم'), s.late ? 'alert' : '') +
      kpi('money', L('Solde à encaisser', 'Balance to collect', 'الرصيد المطلوب تحصيله'), mad(s.due), L('Encaissé aujourd’hui · ', 'Collected today · ', 'المحصّل اليوم · ') + mad(todayRevenue()), '') +
    '</section>';
  }

  function renderHome() {
    if (!host || !current) return;
    var s = summary();
    var v = venue() || {};
    var active = sortedActive(s);
    host.innerHTML = '<div class="pxd-shell">' +
      '<header class="pxd-hero"><div><div class="pxd-eyebrow">' + L('Pilotage pressing', 'Dry-cleaning control', 'إدارة المصبنة') + '</div><h1>' + L('Votre atelier, sans angle mort.', 'Your workshop, no blind spots.', 'ورشتك بلا نقاط عمياء.') + '</h1><p>' + esc(v.fullDisplay || v.name || L('Pressing', 'Dry cleaner', 'المصبنة')) + ' · ' + L('du dépôt à la remise, pièce par pièce', 'from drop-off to hand-over, garment by garment', 'من الإيداع إلى التسليم، قطعة بقطعة') + '</p></div>' +
      '<div class="pxd-hero-actions"><button class="pxd-btn" type="button" data-pxd-open="retrait">' + icon('scan') + L('Retrait express', 'Quick pick-up', 'استلام سريع') + '</button><button class="pxd-btn primary" type="button" data-pxd-open="comptoir">' + icon('play') + L('Nouveau dépôt', 'New drop-off', 'إيداع جديد') + '</button></div></header>' +
      kpisBand(s) +
      '<div class="pxd-grid"><div class="pxd-stack">' +
        '<section class="pxd-card">' + cardHead('workflow', L('Flux atelier', 'Workshop flow', 'سير الورشة'), L('La charge réelle à chaque étape', 'The real load at each stage', 'الحمل الفعلي في كل مرحلة'), L('Ouvrir l’atelier', 'Open the workshop', 'فتح الورشة'), 'pressing-workshop') + flow(s) + '</section>' +
        '<section class="pxd-card">' + cardHead('clock', L('Priorités du jour', 'Today’s priorities', 'أولويات اليوم'), L('Échéances les plus proches et retraits en attente', 'Nearest due dates and pick-ups waiting', 'أقرب المواعيد والاستلامات المنتظرة'), L('Toutes les commandes', 'All orders', 'كل الطلبات'), 'pressing-orders') + orderRows(active,6) + '</section>' +
      '</div><aside class="pxd-stack side">' +
        '<section class="pxd-card">' + cardHead('play', L('Actions rapides', 'Quick actions', 'إجراءات سريعة'), L('Les gestes de comptoir les plus fréquents', 'The most frequent counter gestures', 'أكثر حركات الصندوق تكرارًا'), '', '') +
          '<div class="pxd-action-grid">' + action('shirt', L('Nouveau dépôt', 'New drop-off', 'إيداع جديد'), L('Créer le bon et étiqueter', 'Create the ticket and label', 'إنشاء الطلب وطباعة الملصقات'), 'comptoir') + action('scan', L('Retrait express', 'Quick pick-up', 'استلام سريع'), L('Téléphone ou scan du ticket', 'Phone number or ticket scan', 'الهاتف أو مسح التذكرة'), 'retrait') + action('rack', L('Ranger au rack', 'Put on the rack', 'التعليق'), L('Attribuer un cintre', 'Assign a hanger', 'تخصيص شماعة'), 'rangement') + action('bell', L('Clients à prévenir', 'Customers to notify', 'زبائن للإبلاغ'), s.unnotified ? num(s.unnotified) + ' ' + plural(s.unnotified, ['message en attente', 'messages en attente'], ['message waiting', 'messages waiting'], ['رسالة بانتظار الإرسال', 'رسائل بانتظار الإرسال', 'رسالتان بانتظار الإرسال']) : L('Tout est à jour', 'All up to date', 'كل شيء محدّث'), 'retrait') + '</div></section>' +
        '<section class="pxd-card">' + cardHead('rack', L('Retraits & rack', 'Pick-up & rack', 'الاستلام والتعليق'), L('Commandes prêtes, emplacement et notification', 'Ready orders, location and notification', 'الطلبات الجاهزة ومكانها والإبلاغ'), L('Gérer', 'Manage', 'إدارة'), 'pressing-pickup') + rackBody(s) + '</section>' +
        '<section class="pxd-card">' + cardHead('alert', L('Qualité & vigilance', 'Quality & care', 'الجودة والانتباه'), L('Textiles délicats et instructions du comptoir', 'Delicate textiles and counter instructions', 'الأقمشة الحساسة وتعليمات الصندوق'), L('Contrôler', 'Review', 'مراجعة'), 'pressing-quality') +
          (s.attention ? '<div class="pxd-callout" style="margin-top:18px"><b>' + num(s.attention) + ' ' + plural(s.attention, ['pièce documentée', 'pièces documentées'], ['documented garment', 'documented garments'], ['قطعة موثّقة', 'قطع موثّقة', 'قطعتان موثّقتان']) + '</b><span>' + L('Les réserves restent liées au vêtement pour sécuriser la remise.', 'Notes stay attached to the garment to secure the hand-over.', 'تبقى الملاحظات مرتبطة بالقطعة لتأمين التسليم.') + '</span></div>' : empty('check', L('Aucune vigilance ouverte', 'No open care note', 'لا ملاحظات مفتوحة'), L('Les taches et instructions saisies au comptoir apparaîtront ici.', 'Stains and instructions entered at the counter will appear here.', 'ستظهر هنا البقع والتعليمات المسجلة في الصندوق.'), '', '')) + '</section>' +
      '</aside></div></div>';
  }
  function kpi(ic,label,value,sub,cls) {
    return '<article class="pxd-kpi ' + cls + '"><div class="pxd-kpi-top"><span>' + esc(label) + '</span><span class="pxd-kpi-icon">' + icon(ic) + '</span></div><strong>' + esc(value) + '</strong><small>' + esc(sub) + '</small></article>';
  }
  function action(ic,title,sub,view) {
    return '<button class="pxd-action" type="button" data-pxd-open="' + esc(view) + '">' + icon(ic) + '<b>' + esc(title) + '</b><span>' + esc(sub) + '</span></button>';
  }

  function pageBody(nav) {
    var s = summary();
    var active = sortedActive(s);
    var band = kpisBand(s);
    var content = '';
    var cancelled = s.orders.filter(isCancelled);
    if (nav === 'pressing-orders') content = '<div class="pxd-page-grid"><section class="pxd-card">' + cardHead('list', L('Commandes actives', 'Active orders', 'الطلبات النشطة'), L('Triées par urgence et date de retrait', 'Sorted by urgency and pick-up date', 'مرتبة حسب الاستعجال وتاريخ الاستلام'), '', '') + orderRows(active) + '</section><section class="pxd-card">' + cardHead('check', L('Commandes remises', 'Handed-over orders', 'الطلبات المسلّمة'), L('Historique conservé pour le suivi client', 'History kept for customer follow-up', 'السجل محفوظ لمتابعة الزبائن'), '', '') + orderRows(s.orders.filter(function(o){return !isCancelled(o);}).filter(function(o){return effStatus(o)==='livre';}),20, L('Aucune commande remise pour l’instant', 'No order handed over yet', 'لا طلبات مسلّمة بعد'), L('Les commandes remises au client apparaîtront ici.', 'Orders handed over to the customer will appear here.', 'ستظهر هنا الطلبات المسلّمة للزبون.')) + '</section>' +
      (cancelled.length ? '<section class="pxd-card">' + cardHead('alert', L('Commandes annulées', 'Cancelled orders', 'الطلبات الملغاة'), L('Avec la personne qui les a annulées', 'With the person who cancelled them', 'مع من ألغاها'), '', '') + cancelledRows(cancelled) + '</section>' : '') + '</div>';
    else if (nav === 'pressing-workshop') content = '<div class="pxd-page-grid"><section class="pxd-card">' + cardHead('workflow', L('Vue atelier', 'Workshop view', 'نظرة على الورشة'), L('Une commande avance selon l’état de ses pièces', 'An order moves with the state of its garments', 'يتقدم الطلب بحسب حالة قطعه'), '', '') + flow(s) + '</section><section class="pxd-card">' + cardHead('clock', L('File de production', 'Production queue', 'قائمة الإنتاج'), L('Promesses échues en premier, puis échéances les plus proches', 'Passed promises first, then nearest due dates', 'المواعيد المتجاوزة أولًا ثم الأقرب'), '', '') + orderRows(active) + '</section></div>';
    else if (nav === 'pressing-pickup') content = '<div class="pxd-page-grid two"><section class="pxd-card">' + cardHead('rack', L('Prêtes au retrait', 'Ready for pick-up', 'جاهزة للاستلام'), L('Cintre, notification et solde sur le même écran', 'Hanger, notification and balance on one screen', 'الشماعة والإبلاغ والرصيد في شاشة واحدة'), '', '') + rackBody(s) + '</section><section class="pxd-page-card"><h3>' + L('Retrait en trois gestes', 'Pick-up in three steps', 'الاستلام في ثلاث خطوات') + '</h3><p>' + L('À la caisse : recherchez le téléphone, encaissez le solde, remettez les pièces.', 'On the till: search the phone number, collect the balance, hand over the garments.', 'في الصندوق: ابحث بالهاتف، حصّل الرصيد، سلّم القطع.') + '</p><div class="pxd-checks"><div class="pxd-check"><span>' + L('1 · Identifier le client', '1 · Find the customer', '1 · تحديد الزبون') + '</span><small>' + L('Téléphone ou scan', 'Phone or scan', 'الهاتف أو المسح') + '</small></div><div class="pxd-check"><span>' + L('2 · Vérifier les pièces', '2 · Check the garments', '2 · التحقق من القطع') + '</span><small>' + L('Bon détaillé', 'Detailed ticket', 'الطلب المفصّل') + '</small></div><div class="pxd-check"><span>' + L('3 · Libérer le cintre', '3 · Free the hanger', '3 · تحرير الشماعة') + '</span><small>' + L('Après la remise', 'After hand-over', 'بعد التسليم') + '</small></div></div><button class="pxd-btn primary" style="margin-top:14px" data-pxd-open="retrait">' + L('Ouvrir le retrait express', 'Open quick pick-up', 'فتح الاستلام السريع') + '</button></section></div>';
    else if (nav === 'pressing-services') {
      /* Les compteurs suivent les services de la caisse : un compteur à zéro
         s'écrit « 0 pièce » (singulier), jamais « 0 pièces actives ». */
      var serviceLabels = { lavage: L('Lavage', 'Washing', 'الغسيل'), repassage: L('Repassage', 'Ironing', 'الكي'), detachage: L('Détachage', 'Stain removal', 'إزالة البقع'), retouche: L('Retouche', 'Alterations', 'التعديل') };
      var serviceRows = Object.keys(serviceLabels).map(function (id) {
        var count = Number((s.services || {})[id] || 0);
        return '<div class="pxd-check"><span>' + serviceLabels[id] + '</span><small>' + num(count) + ' ' + pieces(count) + ' ' + plural(count, ['active', 'actives'], ['in progress', 'in progress'], ['نشطة', 'نشطة', 'نشطتان']) + '</small></div>';
      }).join('');
      content = '<div class="pxd-page-grid"><div data-pce-host></div><div class="pxd-page-grid two"><section class="pxd-page-card"><h3>' + L('Charge par traitement', 'Load by treatment', 'الحمل حسب المعالجة') + '</h3><p>' + L('Pièces des commandes encore présentes dans l’atelier.', 'Garments of the orders still in the workshop.', 'قطع الطلبات التي لا تزال في الورشة.') + '</p><div class="pxd-checks">' + serviceRows + '</div></section><section class="pxd-page-card"><h3>' + L('Application des tarifs', 'How prices apply', 'تطبيق الأسعار') + '</h3><p>' + L('Une modification s’applique aux prochains dépôts. Les anciens tickets gardent le nom et le prix convenus avec le client.', 'A change applies to the next drop-offs. Past tickets keep the name and price agreed with the customer.', 'يسري التعديل على الإيداعات القادمة. تحتفظ التذاكر السابقة بالاسم والسعر المتفق عليهما مع الزبون.') + '</p><div class="pxd-checks"><div class="pxd-check"><span>' + L('Caisse appairée', 'Paired till', 'صندوق مقترن') + '</span><small>' + L('Synchronisée par établissement', 'Synced per business', 'متزامن لكل منشأة') + '</small></div><div class="pxd-check"><span>' + L('Article masqué', 'Hidden item', 'قطعة مخفية') + '</span><small>' + L('Conservé dans l’historique', 'Kept in the history', 'محفوظ في السجل') + '</small></div><div class="pxd-check"><span>' + L('Prix vide', 'Empty price', 'سعر فارغ') + '</span><small>' + L('Service non proposé', 'Service not offered', 'الخدمة غير متوفرة') + '</small></div></div><button class="pxd-btn primary" style="margin-top:14px" data-pxd-open="tarifs">' + L('Ouvrir la caisse', 'Open the till', 'فتح الصندوق') + '</button></section></div></div>';
    }
    else if (nav === 'pressing-quality') {
      var attention = active.filter(function (o) { return (o.pieces || []).some(function (p) { return p.notes; }); });
      content = '<div class="pxd-page-grid"><section class="pxd-card">' + cardHead('alert', L('Vigilances actives', 'Active care notes', 'الملاحظات النشطة'), L('Taches et instructions particulières', 'Stains and special instructions', 'البقع والتعليمات الخاصة'), '', '') + (attention.length ? orderRows(attention) + '<div class="pxd-page-action"><button class="pxd-btn primary" data-pxd-open="commandes">' + L('Ouvrir la file de travail', 'Open the work queue', 'فتح قائمة العمل') + '</button></div>' : empty('check', L('Aucune vigilance ouverte', 'No open care note', 'لا ملاحظات مفتوحة'), L('Une tache ou une instruction saisie au comptoir apparaîtra ici.', 'A stain or instruction entered at the counter will appear here.', 'ستظهر هنا أي بقعة أو تعليمة تُسجَّل في الصندوق.'), L('Nouveau dépôt', 'New drop-off', 'إيداع جديد'), 'comptoir')) + '</section><section class="pxd-page-card"><h3>' + L('Avant la remise', 'Before hand-over', 'قبل التسليم') + '</h3><p>' + L('Kiwi ne contrôle pas la qualité à votre place : une commande est « prête » quand vous la marquez prête, ou quand l’heure promise au client est atteinte.', 'Kiwi does not check quality for you: an order is “ready” when you mark it ready, or when the time promised to the customer is reached.', 'لا يراقب Kiwi الجودة نيابةً عنك: يصبح الطلب «جاهزًا» عندما تحدده جاهزًا أو عند بلوغ الوقت الموعود للزبون.') + '</p><div class="pxd-checks"><div class="pxd-check"><span>' + L('Commandes prêtes', 'Ready orders', 'طلبات جاهزة') + '</span><small>' + num(s.ready) + '</small></div><div class="pxd-check"><span>' + L('Pièces documentées', 'Documented garments', 'قطع موثّقة') + '</span><small>' + num(s.attention) + '</small></div><div class="pxd-check"><span>' + L('Clients encore à prévenir', 'Customers still to notify', 'زبائن لم يُبلَّغوا بعد') + '</span><small>' + num(s.unnotified) + '</small></div></div></section></div>';
    }
    else {
      content = '<div class="pxd-page-grid two"><section class="pxd-page-card"><h3>' + L('Collecte & livraison', 'Collection & delivery', 'الجمع والتوصيل') + '</h3><p>' + L('Kiwi n’organise pas encore de tournées : les dépôts et les retraits se font au comptoir.', 'Kiwi does not organise delivery rounds yet: drop-offs and pick-ups happen at the counter.', 'لا ينظم Kiwi جولات توصيل بعد: الإيداع والاستلام يتمان في الصندوق.') + '</p>' + empty('van', L('Aucune tournée', 'No delivery round', 'لا جولات'), L('Dès qu’un module de tournée existera, il apparaîtra ici.', 'As soon as a round module exists, it will appear here.', 'ستظهر هنا أي وحدة جولات فور توفرها.'), L('Créer un dépôt au comptoir', 'Create a counter drop-off', 'إنشاء إيداع في الصندوق'), 'comptoir') + '</section><section class="pxd-page-card"><h3>' + L('Commandes prêtes', 'Ready orders', 'الطلبات الجاهزة') + '</h3><p>' + L('Utilisez le cintre et la notification client pour organiser les retraits.', 'Use the hanger and the customer notification to organise pick-ups.', 'استخدم الشماعة وإبلاغ الزبون لتنظيم الاستلام.') + '</p>' + rackBody(s) + '</section></div>';
    }
    return band + content;
  }

  function showPage(nav) {
    if (!current || PAGE_IDS.indexOf(nav) < 0 || !window.Kiwi || !Kiwi.appPage) return;
    var meta = pageMeta(nav);
    currentPage = nav;
    Kiwi.appPage(nav, { title: meta[0], subtitle: meta[1], body: pageBody(nav) });
    if (nav === 'pressing-services') requestAnimationFrame(function () {
      var editor = document.querySelector('[data-pce-host]');
      if (editor && window.KiwiPressingCatalog) KiwiPressingCatalog.mountEditor(editor);
    });
  }
  /* Une relecture périodique ne doit pas reconstruire l'éditeur de tarifs sous
     les doigts du commerçant : sur « Services & tarifs », seuls les volumes par
     traitement dépendent des commandes, on ne repeint que ces cartes-là. */
  function refreshCurrent() {
    if (!currentPage) return;
    if (currentPage === 'pressing-services') {
      if (document.querySelector('[data-pce-host] input:focus, [data-pce-host] select:focus')) return;
      var band = document.querySelector('.pxd-kpis');
      if (band) band.outerHTML = kpisBand(summary());
      return;
    }
    showPage(currentPage);
  }
  function openTill(view) {
    try { sessionStorage.setItem('kiwiPressingStartView', view || 'comptoir'); } catch (_) {}
    window.location.href = 'kiwi-caisse.html';
  }
  function ensureHost() {
    if (host && host.isConnected) return host;
    var container = document.querySelector('.container');
    if (!container) return null;
    host = document.createElement('section');
    host.className = 'pressing-home';
    host.setAttribute('aria-label', 'Tableau de bord pressing');
    container.insertBefore(host, container.querySelector('.status-bar') || null);
    return host;
  }
  function activate() {
    current = isPressing();
    document.body.classList.remove('is-pressing');
    if (host) host.remove();
    host = null;
    try { if (current && window.KiwiPressingOps && KiwiPressingOps.bindCloud) KiwiPressingOps.bindCloud(); } catch (_) {}
    try { if (current && window.KiwiPressingCatalog && KiwiPressingCatalog.bind) KiwiPressingCatalog.bind(); } catch (_) {}
  }

  /* Annuler depuis le tableau de bord. L'ancien bouton écrivait une annulation
     dans ce navigateur seulement : le serveur refuse d'enregistrer une
     annulation qui ne vient pas de /api/pressing/cancel (c'est la preuve de qui
     a annulé), la copie restait « à envoyer » pour toujours, et la caisse
     continuait d'afficher la commande comme active. On passe maintenant par la
     même route que la caisse, avec la session du propriétaire à la place du
     code manager, puis on applique ici ce que le serveur a enregistré. */
  function cancelOnServer(id) {
    var merchant = '';
    try { merchant = KiwiPressingOps.scope(); } catch (_) {}
    if (!merchant) return Promise.resolve({ ok: false, error: 'no-merchant' });
    return fetch('/api/pressing/cancel', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ merchant: merchant, orderId: String(id) })
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) { return r.ok && j && j.ok ? j : { ok: false, error: (j && j.error) || ('http-' + r.status) }; });
    }).catch(function () { return { ok: false, error: 'network' }; });
  }
  function cancelMessage(error) {
    if (error === 'order-not-found') return L('Cette commande n’est pas encore arrivée sur le serveur : réessayez dans un instant.', 'This order has not reached the server yet: try again in a moment.', 'لم يصل هذا الطلب إلى الخادم بعد: أعد المحاولة بعد لحظة.');
    if (error === 'network') return L('Pas de connexion : l’annulation n’a pas été enregistrée.', 'No connection: the cancellation was not saved.', 'لا اتصال: لم يُسجَّل الإلغاء.');
    return L('L’annulation n’a pas pu être enregistrée.', 'The cancellation could not be saved.', 'تعذر تسجيل الإلغاء.');
  }

  /* The shared dashboard registers its delegated sidebar listener during the
   * venues boot, before this module. Listen at window capture level so a
   * pressing destination is claimed before that generic handler can turn it
   * into a boutique starter page. */
  window.addEventListener('click', function (e) {
    var open = e.target.closest && e.target.closest('[data-pxd-open]');
    if (open) { e.preventDefault(); openTill(open.dataset.pxdOpen); return; }
    var cancel = e.target.closest && e.target.closest('[data-pxd-cancel]');
    if (cancel) {
      e.preventDefault();
      var id = cancel.dataset.pxdCancel;
      var row = null;
      try { row = KiwiPressingOps.summary().orders.filter(function (o) { return o.id === id; })[0]; } catch (_) {}
      var paid = row ? Number(row.paid) || 0 : 0;
      var ask = L('Confirmer l’annulation de la commande ', 'Confirm cancelling order ', 'تأكيد إلغاء الطلب ') + id + ' ?' +
        (paid > 0 ? '\n\n' + mad(paid) + ' ' + L('ont déjà été encaissés sur cette commande. L’annulation ne rembourse rien : ces encaissements restent au journal des ventes.', 'were already collected on this order. Cancelling does not refund anything: those payments stay in the sales journal.', 'تم تحصيلها مسبقًا على هذا الطلب. الإلغاء لا يردّ أي مبلغ: تبقى هذه المدفوعات في سجل المبيعات.') : '');
      if (confirm(ask)) {
        cancel.disabled = true;
        cancelOnServer(id).then(function (res) {
          cancel.disabled = false;
          if (!res.ok) { if (typeof Kiwi !== 'undefined' && Kiwi.toast) Kiwi.toast(cancelMessage(res.error), { type: 'warn', force: true }); return; }
          if (window.KiwiPressingOps && KiwiPressingOps.cancelOrder) {
            KiwiPressingOps.cancelOrder(id, res.actor, res.cancelledAt);
            if (typeof Kiwi !== 'undefined' && Kiwi.toast) Kiwi.toast(L('Commande ', 'Order ', 'الطلب ') + id + L(' annulée', ' cancelled', ' ملغى'));
            if (currentPage) showPage(currentPage);
            else renderHome();
          }
        });
      }
      return;
    }
    var page = e.target.closest && e.target.closest('[data-pxd-page]');
    if (page) { e.preventDefault(); showPage(page.dataset.pxdPage); return; }
    var nav = e.target.closest && e.target.closest('.sidebar nav a[data-nav]');
    if (!nav || !current) return;
    if (PAGE_IDS.indexOf(nav.dataset.nav) >= 0) {
      e.preventDefault(); e.stopImmediatePropagation(); showPage(nav.dataset.nav); return;
    }
  }, true);

  function boot() {
    activate();
    try { if (window.KiwiPressingOps && KiwiPressingOps.bindCloud) KiwiPressingOps.bindCloud(); } catch (_) {}
    try { if (window.KiwiPressingOps) KiwiPressingOps.subscribe(function () { refreshCurrent(); }); } catch (_) {}
    try { if (window.KiwiPressingCatalog) KiwiPressingCatalog.subscribe(function () { if (currentPage === 'pressing-services') showPage(currentPage); }); } catch (_) {}
    try { KiwiVenue.subscribe(activate); } catch (_) {}
    window.addEventListener('kiwi:langchange', function () { activate(); if (currentPage && current) showPage(currentPage); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.KiwiPressingDashboard = { render: renderHome, showPage: showPage, isActive: function () { return current; } };
})();
