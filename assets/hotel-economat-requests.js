/* Kiwi Hotel · Économat · demandes des services.
 *
 * Le parcours complet d'une demande interne, de la demande du service à la
 * réception confirmée, sur /api/inventory/internal-requests :
 *   service    : crée et envoie la demande (create + submit)
 *   économat   : valide ligne par ligne, réduit, refuse ou substitue ; la
 *                validation réserve le stock côté serveur (review)
 *   service    : accepte les changements proposés (accept)
 *   économat   : prépare et remet au service (prepare, handover)
 *   service    : confirme la réception ; le serveur écrit le transfert de
 *                garde économat → service (confirm)
 * Chaque commande porte la révision lue et une clé d'idempotence déduite de
 * cette révision : un double appui ou une coupure réseau rejoue la même
 * commande au lieu d'en écrire deux.
 *
 * Monté par assets/hotel-economat.js dans [data-eco-requests-host]. */
(function () {
  'use strict';

  var Kiwi = window.Kiwi;
  var handlers = Kiwi && Kiwi.handlers;
  if (!handlers) return;

  var STR = {
    fr: {
      title:'Demandes des services', sub:'De la demande à la remise, avec la garde enregistrée à chaque étape', create:'Nouvelle demande', refresh:'Actualiser',
      empty:'Aucune demande en cours', emptyD:'Les services demandent ici le linge, les produits et les consommables à l’économat.', loading:'Chargement des demandes…', offline:'Demandes indisponibles pour le moment', retry:'Réessayer',
      noUnits:'Aucun service configuré', noUnitsD:'Déclarez les services de l’hôtel dans Points de vente pour qu’ils puissent demander à l’économat.',
      department:'Service', items:'Articles', note:'Note', notePh:'Étage, urgence, précision…', qty:'Quantité', unit:'Unité', send:'Envoyer à l’économat', cancel:'Fermer', noCatalogue:'Aucun article autorisé pour ce service.', noCatalogueD:'Le catalogue du service est vide : l’économat doit lui ouvrir des articles.', pickOne:'Indiquez au moins une quantité.', sent:'Demande envoyée à l’économat', draftSaved:'Demande enregistrée en brouillon, envoi à reprendre',
      stepRequest:'Demande', stepReview:'Validation', stepPrepare:'Préparation', stepHandover:'Remise', stepReceipt:'Réception',
      sideService:'Côté service', sideEconomat:'Côté économat',
      requested:'Demandé', approved:'Accordé', prepared:'Préparé', received:'Reçu', available:'En stock',
      resApproved:'Accorder', resReduced:'Réduire', resRefused:'Refuser', resSubstituted:'Substituer', substitute:'Article de remplacement', substituteUnit:'Unité', reason:'Motif', reasonPh:'Rupture, format indisponible…',
      review:'Valider et réserver le stock', reviewHint:'La validation réserve le stock à l’économat : une autre demande ne peut plus le prendre.', reviewed:'Demande validée, stock réservé', insufficient:'Stock insuffisant à l’économat : rien n’a été réservé. Réduisez ou substituez.', badSubstitute:'Choisissez l’article, l’unité et le motif de la substitution.', badReduce:'Une quantité réduite doit rester entre zéro et la quantité demandée.',
      accept:'Accepter les changements', acceptHint:'L’économat a modifié la demande. Le service accepte avant la préparation.', accepted:'Changements acceptés',
      method:'Remise', pickup:'Retrait à l’économat', delivery:'Livraison au service', handover:'Remettre au service', prepareHint:'Indiquez ce qui part réellement. La garde reste à l’économat jusqu’à la réception.', handedOver:'Remise enregistrée. Après une perte de connexion, rouvrez cette demande pour compter et confirmer la réception. En cas d’écart, avertissez le responsable.',
      confirm:'Confirmer la réception', confirmHint:'Comptez ce qui est arrivé. La confirmation transfère la garde au service.', confirmed:'Réception confirmée, garde transférée', badReceived:'Quantité reçue invalide.',
      dispute:'Signaler un écart', disputed:'Écart signalé', cancelReq:'Annuler la demande', cancelled:'Demande annulée', submit:'Envoyer à l’économat', submitted:'Demande envoyée',
      custody:'Garde', custodyEco:'À l’économat', custodyService:'Au service', trail:'Historique', stale:'La demande a changé entre-temps : elle est rechargée.', failed:'Action refusée', forbidden:'Votre rôle ne permet pas cette étape.', sideConfirm:'La réception est confirmée par l’économat dans cet hôtel.',
      lines:'{n} article(s)', by:'par', ref:'N° {r}', decision:'Décision', replaced:'Remplacé par',
      label:{ draft:'Brouillon', submitted:'Envoyée', 'under-review':'En validation', 'changes-proposed':'Changements proposés', approved:'Validée', preparing:'En préparation', ready:'Prête à remettre', 'out-for-delivery':'Remise, réception attendue', 'partially-received':'Reçue en partie', received:'Reçue', rejected:'Refusée', cancelled:'Annulée', disputed:'Écart signalé' },
      event:{ created:'Créée', submit:'Envoyée', review:'Validée, stock réservé', accept:'Changements acceptés', prepare:'Préparée et remise', confirm:'Réception confirmée, garde transférée', dispute:'Écart signalé', cancel:'Annulée' }
    },
    en: {
      title:'Department requests', sub:'From request to handover, with custody recorded at every step', create:'New request', refresh:'Refresh',
      empty:'No request in progress', emptyD:'Departments request linen, products and consumables from the storeroom here.', loading:'Loading requests…', offline:'Requests unavailable right now', retry:'Try again',
      noUnits:'No department set up', noUnitsD:'Declare the hotel departments under Outlets so they can request from the storeroom.',
      department:'Department', items:'Items', note:'Note', notePh:'Floor, urgency, details…', qty:'Quantity', unit:'Unit', send:'Send to the storeroom', cancel:'Close', noCatalogue:'No item approved for this department.', noCatalogueD:'This department’s catalogue is empty: the storeroom must open items to it.', pickOne:'Enter at least one quantity.', sent:'Request sent to the storeroom', draftSaved:'Request saved as a draft, send it again',
      stepRequest:'Request', stepReview:'Review', stepPrepare:'Preparation', stepHandover:'Handover', stepReceipt:'Receipt',
      sideService:'Department side', sideEconomat:'Storeroom side',
      requested:'Requested', approved:'Approved', prepared:'Prepared', received:'Received', available:'In stock',
      resApproved:'Approve', resReduced:'Reduce', resRefused:'Refuse', resSubstituted:'Substitute', substitute:'Replacement item', substituteUnit:'Unit', reason:'Reason', reasonPh:'Out of stock, size unavailable…',
      review:'Approve and reserve stock', reviewHint:'Approval reserves the stock in the storeroom: no other request can take it.', reviewed:'Request approved, stock reserved', insufficient:'Not enough stock in the storeroom: nothing was reserved. Reduce or substitute.', badSubstitute:'Choose the replacement item, unit and reason.', badReduce:'A reduced quantity must stay between zero and the requested quantity.',
      accept:'Accept the changes', acceptHint:'The storeroom changed this request. The department accepts before preparation.', accepted:'Changes accepted',
      method:'Handover', pickup:'Collected at the storeroom', delivery:'Delivered to the department', handover:'Hand over to the department', prepareHint:'Enter what actually leaves. Custody stays with the storeroom until receipt.', handedOver:'Handover recorded. After losing connection, reopen this request to count and confirm receipt. Report discrepancies to the manager.',
      confirm:'Confirm receipt', confirmHint:'Count what arrived. Confirming transfers custody to the department.', confirmed:'Receipt confirmed, custody transferred', badReceived:'Invalid received quantity.',
      dispute:'Report a discrepancy', disputed:'Discrepancy reported', cancelReq:'Cancel request', cancelled:'Request cancelled', submit:'Send to the storeroom', submitted:'Request sent',
      custody:'Custody', custodyEco:'With the storeroom', custodyService:'With the department', trail:'History', stale:'The request changed meanwhile: it has been reloaded.', failed:'Action refused', forbidden:'Your role does not allow this step.', sideConfirm:'In this hotel, the storeroom confirms receipt.',
      lines:'{n} item(s)', by:'by', ref:'No. {r}', decision:'Decision', replaced:'Replaced by',
      label:{ draft:'Draft', submitted:'Sent', 'under-review':'Under review', 'changes-proposed':'Changes proposed', approved:'Approved', preparing:'Preparing', ready:'Ready for handover', 'out-for-delivery':'Handed over, awaiting receipt', 'partially-received':'Partly received', received:'Received', rejected:'Refused', cancelled:'Cancelled', disputed:'Discrepancy' },
      event:{ created:'Created', submit:'Sent', review:'Approved, stock reserved', accept:'Changes accepted', prepare:'Prepared and handed over', confirm:'Receipt confirmed, custody transferred', dispute:'Discrepancy reported', cancel:'Cancelled' }
    },
    ar: {
      title:'طلبات الأقسام', sub:'من الطلب إلى التسليم، مع تسجيل العهدة في كل مرحلة', create:'طلب جديد', refresh:'تحديث',
      empty:'لا يوجد طلب قيد المعالجة', emptyD:'تطلب الأقسام هنا البياضات والمنتجات والمواد الاستهلاكية من المخزن.', loading:'جارٍ تحميل الطلبات…', offline:'الطلبات غير متاحة حاليًا', retry:'إعادة المحاولة',
      noUnits:'لا يوجد قسم مُعدّ', noUnitsD:'صرّح بأقسام الفندق في نقاط البيع حتى تتمكن من الطلب من المخزن.',
      department:'القسم', items:'المواد', note:'ملاحظة', notePh:'الطابق، الاستعجال، تفاصيل…', qty:'الكمية', unit:'الوحدة', send:'إرسال إلى المخزن', cancel:'إغلاق', noCatalogue:'لا توجد مادة مسموحة لهذا القسم.', noCatalogueD:'كتالوج هذا القسم فارغ: على المخزن أن يفتح له مواد.', pickOne:'أدخل كمية واحدة على الأقل.', sent:'تم إرسال الطلب إلى المخزن', draftSaved:'حُفظ الطلب كمسودة، أعد الإرسال',
      stepRequest:'الطلب', stepReview:'المصادقة', stepPrepare:'التحضير', stepHandover:'التسليم', stepReceipt:'الاستلام',
      sideService:'جهة القسم', sideEconomat:'جهة المخزن',
      requested:'المطلوب', approved:'المقبول', prepared:'المُحضَّر', received:'المستلم', available:'في المخزون',
      resApproved:'قبول', resReduced:'تخفيض', resRefused:'رفض', resSubstituted:'استبدال', substitute:'مادة بديلة', substituteUnit:'الوحدة', reason:'السبب', reasonPh:'نفاد، مقاس غير متوفر…',
      review:'المصادقة وحجز المخزون', reviewHint:'المصادقة تحجز المخزون في المخزن: لا يمكن لطلب آخر أخذه.', reviewed:'تمت المصادقة وحُجز المخزون', insufficient:'المخزون غير كافٍ في المخزن: لم يُحجز شيء. خفّض أو استبدل.', badSubstitute:'اختر المادة البديلة والوحدة والسبب.', badReduce:'يجب أن تبقى الكمية المخفّضة بين الصفر والكمية المطلوبة.',
      accept:'قبول التغييرات', acceptHint:'عدّل المخزن هذا الطلب. يقبل القسم قبل التحضير.', accepted:'تم قبول التغييرات',
      method:'التسليم', pickup:'استلام من المخزن', delivery:'توصيل إلى القسم', handover:'التسليم إلى القسم', prepareHint:'أدخل ما يخرج فعلًا. تبقى العهدة لدى المخزن حتى الاستلام.', handedOver:'سُجّل التسليم. بعد انقطاع الاتصال، افتح هذا الطلب لعد المواد وتأكيد الاستلام. أبلغ المسؤول بأي فرق.',
      confirm:'تأكيد الاستلام', confirmHint:'عدّ ما وصل. التأكيد ينقل العهدة إلى القسم.', confirmed:'تم تأكيد الاستلام ونُقلت العهدة', badReceived:'كمية مستلمة غير صالحة.',
      dispute:'الإبلاغ عن فرق', disputed:'تم الإبلاغ عن فرق', cancelReq:'إلغاء الطلب', cancelled:'تم إلغاء الطلب', submit:'إرسال إلى المخزن', submitted:'تم إرسال الطلب',
      custody:'العهدة', custodyEco:'لدى المخزن', custodyService:'لدى القسم', trail:'السجل', stale:'تغيّر الطلب في الأثناء: أُعيد تحميله.', failed:'رُفض الإجراء', forbidden:'دورك لا يسمح بهذه المرحلة.', sideConfirm:'في هذا الفندق، يؤكد المخزن الاستلام.',
      lines:'{n} مادة', by:'بواسطة', ref:'رقم {r}', decision:'القرار', replaced:'استُبدل بـ',
      label:{ draft:'مسودة', submitted:'مُرسل', 'under-review':'قيد المصادقة', 'changes-proposed':'تغييرات مقترحة', approved:'مُصادق', preparing:'قيد التحضير', ready:'جاهز للتسليم', 'out-for-delivery':'سُلّم، في انتظار الاستلام', 'partially-received':'مستلم جزئيًا', received:'مستلم', rejected:'مرفوض', cancelled:'ملغى', disputed:'فرق مُبلغ عنه' },
      event:{ created:'أُنشئ', submit:'أُرسل', review:'صودق عليه وحُجز المخزون', accept:'قُبلت التغييرات', prepare:'حُضّر وسُلّم', confirm:'أُكّد الاستلام ونُقلت العهدة', dispute:'أُبلغ عن فرق', cancel:'أُلغي' }
    }
  };
  var UNIT = {
    fr:{ unite:'unité', bouteille:'bouteille', carton:'carton', caisse:'caisse', paquet:'paquet', lot:'lot', rouleau:'rouleau', kg:'kg', g:'g', L:'L', ml:'ml', cl:'cl', sachet:'sachet', boite:'boîte', bidon:'bidon', douzaine:'douzaine' },
    en:{ unite:'unit', bouteille:'bottle', carton:'carton', caisse:'case', paquet:'pack', lot:'lot', rouleau:'roll', kg:'kg', g:'g', L:'L', ml:'ml', cl:'cl', sachet:'sachet', boite:'box', bidon:'jerrycan', douzaine:'dozen' },
    ar:{ unite:'وحدة', bouteille:'قنينة', carton:'كرتونة', caisse:'صندوق', paquet:'رزمة', lot:'دفعة', rouleau:'لفافة', kg:'كغ', g:'غ', L:'ل', ml:'مل', cl:'سل', sachet:'كيس', boite:'علبة', bidon:'بيدون', douzaine:'دزينة' }
  };

  var S = { loaded:false, loading:false, error:'', requests:[], units:[], catalogue:[], side:'recipient', actor:null, host:null };
  var sheet = null;      // { ref, id, mode }
  var createRef = null;
  var pending = false;

  function lang() { var l = window.KiwiI18n && window.KiwiI18n.getLang ? window.KiwiI18n.getLang() : 'fr'; return STR[l] ? l : 'fr'; }
  function T() { return STR[lang()]; }
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]; }); }
  function unitName(u) { var m = UNIT[lang()] || UNIT.fr; return m[u] || u || ''; }
  var numFmt = {}, timeFmt = {};
  function num(v) {
    var l = lang();
    if (!numFmt[l]) numFmt[l] = new Intl.NumberFormat(l === 'ar' ? 'ar-MA' : l === 'en' ? 'en-GB' : 'fr-FR', { maximumFractionDigits:3 });
    var n = Number(v); return numFmt[l].format(Number.isFinite(n) ? n : 0);
  }
  function when(ts) {
    var l = lang(); if (!ts) return '';
    var zone = '';
    try { zone = window.KiwiDayReport && window.KiwiDayReport.timezone && window.KiwiDayReport.timezone(merchant()); } catch (_) {}
    if (!zone) {
      try { var venue = window.KiwiVenue && window.KiwiVenue.getCurrentVenueData && window.KiwiVenue.getCurrentVenueData(); zone = venue && (venue.timezone || venue.timeZone || venue.tz); } catch (_) {}
    }
    var Formatter = window.KiwiZoneLaw && window.KiwiZoneLaw.DateTimeFormat || Intl.DateTimeFormat;
    var key = l + '|' + (zone || 'Africa/Casablanca');
    try {
      if (!timeFmt[key]) timeFmt[key] = new Formatter(l === 'ar' ? 'ar-MA' : l === 'en' ? 'en-GB' : 'fr-FR', { timeZone:zone || 'Africa/Casablanca', day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' });
    } catch (_) {
      key = l + '|Africa/Casablanca';
      if (!timeFmt[key]) timeFmt[key] = new Formatter(l === 'ar' ? 'ar-MA' : l === 'en' ? 'en-GB' : 'fr-FR', { timeZone:'Africa/Casablanca', day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' });
    }
    try { return timeFmt[key].format(new Date(Number(ts))); } catch (_) { return ''; }
  }
  /* « req-mvmep6gj-6e3w » se lit mal : on montre la fin, en capitales. */
  function shortRef(id) { var parts = String(id || '').split('-'); return T().ref.replace('{r}', String(parts[parts.length - 1] || id).toUpperCase()); }
  function same(a, b) { return Math.abs(Number(a) - Number(b)) <= 1e-9; }

  function merchant() {
    try { var m = window.KiwiInventory && window.KiwiInventory.merchant && window.KiwiInventory.merchant(); if (m) return String(m); } catch (_) {}
    try { var v = window.KiwiVenue && window.KiwiVenue.getCurrentVenueData && window.KiwiVenue.getCurrentVenueData(); if (v && v.slug) return String(v.slug); } catch (_) {}
    try { if (window.KiwiMe && window.KiwiMe.merchant) return String(window.KiwiMe.merchant); } catch (_) {}
    return '';
  }

  async function getJson(url) {
    var r = await (await import('./request-deadline.mjs').catch(function () { return { deadlineFetch: function (u, o) { return fetch(u, o); } }; })).deadlineFetch(url, { credentials:'same-origin', cache:'no-store' });
    var body = {}; try { body = await r.json(); } catch (_) { if (_.code === 'request-timeout') throw _; }
    if (!r.ok) { var e = new Error(body.error || ('http-' + r.status)); e.status = r.status; e.body = body; throw e; }
    return body;
  }
  async function post(body) {
    var r = await (await import('./request-deadline.mjs').catch(function () { return { deadlineFetch: function (u, o) { return fetch(u, o); } }; })).deadlineFetch('/api/inventory/internal-requests', { method:'POST', credentials:'same-origin', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify(Object.assign({ merchant:merchant() }, body)) });
    var out = {}; try { out = await r.json(); } catch (_) { if (_.code === 'request-timeout') throw _; }
    if (!r.ok) { var e = new Error(out.error || ('http-' + r.status)); e.status = r.status; e.body = out; throw e; }
    return out;
  }

  /* ─── Données ─── */
  function departments() { return S.units.filter(function (u) { return u && u.kind !== 'economat' && u.active !== false; }); }
  function unitById(id) { for (var i = 0; i < S.units.length; i++) if (S.units[i] && S.units[i].id === id) return S.units[i]; return null; }
  function item(id) { for (var i = 0; i < S.catalogue.length; i++) if (S.catalogue[i] && S.catalogue[i].itemId === id) return S.catalogue[i]; return null; }
  function itemName(id) { var it = item(id); return it ? it.name : id; }
  function unitsOf(it) {
    if (!it) return [];
    var out = [];
    [it.issueUnit, it.purchaseUnit, it.consumptionUnit].forEach(function (u) { if (u && out.indexOf(u) < 0) out.push(u); });
    return out;
  }
  function snapshotFor(it, unit) {
    if (!it) return null;
    var pairs = [['purchaseUnit','purchaseToBase'], ['issueUnit','issueToBase'], ['consumptionUnit','consumptionToBase']];
    for (var i = 0; i < pairs.length; i++) if (it[pairs[i][0]] === unit) return { unit:unit, baseUnit:it.baseUnit, basePerUnit:Number(it[pairs[i][1]]) || 1 };
    return null;
  }
  /* Stock lu par la page Économat (même registre), pour aider la validation. */
  function onHand(itemId) {
    try {
      var rows = window.KiwiEconomatStock && window.KiwiEconomatStock.rows ? window.KiwiEconomatStock.rows() : [];
      var total = null;
      rows.forEach(function (row) { if (row.id === itemId) total = (total || 0) + Number(row.qty || 0); });
      return total;
    } catch (_) { return null; }
  }
  function find(id) { for (var i = 0; i < S.requests.length; i++) if (S.requests[i].request.id === id) return S.requests[i]; return null; }
  function upsert(stored) {
    if (!stored || !stored.request) return;
    var old = find(stored.request.id);
    var next = { request:stored.request, lines:stored.lines || [], label:stored.label, events:(old && old.events) || [] };
    if (old) S.requests[S.requests.indexOf(old)] = next; else S.requests.unshift(next);
  }

  async function load() {
    var m = merchant();
    if (!m) { S.loaded = true; S.error = 'no-merchant'; paint(); return; }
    S.loading = true; paint();
    var qs = encodeURIComponent(m);
    try {
      var all = await Promise.all([
        getJson('/api/inventory/internal-requests?merchant=' + qs),
        getJson('/api/store?feature=hotel-units&merchant=' + qs),
        getJson('/api/store?feature=economat-catalogue&merchant=' + qs),
      ]);
      S.requests = Array.isArray(all[0].requests) ? all[0].requests : [];
      S.side = all[0].confirmationSide === 'economat' ? 'economat' : 'recipient';
      S.actor = all[0].actor || null;
      S.units = all[1] && all[1].data && Array.isArray(all[1].data.units) ? all[1].data.units : [];
      S.catalogue = all[2] && all[2].data && Array.isArray(all[2].data.items) ? all[2].data.items : [];
      S.error = '';
    } catch (e) { S.error = String(e && e.message || 'offline'); }
    S.loading = false; S.loaded = true;
    paint();
    /* Repeint la fiche encore ouverte ; une fiche fermée reste fermée. */
    if (sheet && sheet.ref && sheet.ref.el && sheet.ref.el.isConnected && sheet.ref.el.classList.contains('in')) openSheet(sheet.id);
    else sheet = null;
  }

  /* ─── Liste ─── */
  var PILL = { draft:'neutral', submitted:'pend', 'under-review':'pend', 'changes-proposed':'pend', approved:'ok', preparing:'pend', ready:'ok', 'out-for-delivery':'pend', 'partially-received':'pend', received:'dark', rejected:'late', cancelled:'neutral', disputed:'late' };
  function pill(label) { var t = T(); return '<span class="hx-pill ' + (PILL[label] || 'neutral') + '">' + esc(t.label[label] || label) + '</span>'; }

  function listHtml() {
    var t = T();
    if (S.loading && !S.loaded) return '<div class="hx-eco-empty" aria-busy="true"><p>' + esc(t.loading) + '</p></div>';
    if (S.error) return '<div class="hx-eco-empty"><b>' + esc(t.offline) + '</b><button class="hx-btn ghost" type="button" data-action="eco-req-refresh">' + esc(t.retry) + '</button></div>';
    if (!S.requests.length) {
      if (!departments().length) return '<div class="hx-eco-empty"><b>' + esc(t.noUnits) + '</b><p>' + esc(t.noUnitsD) + '</p></div>';
      return '<div class="hx-eco-empty"><b>' + esc(t.empty) + '</b><p>' + esc(t.emptyD) + '</p></div>';
    }
    return '<ul class="hx-req-list" role="list">' + S.requests.map(function (r) {
      var u = unitById(r.request.unitId);
      var names = r.lines.slice(0, 3).map(function (l) { return itemName(l.itemId); }).join(', ') + (r.lines.length > 3 ? '…' : '');
      return '<li><button type="button" class="hx-req-row" data-action="eco-req-open" data-req="' + esc(r.request.id) + '">' +
        '<span class="hx-req-who"><b>' + esc(u ? u.name : r.request.unitId) + ' · ' + esc(shortRef(r.request.id)) + '</b><small>' + esc(names) + '</small></span>' +
        '<span class="hx-req-meta"><small>' + esc(t.lines.replace('{n}', num(r.lines.length))) + ' · ' + esc(when(r.request.updatedTs)) + '</small>' + pill(r.label) + '</span>' +
        '</button></li>';
    }).join('') + '</ul>';
  }

  function sectionHtml() {
    var t = T(), canCreate = departments().length > 0 && !S.error;
    return '<section class="hx-eco-card hx-req" data-eco-requests aria-labelledby="hx-req-title">' +
      '<div class="hx-eco-card-head"><div><b id="hx-req-title">' + esc(t.title) + '</b><span>' + esc(t.sub) + '</span></div>' +
      '<div class="hx-req-actions"><button class="hx-btn ghost" type="button" data-action="eco-req-refresh"' + (S.loading ? ' disabled aria-busy="true"' : '') + '>' + esc(t.refresh) + '</button>' +
      '<button data-activation=write class="hx-btn atlas" type="button" data-action="eco-req-new"' + (canCreate ? '' : ' disabled') + '>' + esc(t.create) + '</button></div></div>' +
      '<div data-eco-req-list>' + listHtml() + '</div></section>';
  }

  function paint() {
    var host = S.host && S.host.isConnected ? S.host : document.querySelector('[data-eco-requests-host]');
    if (!host) return;
    S.host = host;
    host.innerHTML = sectionHtml();
  }

  /* ─── Étapes ─── */
  function changed(r) {
    return r.lines.some(function (l) { return l.resolution === 'substituted' || (l.resolution !== 'pending' && !same(l.qtyApproved, l.qtyRequested)); });
  }
  function stage(r) {
    var q = r.request, label = r.label;
    if (q.cancelled || label === 'rejected') return { step:-1, act:'' };
    if (q.state === 'draft') return { step:0, act:'submit' };
    if (q.state === 'closed') return { step:5, act:label === 'disputed' ? '' : 'dispute' };
    var reviewed = q.reviewRevision > 0 && r.lines.every(function (l) { return l.resolution && l.resolution !== 'pending'; });
    if (!reviewed) return { step:1, act:'review' };
    if (changed(r) && q.acceptedRevision < q.reviewRevision) return { step:1, act:'accept' };
    var toReceive = r.lines.some(function (l) { return Number(l.qtyReceived) + 1e-9 < Number(l.qtyPrepared); });
    var toPrepare = r.lines.some(function (l) { return Number(l.qtyPrepared) + 1e-9 < Number(l.qtyApproved); });
    if (toReceive) return { step:4, act:'confirm' };
    if (toPrepare) return { step:r.lines.some(function (l) { return Number(l.qtyPrepared) > 0; }) ? 3 : 2, act:'prepare' };
    return { step:5, act:'' };
  }
  function stepperHtml(r, st) {
    var t = T(), names = [t.stepRequest, t.stepReview, t.stepPrepare, t.stepHandover, t.stepReceipt];
    return '<ol class="hx-req-steps" aria-label="' + esc(t.title) + '">' + names.map(function (n, i) {
      var state = st.step < 0 ? 'off' : i < st.step ? 'done' : i === st.step ? 'now' : 'next';
      return '<li class="' + state + '"' + (state === 'now' ? ' aria-current="step"' : '') + '><i aria-hidden="true"></i><span>' + esc(n) + '</span></li>';
    }).join('') + '</ol>';
  }

  function linesHtml(r, act) {
    var t = T();
    return '<div class="hx-req-lines">' + r.lines.map(function (l, i) {
      var fulfil = l.resolution === 'substituted' && l.substituteFor ? l.substituteFor : l.itemId;
      var fulfilUnit = l.resolution === 'substituted' && l.substituteUnit ? l.substituteUnit : l.unit;
      var head = '<div class="hx-req-line-head"><b>' + esc(itemName(l.itemId)) + '</b><small>' + esc(t.requested) + ' ' + num(l.qtyRequested) + ' · ' + esc(unitName(l.unit)) + (l.note ? ' · ' + esc(l.note) : '') + '</small>' +
        (l.resolution === 'substituted' ? '<small class="hx-req-sub">' + esc(t.replaced) + ' ' + esc(itemName(l.substituteFor)) + ' · ' + num(l.qtyApproved) + ' · ' + esc(unitName(l.substituteUnit)) + (l.substituteReason ? ' · ' + esc(l.substituteReason) : '') + '</small>' : '') + '</div>';
      var figures = '<dl class="hx-req-figs">' +
        (l.resolution !== 'pending' ? '<div><dt>' + esc(t.approved) + '</dt><dd>' + num(l.qtyApproved) + '</dd></div>' : '') +
        (Number(l.qtyPrepared) > 0 ? '<div><dt>' + esc(t.prepared) + '</dt><dd>' + num(l.qtyPrepared) + '</dd></div>' : '') +
        (Number(l.qtyReceived) > 0 ? '<div><dt>' + esc(t.received) + '</dt><dd>' + num(l.qtyReceived) + '</dd></div>' : '') + '</dl>';
      var form = '';
      if (act === 'review') {
        var stock = onHand(l.itemId);
        var others = S.catalogue.filter(function (it) { return it && it.active !== false && it.itemId !== l.itemId; });
        var subUnits = unitsOf(item(l.substituteFor || (others[0] && others[0].itemId)));
        form = '<div class="hx-req-review" data-line="' + i + '">' +
          '<label>' + esc(t.decision) + '<select data-rv-res aria-label="' + esc(t.decision + ' · ' + itemName(l.itemId)) + '">' +
            [['approved', t.resApproved], ['reduced', t.resReduced], ['refused', t.resRefused], ['substituted', t.resSubstituted]].map(function (o) { return '<option value="' + o[0] + '"' + ((l.resolution === o[0] || (l.resolution === 'pending' && o[0] === 'approved')) ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') +
          '</select></label>' +
          '<label>' + esc(t.qty) + '<input data-rv-qty type="number" min="0" step="any" inputmode="decimal" value="' + esc(l.resolution === 'pending' ? l.qtyRequested : l.qtyApproved) + '" aria-label="' + esc(t.qty + ' · ' + itemName(l.itemId)) + '"></label>' +
          (stock != null ? '<p class="hx-req-stock">' + esc(t.available) + ' · ' + num(stock) + '</p>' : '') +
          '<div class="hx-req-subst" data-rv-subst' + (l.resolution === 'substituted' ? '' : ' hidden') + '>' +
            '<label>' + esc(t.substitute) + '<select data-rv-item>' + others.map(function (it) { return '<option value="' + esc(it.itemId) + '"' + (it.itemId === l.substituteFor ? ' selected' : '') + '>' + esc(it.name) + '</option>'; }).join('') + '</select></label>' +
            '<label>' + esc(t.substituteUnit) + '<select data-rv-unit>' + subUnits.map(function (u) { return '<option value="' + esc(u) + '"' + (u === l.substituteUnit ? ' selected' : '') + '>' + esc(unitName(u)) + '</option>'; }).join('') + '</select></label>' +
            '<label class="wide">' + esc(t.reason) + '<input data-rv-reason value="' + esc(l.substituteReason) + '" placeholder="' + esc(t.reasonPh) + '" maxlength="200"></label>' +
          '</div></div>';
      } else if (act === 'prepare' && Number(l.qtyApproved) > 0) {
        form = '<label class="hx-req-qty">' + esc(t.prepared) + ' · ' + esc(unitName(fulfilUnit)) + '<input data-pp-qty data-line="' + i + '" type="number" min="' + esc(l.qtyPrepared) + '" max="' + esc(l.qtyApproved) + '" step="any" inputmode="decimal" value="' + esc(l.qtyApproved) + '" aria-label="' + esc(t.prepared + ' · ' + itemName(fulfil)) + '"></label>';
      } else if (act === 'confirm' && Number(l.qtyPrepared) > 0) {
        form = '<label class="hx-req-qty">' + esc(t.received) + ' · ' + esc(unitName(fulfilUnit)) + '<input data-rc-qty data-line="' + i + '" type="number" min="' + esc(l.qtyReceived) + '" max="' + esc(l.qtyPrepared) + '" step="any" inputmode="decimal" value="' + esc(l.qtyPrepared) + '" aria-label="' + esc(t.received + ' · ' + itemName(fulfil)) + '"></label>';
      }
      return '<div class="hx-req-line">' + head + figures + form + '</div>';
    }).join('') + '</div>';
  }

  function trailHtml(r) {
    var t = T(), events = r.events || [];
    if (!events.length) return '';
    return '<details class="hx-req-trail"' + (r.request.state === 'closed' ? ' open' : '') + '><summary>' + esc(t.trail) + '</summary><ol>' + events.map(function (e) {
      return '<li><b>' + esc(t.event[e.event] || e.event) + '</b><small>' + (e.actorName ? esc(t.by) + ' ' + esc(e.actorName) + ' · ' : '') + esc(when(e.ts)) + '</small></li>';
    }).join('') + '</ol></details>';
  }

  function sheetBody(r, st) {
    var t = T(), u = unitById(r.request.unitId);
    var custody = r.request.state === 'closed' && r.lines.some(function (l) { return Number(l.qtyReceived) > 0; }) ? t.custodyService : t.custodyEco;
    var side = { submit:t.sideService, review:t.sideEconomat, accept:t.sideService, prepare:t.sideEconomat, confirm:S.side === 'economat' ? t.sideEconomat : t.sideService }[st.act] || '';
    var hint = { review:t.reviewHint, accept:t.acceptHint, prepare:t.prepareHint, confirm:t.confirmHint }[st.act] || '';
    var method = st.act === 'prepare'
      ? '<fieldset class="hx-req-method"><legend>' + esc(t.method) + '</legend>' +
        '<label><input type="radio" name="hx-req-method" value="pickup"' + (r.request.fulfilmentMethod !== 'delivery' ? ' checked' : '') + '> ' + esc(t.pickup) + '</label>' +
        '<label><input type="radio" name="hx-req-method" value="delivery"' + (r.request.fulfilmentMethod === 'delivery' ? ' checked' : '') + '> ' + esc(t.delivery) + '</label></fieldset>'
      : '';
    return '<div class="hx-req-sheet" data-req-sheet="' + esc(r.request.id) + '" data-req-act="' + esc(st.act) + '">' +
      '<div class="hx-req-sheet-top"><span class="hx-req-dept">' + esc(t.department) + ' · <b>' + esc(u ? u.name : r.request.unitId) + '</b></span>' + pill(r.label) + '</div>' +
      stepperHtml(r, st) +
      '<p class="hx-req-custody"><span>' + esc(t.custody) + '</span> <b>' + esc(custody) + '</b>' + (r.request.requesterName ? ' · ' + esc(t.by) + ' ' + esc(r.request.requesterName) : '') + '</p>' +
      (side ? '<p class="hx-req-side" data-req-side><b>' + esc(side) + '</b>' + (hint ? ' · ' + esc(hint) : '') + '</p>' : '') +
      linesHtml(r, st.act) + method + trailHtml(r) +
      '</div>';
  }
  function sheetFoot(r, st) {
    var t = T(), primary = { submit:t.submit, review:t.review, accept:t.accept, prepare:t.handover, confirm:t.confirm, dispute:t.dispute }[st.act];
    /* Annuler n'a de sens qu'avant la remise : une fois les articles partis,
     c'est la réception (ou un écart) qui solde la demande. */
    var canCancel = !r.request.cancelled && r.request.state !== 'closed' && !r.request.deliveryStartedTs && !r.lines.some(function (l) { return Number(l.qtyPrepared) > 0 || Number(l.qtyReceived) > 0; });
    return '<button class="kb ghost" type="button" data-dismiss>' + esc(t.cancel) + '</button>' +
      (canCancel ? '<button data-activation=write class="kb ghost" type="button" data-action="eco-req-cancel">' + esc(t.cancelReq) + '</button>' : '') +
      (primary ? '<button data-activation=write class="kb ' + (st.act === 'dispute' ? 'ghost' : 'atlas') + '" type="button" data-action="eco-req-act">' + esc(primary) + '</button>' : '');
  }

  function openSheet(id) {
    var r = find(id); if (!r) return;
    var st = stage(r), t = T(), u = unitById(r.request.unitId);
    if (sheet && sheet.ref && sheet.ref.el && sheet.ref.el.isConnected && sheet.id === id) {
      var modal = sheet.ref.el.querySelector('.kiwi-modal');
      modal.querySelector('.kiwi-modal-body').innerHTML = sheetBody(r, st);
      var foot = modal.querySelector('.kiwi-modal-foot'); if (foot) foot.innerHTML = sheetFoot(r, st);
      return;
    }
    if (sheet && sheet.ref && sheet.ref.close) sheet.ref.close();
    var ref = Kiwi.modal({ tag:t.title.toUpperCase(), title:(u ? u.name : r.request.unitId) + ' · ' + shortRef(r.request.id), width:640, body:sheetBody(r, st), foot:sheetFoot(r, st) });
    ref.el.classList.add('hx-req-modal');
    sheet = { ref:ref, id:id };
    ref.el.addEventListener('change', onSheetChange);
  }

  function onSheetChange(event) {
    var el = event.target, box = el.closest && el.closest('.hx-req-review');
    if (!box) return;
    if (el.matches('[data-rv-res]')) {
      var r = sheet && find(sheet.id), l = r && r.lines[Number(box.getAttribute('data-line'))];
      var qty = box.querySelector('[data-rv-qty]');
      box.querySelector('[data-rv-subst]').hidden = el.value !== 'substituted';
      if (l && el.value === 'approved') qty.value = l.qtyRequested;
      if (el.value === 'refused') qty.value = 0;
    }
    if (el.matches('[data-rv-item]')) {
      var units = unitsOf(item(el.value));
      box.querySelector('[data-rv-unit]').innerHTML = units.map(function (u) { return '<option value="' + esc(u) + '">' + esc(unitName(u)) + '</option>'; }).join('');
    }
  }

  /* ─── Commandes ─── */
  function key(r, action) { return 'ui:' + r.request.id + ':' + action + ':r' + r.request.revision; }
  function errorText(e) {
    var t = T(), code = String(e && e.message || '');
    if (code === 'request-timeout') return t.offline + ' · ' + t.retry;
    if (code === 'handover-reconciliation-required') return t.handedOver;
    if (code === 'insufficient-stock' || code.indexOf('source-shortage') === 0) return t.insufficient;
    if (code === 'forbidden-action' || code === 'confirmation-side-forbidden') return code === 'confirmation-side-forbidden' ? t.sideConfirm : t.forbidden;
    if (code.indexOf('bad-substitut') === 0) return t.badSubstitute;
    return t.failed + ' · ' + code;
  }
  async function run(r, action, data, okText) {
    if (pending) return;
    pending = true;
    var btn = sheet && sheet.ref && sheet.ref.el.querySelector('[data-action="eco-req-act"]');
    if (btn) { btn.disabled = true; btn.setAttribute('aria-busy', 'true'); }
    try {
      var out = await post({ action:action, id:r.request.id, revision:r.request.revision, idempotencyKey:key(r, action), data:data || {} });
      upsert(out);
      Kiwi.toast(okText, { type:'success' });
      if (action === 'confirm' || action === 'review') { try { await window.KiwiInventory.sync(); } catch (_) {} }
      pending = false;
      await load();
    } catch (e) {
      pending = false;
      if (e && e.status === 409 && String(e.message) === 'stale') { Kiwi.toast(T().stale, { type:'warning' }); await load(); return; }
      Kiwi.toast(errorText(e), { type:'warning' });
      if (btn && btn.isConnected) { btn.disabled = false; btn.removeAttribute('aria-busy'); }
    }
  }

  function reviewData(r) {
    var t = T(), lines = [], el = sheet.ref.el;
    for (var i = 0; i < r.lines.length; i++) {
      var l = r.lines[i], box = el.querySelector('.hx-req-review[data-line="' + i + '"]');
      var res = box.querySelector('[data-rv-res]').value, qty = Number(box.querySelector('[data-rv-qty]').value);
      if (res === 'approved') { lines.push({ itemId:l.itemId, qtyApproved:l.qtyRequested, resolution:'approved' }); continue; }
      if (res === 'refused') { lines.push({ itemId:l.itemId, qtyApproved:0, resolution:'refused' }); continue; }
      if (res === 'reduced') {
        if (!(qty > 0 && qty < l.qtyRequested)) { Kiwi.toast(t.badReduce, { type:'warning' }); return null; }
        lines.push({ itemId:l.itemId, qtyApproved:qty, resolution:'reduced' }); continue;
      }
      var subId = box.querySelector('[data-rv-item]').value, subUnit = box.querySelector('[data-rv-unit]').value, reason = String(box.querySelector('[data-rv-reason]').value || '').trim();
      var snap = snapshotFor(item(subId), subUnit);
      if (!subId || !snap || !reason || !(qty > 0)) { Kiwi.toast(t.badSubstitute, { type:'warning' }); return null; }
      lines.push({ itemId:l.itemId, qtyApproved:qty, resolution:'substituted', substituteFor:subId, substituteUnit:subUnit, substituteConversionSnapshot:snap, substituteReason:reason });
    }
    return { lines:lines };
  }
  function progressData(r, sel, field, ceiling) {
    var lines = [], el = sheet.ref.el;
    for (var i = 0; i < r.lines.length; i++) {
      var l = r.lines[i], input = el.querySelector(sel + '[data-line="' + i + '"]');
      if (!input) continue;
      var v = Number(input.value);
      if (!Number.isFinite(v) || v + 1e-9 < Number(l[field]) || v > Number(l[ceiling]) + 1e-9) return null;
      var line = { itemId:l.itemId }; line[field] = v; lines.push(line);
    }
    return lines.length ? lines : null;
  }

  handlers['eco-req-refresh'] = function () { load(); };
  handlers['eco-req-open'] = function (el) {
    var id = el && el.getAttribute ? el.getAttribute('data-req') : '';
    if (id) openSheet(id);
  };
  handlers['eco-req-act'] = function () {
    var r = sheet && find(sheet.id); if (!r) return;
    var t = T(), st = stage(r);
    if (st.act === 'submit') return run(r, 'submit', {}, t.submitted);
    if (st.act === 'accept') return run(r, 'accept', {}, t.accepted);
    if (st.act === 'dispute') return run(r, 'dispute', {}, t.disputed);
    if (st.act === 'review') { var d = reviewData(r); if (d) run(r, 'review', d, t.reviewed); return; }
    if (st.act === 'prepare') {
      var pl = progressData(r, '[data-pp-qty]', 'qtyPrepared', 'qtyApproved');
      if (!pl) { Kiwi.toast(t.badReceived, { type:'warning' }); return; }
      var m = sheet.ref.el.querySelector('input[name="hx-req-method"]:checked');
      return run(r, 'prepare', { lines:pl, fulfilmentMethod:m ? m.value : 'pickup', handover:true }, t.handedOver);
    }
    if (st.act === 'confirm') {
      var rl = progressData(r, '[data-rc-qty]', 'qtyReceived', 'qtyPrepared');
      if (!rl) { Kiwi.toast(t.badReceived, { type:'warning' }); return; }
      return run(r, 'confirm', { lines:rl }, t.confirmed);
    }
  };
  handlers['eco-req-cancel'] = function () {
    var r = sheet && find(sheet.id); if (!r) return;
    run(r, 'cancel', {}, T().cancelled);
  };

  /* ─── Nouvelle demande (côté service) ─── */
  var draftCatalogue = [];
  function createBody(unitId) {
    var t = T(), deps = departments();
    return '<div class="hx-req-new">' +
      '<label class="hx-req-field">' + esc(t.department) + '<select id="hx-req-unit" data-req-unit>' + deps.map(function (u) { return '<option value="' + esc(u.id) + '"' + (u.id === unitId ? ' selected' : '') + '>' + esc(u.name) + '</option>'; }).join('') + '</select></label>' +
      '<fieldset class="hx-req-pick"><legend>' + esc(t.items) + '</legend><div data-req-items aria-live="polite"><p class="hx-req-stock">' + esc(t.loading) + '</p></div></fieldset>' +
      '<label class="hx-req-field">' + esc(t.note) + '<input id="hx-req-note" maxlength="200" placeholder="' + esc(t.notePh) + '"></label>' +
      '</div>';
  }
  function pickHtml() {
    var t = T();
    if (!draftCatalogue.length) return '<div class="hx-eco-empty"><b>' + esc(t.noCatalogue) + '</b><p>' + esc(t.noCatalogueD) + '</p></div>';
    return draftCatalogue.map(function (entry, i) {
      var it = item(entry.itemId), units = unitsOf(it), def = entry.countingUnit && units.indexOf(entry.countingUnit) >= 0 ? entry.countingUnit : units[0];
      return '<div class="hx-req-pick-row" data-pick="' + i + '"><span class="hx-req-pick-name"><b>' + esc(it ? it.name : entry.itemId) + '</b><small>' + esc(entry.itemId) + '</small></span>' +
        '<input data-pick-qty type="number" min="0" step="any" inputmode="decimal" placeholder="0" aria-label="' + esc(t.qty + ' · ' + (it ? it.name : entry.itemId)) + '">' +
        '<select data-pick-unit aria-label="' + esc(t.unit + ' · ' + (it ? it.name : entry.itemId)) + '">' + units.map(function (u) { return '<option value="' + esc(u) + '"' + (u === def ? ' selected' : '') + '>' + esc(unitName(u)) + '</option>'; }).join('') + '</select></div>';
    }).join('');
  }
  async function loadDepartment(unitId) {
    var box = createRef && createRef.el.querySelector('[data-req-items]');
    draftCatalogue = [];
    try {
      var body = await getJson('/api/inventory/department-catalogue?merchant=' + encodeURIComponent(merchant()) + '&unitId=' + encodeURIComponent(unitId));
      draftCatalogue = (body.data && Array.isArray(body.data.items) ? body.data.items : []).filter(function (e) {
        var it = item(e.itemId); return e && e.active !== false && e.visibility !== 'hidden' && it && it.active !== false;
      });
    } catch (_) { draftCatalogue = []; }
    if (box && box.isConnected) box.innerHTML = pickHtml();
  }
  handlers['eco-req-new'] = function () {
    var t = T(), deps = departments();
    if (!deps.length) { Kiwi.toast(t.noUnits, { type:'warning' }); return; }
    createRef = Kiwi.modal({ tag:t.title.toUpperCase(), title:t.create, width:600, body:createBody(deps[0].id),
      foot:'<button class="kb ghost" type="button" data-dismiss>' + esc(t.cancel) + '</button><button data-activation=write class="kb atlas" type="button" data-action="eco-req-send">' + esc(t.send) + '</button>' });
    createRef.el.classList.add('hx-req-modal');
    createRef.el.addEventListener('change', function (e) { if (e.target && e.target.matches('[data-req-unit]')) loadDepartment(e.target.value); });
    loadDepartment(deps[0].id);
  };
  handlers['eco-req-send'] = async function () {
    if (pending || !createRef) return;
    var t = T(), el = createRef.el, unitId = el.querySelector('[data-req-unit]').value, note = String(el.querySelector('#hx-req-note').value || '').trim();
    var lines = [];
    el.querySelectorAll('[data-pick]').forEach(function (row) {
      var entry = draftCatalogue[Number(row.getAttribute('data-pick'))], q = Number(row.querySelector('[data-pick-qty]').value);
      if (entry && q > 0) lines.push({ itemId:entry.itemId, unit:row.querySelector('[data-pick-unit]').value, qtyRequested:q, note:note });
    });
    if (!lines.length) { Kiwi.toast(t.pickOne, { type:'warning' }); return; }
    var id = 'req-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
    var btn = el.querySelector('[data-action="eco-req-send"]'); if (btn) { btn.disabled = true; btn.setAttribute('aria-busy', 'true'); }
    pending = true;
    try {
      var created = await post({ action:'create', id:id, unitId:unitId, idempotencyKey:'ui:' + id + ':create', lines:lines });
      upsert(created);
      try {
        var sent = await post({ action:'submit', id:id, revision:created.request.revision, idempotencyKey:'ui:' + id + ':submit:r' + created.request.revision });
        upsert(sent);
        Kiwi.toast(t.sent, { type:'success' });
      } catch (_) { Kiwi.toast(t.draftSaved, { type:'warning' }); }
      createRef.close(); createRef = null;
      pending = false;
      await load();
      openSheet(id);
    } catch (e) {
      pending = false;
      Kiwi.toast(errorText(e), { type:'warning' });
      if (btn && btn.isConnected) { btn.disabled = false; btn.removeAttribute('aria-busy'); }
    }
  };

  window.KiwiEconomatRequests = {
    /* Appelé à chaque rendu de la page Économat : repeint depuis l'état en
     * mémoire, et ne charge qu'au premier montage ou après reset(). */
    mount: function (host) {
      S.host = host || null;
      paint();
      if (!S.loaded && !S.loading) load();
    },
    reset: function () { S.loaded = false; S.error = ''; },
    reload: load,
    state: function () { return S; },
  };
}());
