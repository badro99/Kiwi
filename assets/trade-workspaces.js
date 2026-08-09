/* Kiwi exact-trade workspaces
 * Functional per-tenant boards for trades whose sidebar used to open a
 * relabelled restaurant/shop/spa placeholder. The shared homepage and proven
 * catalogue/stock/finance pages are deliberately left alone. */
(function () {
  'use strict';

  const L = (fr, en, ar) => ({ fr, en, ar });
  const P = (trade, nav, kind, title, subtitle, noun, options) => ({
    trade, nav, kind, title, subtitle, noun, ...(options || {}),
  });
  const pages = [
    P('fastfood','tables','queue',L('Comptoir & bornes','Counter & kiosks','الكاونتر والأكشاك'),L('Suivez les points de commande et les incidents de service.','Track order points and service incidents.','تتبع نقاط الطلب وحوادث الخدمة.'),L('poste','station','نقطة'),{money:false}),
    P('fastfood','kds','queue',L('File de préparation','Preparation queue','قائمة التحضير'),L('Chaque commande avance de la prise en charge à la remise.','Move every order from accepted to handed over.','حرّك كل طلب من الاستلام إلى التسليم.'),L('commande','order','طلب'),{money:true}),
    P('fastfood','channels','schedule',L('Livraison & canaux','Delivery & channels','التوصيل والقنوات'),L('Centralisez les commandes et incidents de chaque canal.','Centralise orders and issues from every channel.','اجمع الطلبات والمشاكل من كل قناة.'),L('course','delivery','توصيل'),{money:true}),

    P('bakery','tables','schedule',L('Précommandes comptoir','Counter pre-orders','طلبات الكاونتر المسبقة'),L('Gâteaux, pains spéciaux et retraits promis aux clients.','Cakes, special breads and promised pickups.','الكعك والخبز الخاص ومواعيد الاستلام.'),L('précommande','pre-order','طلب مسبق'),{money:true}),
    P('bakery','kds','queue',L('Fournées & production','Batches & production','الدفعات والإنتاج'),L('Planifiez les pétrissages, cuissons et sorties de four.','Plan mixing, baking and oven releases.','خطط للعجن والخبز والخروج من الفرن.'),L('fournée','batch','دفعة'),{money:false}),
    P('bakery','waste','checklist',L('Invendus & dons','Unsold & donations','غير المباع والتبرعات'),L('Tracez les invendus, dons et réemplois de fin de journée.','Record end-of-day unsold items, donations and reuse.','سجل غير المباع والتبرعات وإعادة الاستخدام.'),L('lot','batch','دفعة'),{money:true}),

    P('pizzeria','kds','queue',L('File du four','Oven queue','قائمة الفرن'),L('Suivez façonnage, cuisson, découpe et remise.','Track shaping, baking, slicing and hand-off.','تتبع التشكيل والخبز والتقطيع والتسليم.'),L('pizza','pizza','بيتزا'),{money:true}),
    P('pizzeria','delivery','schedule',L('Livraisons','Deliveries','التوصيلات'),L('Adresses, heures promises et état des courses.','Addresses, promised times and delivery status.','العناوين والمواعيد وحالة التوصيل.'),L('livraison','delivery','توصيل'),{money:true}),

    P('traiteur','tables','schedule',L('Planning événements','Event schedule','جدول الفعاليات'),L('Pilotez chaque réception, ses échéances et son état.','Run every event, deadline and status.','أدر كل فعالية ومواعيدها وحالتها.'),L('événement','event','فعالية'),{money:true}),
    P('traiteur','kds','queue',L('Production cuisine','Kitchen production','إنتاج المطبخ'),L('Découpez les événements en lots de production actionnables.','Break events into actionable production batches.','قسّم الفعاليات إلى دفعات إنتاج قابلة للتنفيذ.'),L('lot de production','production batch','دفعة إنتاج'),{money:false}),
    P('traiteur','quotes','schedule',L('Devis & événements','Quotes & events','العروض والفعاليات'),L('Suivez les demandes de devis jusqu’à la confirmation.','Track quote requests through confirmation.','تتبع طلبات العروض حتى التأكيد.'),L('devis','quote','عرض'),{money:true}),
    P('traiteur','deposits','ledger',L('Acomptes & soldes','Deposits & balances','التسبيقات والأرصدة'),L('Gardez une vue nette des montants reçus et restant à encaisser.','Keep a clear view of amounts received and outstanding.','احتفظ برؤية واضحة للمبالغ المقبوضة والمتبقية.'),L('échéance','payment milestone','استحقاق'),{money:true}),

    P('foodtruck','tables','schedule',L('Emplacements & tournées','Spots & rounds','المواقع والجولات'),L('Préparez les arrêts, horaires et autorisations de la tournée.','Plan stops, hours and route permits.','خطط للمحطات والمواعيد والتراخيص.'),L('arrêt','stop','محطة'),{money:false}),
    P('foodtruck','kds','queue',L('File de service','Service queue','قائمة الخدمة'),L('Gardez la préparation rapide même pendant le rush.','Keep preparation moving during the rush.','حافظ على سرعة التحضير وقت الذروة.'),L('commande','order','طلب'),{money:true}),
    P('foodtruck','vehicle','checklist',L('Camion & tournée','Truck & route','الشاحنة والجولة'),L('Ouverture, énergie, eau, froid et fermeture du camion.','Opening, power, water, cold chain and truck close.','الفتح والطاقة والماء والتبريد وإغلاق الشاحنة.'),L('contrôle','check','فحص'),{money:false}),

    P('epicerie','returns','checklist',L('Retours & casse','Returns & breakage','المرتجعات والتالف'),L('Tracez les retours, écarts, produits cassés et pertes.','Track returns, discrepancies, breakage and loss.','تتبع المرتجعات والفروقات والتالف والخسائر.'),L('incident','incident','حادث'),{money:true}),
    P('epicerie','credit','ledger',L('Carnet de crédit','Credit ledger','دفتر الديون'),L('Suivez chaque crédit client et son règlement, sans perdre le contexte.','Track every customer credit and settlement with full context.','تتبع كل دين للعميل وتسويته مع كامل التفاصيل.'),L('crédit','credit entry','دين'),{money:true}),
    P('epicerie','suppliers','schedule',L('Fournisseurs','Suppliers','الموردون'),L('Commandes, livraisons attendues et problèmes fournisseur.','Orders, expected deliveries and supplier issues.','الطلبات والتوصيلات المتوقعة ومشاكل الموردين.'),L('livraison fournisseur','supplier delivery','توصيل مورد'),{money:true}),

    P('pharmacie','returns','checklist',L('Retours laboratoires','Lab returns','مرتجعات المختبرات'),L('Isolez et suivez chaque lot retourné au laboratoire.','Isolate and follow every lot returned to the lab.','اعزل وتتبع كل دفعة معادة للمختبر.'),L('retour','return','إرجاع'),{money:true}),
    P('pharmacie','prescriptions','queue',L('Ordonnances','Prescriptions','الوصفات الطبية'),L('Une file claire de la réception à la délivrance.','A clear queue from intake to dispensing.','قائمة واضحة من الاستلام إلى التسليم.'),L('ordonnance','prescription','وصفة'),{money:true}),
    P('pharmacie','insurers','ledger',L('Tiers payant','Third-party payer','الدفع من طرف ثالث'),L('Suivez les dossiers envoyés, acceptés, rejetés ou réglés.','Track submitted, accepted, rejected and paid claims.','تتبع الملفات المرسلة والمقبولة والمرفوضة والمؤداة.'),L('dossier','claim','ملف'),{money:true}),
    P('pharmacie','expiries','checklist',L('Lots à surveiller','Expiry watch','مراقبة الصلاحية'),L('Priorisez les lots proches de leur date limite.','Prioritise lots approaching their limit date.','أعط الأولوية للدفعات القريبة من انتهاء الصلاحية.'),L('lot','lot','دفعة'),{money:true}),
    P('pharmacie','duty','schedule',L('Gardes & relève','Duty & handover','الحراسة والتسليم'),L('Organisez les gardes et les points de relève importants.','Organise duty shifts and important handover notes.','نظم الحراسة وملاحظات التسليم المهمة.'),L('relève','handover','تسليم'),{money:false}),

    P('librairie','returns','checklist',L('Retours éditeurs','Publisher returns','مرتجعات الناشرين'),L('Regroupez les titres à retourner et leur validation.','Group titles to return and their approval.','اجمع العناوين المراد إرجاعها وموافقتها.'),L('retour','return','إرجاع'),{money:true}),
    P('librairie','bookorders','queue',L('Commandes spéciales','Special orders','الطلبات الخاصة'),L('Retrouvez chaque demande lecteur jusqu’à sa remise.','Follow every reader request through hand-off.','تتبع كل طلب قارئ حتى التسليم.'),L('commande','order','طلب'),{money:true}),
    P('librairie','schoollists','checklist',L('Listes scolaires','School lists','اللوائح المدرسية'),L('Préparez les listes par école, niveau et famille.','Prepare lists by school, year and family.','حضّر اللوائح حسب المدرسة والمستوى والعائلة.'),L('liste','list','لائحة'),{money:true}),

    P('fleuriste','returns','checklist',L('Pertes & invendus','Waste & unsold','الفاقد وغير المباع'),L('Mesurez les pertes par variété et par arrivage.','Measure waste by variety and arrival.','قس الخسائر حسب الصنف والوصول.'),L('perte','loss','خسارة'),{money:true}),
    P('fleuriste','flowerorders','schedule',L('Commandes & occasions','Orders & occasions','الطلبات والمناسبات'),L('Brief, carte, budget et heure promise dans une seule fiche.','Brief, card, budget and promised time in one record.','التفاصيل والبطاقة والميزانية والموعد في ملف واحد.'),L('commande','order','طلب'),{money:true}),
    P('fleuriste','delivery','schedule',L('Tournée livraisons','Delivery route','جولة التوصيل'),L('Ordonnez les courses et suivez chaque remise.','Sequence deliveries and track every hand-off.','رتب التوصيلات وتتبع كل تسليم.'),L('livraison','delivery','توصيل'),{money:true}),
    P('fleuriste','freshness','checklist',L('Fraîcheur & pertes','Freshness & waste','الطزاجة والفاقد'),L('Repérez les arrivages à travailler en priorité.','Spot arrivals that need priority handling.','حدد الواردات التي تحتاج أولوية.'),L('arrivage','arrival','وصول'),{money:true}),

    P('spa','appointments','schedule',L('Agenda & cabines','Diary & rooms','المواعيد والغرف'),L('Rendez-vous, cabine et préparation au même endroit.','Appointments, room and preparation in one place.','المواعيد والغرفة والتحضير في مكان واحد.'),L('rendez-vous','appointment','موعد'),{money:true}),
    P('spa','services','catalog',L('Soins & rituels','Treatments & rituals','العلاجات والطقوس'),L('Tenez les durées, prix et protocoles à jour.','Keep durations, prices and protocols current.','حافظ على تحديث المدد والأسعار والبروتوكولات.'),L('soin','treatment','علاج'),{money:true,date:false}),
    P('spa','practitioners','people',L('Praticien·ne·s','Practitioners','الممارسون'),L('Spécialités, disponibilité et notes d’équipe.','Specialties, availability and team notes.','التخصصات والتوفر وملاحظات الفريق.'),L('praticien·ne','practitioner','ممارس'),{money:false,date:false}),
    P('spa','clients','people',L('Parcours clients','Guest journeys','مسار العملاء'),L('Préférences, contre-indications et suivi relationnel.','Preferences, contraindications and relationship history.','التفضيلات وموانع الاستعمال وتتبع العلاقة.'),L('client','guest','عميل'),{money:false,date:false}),
    P('spa','packages','ledger',L('Cures & cartes cadeaux','Packages & gift cards','الباقات وبطاقات الهدايا'),L('Suivez les séances consommées, restantes et les cartes cadeaux.','Track used and remaining sessions and gift cards.','تتبع الجلسات المستعملة والمتبقية وبطاقات الهدايا.'),L('formule','package','باقة'),{money:true}),

    P('coiffure','appointments','schedule',L('Agenda & rendez-vous','Diary & appointments','المفكرة والمواعيد'),L('Heure, prestation, fauteuil et préparation client.','Time, service, chair and client preparation.','الوقت والخدمة والكرسي وتحضير العميل.'),L('rendez-vous','appointment','موعد'),{money:true}),
    P('coiffure','services','catalog',L('Prestations & forfaits','Services & packages','الخدمات والباقات'),L('Prix, durée et protocole de chaque prestation.','Price, duration and protocol for every service.','السعر والمدة والبروتوكول لكل خدمة.'),L('prestation','service','خدمة'),{money:true,date:false}),
    P('coiffure','practitioners','people',L('Coiffeur·euse·s','Stylists','المصففون'),L('Spécialités, planning et suivi de l’équipe.','Specialties, schedule and team follow-up.','التخصصات والجدول وتتبع الفريق.'),L('coiffeur·euse','stylist','مصفف'),{money:false,date:false}),
    P('coiffure','clients','people',L('Fiches clients','Client records','ملفات العملاء'),L('Préférences, historique et consentements dans une fiche utile.','Preferences, history and consent in a useful record.','التفضيلات والسجل والموافقات في ملف مفيد.'),L('client','client','عميل'),{money:false,date:false}),
    P('coiffure','formulas','catalog',L('Formules couleur','Colour formulas','تركيبات الصبغة'),L('Mémorisez les mélanges et résultats validés par client.','Save mixtures and client-approved results.','احفظ الخلطات والنتائج المعتمدة لكل عميل.'),L('formule','formula','تركيبة'),{money:false,date:false}),
    P('coiffure','chairs','queue',L('Fauteuils & flux','Chairs & flow','الكراسي والتدفق'),L('Visualisez attente, prise en charge et fin de prestation.','See waiting, in service and service completion.','اعرض الانتظار والخدمة ونهاية الخدمة.'),L('passage','visit','زيارة'),{money:true}),

    P('sport','appointments','schedule',L('Planning & cours','Schedule & classes','الجدول والحصص'),L('Cours, capacité et suivi de remplissage.','Classes, capacity and attendance tracking.','الحصص والسعة وتتبع الحضور.'),L('cours','class','حصة'),{money:true}),
    P('sport','services','catalog',L('Abonnements & cours','Memberships & classes','الاشتراكات والحصص'),L('Offres, durées, prix et conditions clairement tenus.','Keep plans, durations, prices and terms clear.','حافظ على وضوح العروض والمدد والأسعار والشروط.'),L('offre','plan','عرض'),{money:true,date:false}),
    P('sport','practitioners','people',L('Coachs','Coaches','المدربون'),L('Spécialités, disponibilités et cours assignés.','Specialties, availability and assigned classes.','التخصصات والتوفر والحصص المسندة.'),L('coach','coach','مدرب'),{money:false,date:false}),
    P('sport','clients','people',L('Adhérents','Members','الأعضاء'),L('Statut, formule et notes utiles pour chaque adhérent.','Status, plan and useful notes for every member.','الحالة والاشتراك والملاحظات لكل عضو.'),L('adhérent','member','عضو'),{money:true,date:false}),
    P('sport','checkins','queue',L('Contrôle d’accès','Access control','مراقبة الدخول'),L('Une file de passages fiable pour l’accueil.','A reliable check-in flow for the front desk.','تدفق دخول موثوق للاستقبال.'),L('passage','check-in','دخول'),{money:false}),
    P('sport','renewals','ledger',L('Renouvellements','Renewals','التجديدات'),L('Anticipez les échéances et suivez les relances.','Anticipate expiry dates and track follow-ups.','توقع تواريخ الانتهاء وتتبع المتابعات.'),L('renouvellement','renewal','تجديد'),{money:true}),

    P('autre','workflows','queue',L('Suivi d’activité','Work tracking','تتبع النشاط'),L('Créez votre propre flux et faites avancer chaque dossier.','Create your own flow and move every job forward.','أنشئ مسارك الخاص وحرّك كل ملف.'),L('dossier','job','ملف'),{money:true}),
    P('autre','returns','checklist',L('Retours & incidents','Returns & incidents','المرتجعات والحوادث'),L('Conservez un historique clair des exceptions de votre activité.','Keep a clear history of business exceptions.','احتفظ بسجل واضح لاستثناءات نشاطك.'),L('incident','incident','حادث'),{money:true}),
  ];

  const map = Object.create(null);
  pages.forEach((p) => { map[p.trade + ':' + p.nav] = p; });
  const pick = (o) => o == null ? '' : (o[lang()] ?? o.fr ?? '');
  const lang = () => (window.KiwiI18n?.getLang?.() || 'fr');
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const UI = {
    add:L('Ajouter','Add','إضافة'), edit:L('Modifier','Edit','تعديل'), remove:L('Supprimer','Delete','حذف'), advance:L('Étape suivante','Next step','المرحلة التالية'),
    active:L('Actifs','Active','نشطة'), today:L("Prévus aujourd’hui",'Due today','مقررة اليوم'), sales:L("Ventes aujourd’hui",'Sales today','مبيعات اليوم'),
    emptyTitle:L('Tout est prêt pour commencer.','Everything is ready to start.','كل شيء جاهز للبدء.'),
    emptyHint:L('Ajoutez le premier élément. Kiwi le conserve pour cet établissement et le synchronise sur vos appareils.','Add the first item. Kiwi keeps it for this location and syncs it across your devices.','أضف أول عنصر. يحتفظ به Kiwi لهذا الموقع ويزامنه بين أجهزتك.'),
    name:L('Nom ou référence','Name or reference','الاسم أو المرجع'), date:L('Date ou échéance','Date or deadline','التاريخ أو الموعد'), amount:L('Montant (MAD)','Amount (MAD)','المبلغ (درهم)'), status:L('Statut','Status','الحالة'), note:L('Détails utiles','Useful details','تفاصيل مفيدة'),
    cancel:L('Annuler','Cancel','إلغاء'), save:L('Enregistrer','Save','حفظ'), saved:L('Enregistré','Saved','تم الحفظ'), deleted:L('Supprimé','Deleted','تم الحذف'),
    deleteTitle:L('Supprimer cet élément ?','Delete this item?','حذف هذا العنصر؟'), deleteHint:L('Il disparaîtra aussi des autres appareils synchronisés.','It will also disappear from synced devices.','سيختفي أيضاً من الأجهزة المتزامنة.'),
    currency:L('MAD','MAD','درهم'), noDate:L('Sans échéance','No deadline','بدون موعد'),
  };
  const STATUS = {
    queue:[L('À prendre','To accept','للاستلام'),L('En cours','In progress','قيد التنفيذ'),L('Prêt','Ready','جاهز'),L('Terminé','Done','مكتمل')],
    schedule:[L('À confirmer','To confirm','للتأكيد'),L('Confirmé','Confirmed','مؤكد'),L('En cours','In progress','قيد التنفيذ'),L('Terminé','Done','مكتمل')],
    checklist:[L('À traiter','To do','للمعالجة'),L('En cours','In progress','قيد التنفيذ'),L('Terminé','Done','مكتمل')],
    ledger:[L('Ouvert','Open','مفتوح'),L('Partiel','Partial','جزئي'),L('Réglé','Settled','مسوى')],
    catalog:[L('Actif','Active','نشط'),L('En pause','Paused','متوقف'),L('Archivé','Archived','مؤرشف')],
    people:[L('Actif','Active','نشط'),L('En pause','Paused','متوقف'),L('Archivé','Archived','مؤرشف')],
  };

  let openPage = null;
  let cloud = null;
  function venue() { try { return window.KiwiVenue?.getCurrentVenueData?.() || {}; } catch (_) { return {}; } }
  function venueId() { const v = venue(); return String(v.id || window.KiwiVenue?.getVenue?.() || 'venue'); }
  function trade() { return String(venue().subtype || ''); }
  function key() { return 'kiwi:workspaces:v1:' + venueId(); }
  function blank() { return { trade: trade(), records: {} }; }
  function read() {
    try {
      const d = JSON.parse(localStorage.getItem(key()) || 'null');
      return d && d.records && typeof d.records === 'object' ? d : blank();
    } catch (_) { return blank(); }
  }
  function write(d) {
    const safe = d && d.records ? d : blank();
    safe.trade = trade() || safe.trade || '';
    try { localStorage.setItem(key(), JSON.stringify(safe)); } catch (_) {}
    if (openPage && config(openPage.nav)) render(openPage.nav);
  }
  function merge(a, b) {
    const out = { trade: (a && a.trade) || (b && b.trade) || trade(), records: {} };
    const ar = (a && a.records) || {}, br = (b && b.records) || {};
    new Set(Object.keys(ar).concat(Object.keys(br))).forEach((nav) => {
      const byId = Object.create(null);
      [].concat(ar[nav] || [], br[nav] || []).forEach((r) => {
        if (!r || !r.id) return;
        const prev = byId[r.id];
        if (!prev || (+r.updatedAt || 0) >= (+prev.updatedAt || 0)) byId[r.id] = r;
      });
      out.records[nav] = Object.values(byId).sort((x,y) => (+y.updatedAt||0)-(+x.updatedAt||0)).slice(0,500);
    });
    return out;
  }
  function bindCloud() {
    if (!cloud && window.KiwiCloudDoc?.attach) {
      cloud = window.KiwiCloudDoc.attach({
        feature:'workspaces', read, write, merge,
        isEmpty:(d) => !d || !d.records || !Object.values(d.records).some((a) => Array.isArray(a) && a.some((r) => r && !r.deletedAt)),
        localKey:key,
      });
    }
    try { cloud?.bind?.(); } catch (_) {}
  }
  function config(nav) { return map[trade() + ':' + nav] || null; }
  function rows(nav, includeDeleted) {
    const a = read().records[nav] || [];
    return includeDeleted ? a.slice() : a.filter((r) => !r.deletedAt);
  }
  function saveRecord(cfg, record) {
    const d = read(), all = (d.records[cfg.nav] || []).slice();
    const i = all.findIndex((r) => r.id === record.id);
    if (i < 0) all.unshift(record); else all[i] = record;
    d.records[cfg.nav] = all.slice(0,500); write(d); bindCloud(); cloud?.push?.(0);
  }
  function currentSales() {
    try { return window.KiwiSales?.list?.(venueId()) || []; } catch (_) { return []; }
  }
  function dayKey(value) {
    if (!value) return '';
    const d = new Date(value.length === 10 ? value + 'T12:00:00' : value);
    return Number.isNaN(d.getTime()) ? '' : [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
  }
  function todayKey() { return dayKey(new Date().toISOString()); }
  function money(n) { try { return Math.round(+n || 0).toLocaleString(lang()==='ar'?'ar-MA':'fr-FR'); } catch (_) { return String(Math.round(+n || 0)); } }
  function displayDate(v) {
    if (!v) return pick(UI.noDate);
    try { return new Date(v + 'T12:00:00').toLocaleDateString(lang()==='ar'?'ar-MA':lang(), { day:'numeric', month:'short', year:'numeric' }); } catch (_) { return v; }
  }
  function statusList(cfg) { return STATUS[cfg.kind] || STATUS.queue; }
  function statusLabel(cfg, index) { const a=statusList(cfg); return pick(a[Math.max(0,Math.min(a.length-1,+index||0))]); }
  function recordCard(cfg, r) {
    const a=statusList(cfg), done=(+r.status||0)>=a.length-1;
    return `<article class="tw-card" data-tw-id="${esc(r.id)}">
      <div class="tw-card-head"><h3>${esc(r.title)}</h3><span class="tw-pill">${esc(statusLabel(cfg,r.status))}</span></div>
      ${r.note ? `<p>${esc(r.note)}</p>` : ''}
      <div class="tw-meta">${cfg.date!==false?`<span>${esc(displayDate(r.date))}</span>`:''}${cfg.money?`<span>${money(r.amount)} ${esc(pick(UI.currency))}</span>`:''}</div>
      <div class="tw-card-actions">${done?'':`<button class="tw-action primary" type="button" data-tw-next="${esc(r.id)}">${esc(pick(UI.advance))}</button>`}<button class="tw-action" type="button" data-tw-edit="${esc(r.id)}">${esc(pick(UI.edit))}</button><button class="tw-action danger" type="button" data-tw-delete="${esc(r.id)}">${esc(pick(UI.remove))}</button></div>
    </article>`;
  }
  function render(nav) {
    const cfg=config(nav); if (!cfg || !window.Kiwi?.appPage) return false;
    openPage=cfg; bindCloud();
    const active=rows(nav), now=todayKey(), due=active.filter((r)=>r.date===now).length;
    const start=new Date(); start.setHours(0,0,0,0);
    const sales=currentSales().filter((s)=>(+s.ts||0)>=start.getTime());
    const revenue=sales.reduce((n,s)=>n+(+s.amount||0),0);
    const board=active.length ? `<div class="tw-grid">${active.map((r)=>recordCard(cfg,r)).join('')}</div>` : `<div class="tw-empty"><div class="tw-empty-inner"><div class="tw-empty-mark" aria-hidden="true">＋</div><h3>${esc(pick(UI.emptyTitle))}</h3><p>${esc(pick(UI.emptyHint))}</p><button class="tw-add" type="button" data-tw-add>${esc(pick(UI.add))} ${esc(pick(cfg.noun))}</button></div></div>`;
    const body=`<section class="tw-shell" data-tw-page="${esc(nav)}">
      <div class="tw-summary"><div class="tw-stat"><span>${esc(pick(UI.active))}</span><strong>${active.length}</strong></div><div class="tw-stat"><span>${esc(pick(UI.today))}</span><strong>${due}</strong></div><div class="tw-stat"><span>${esc(pick(UI.sales))}</span><strong>${sales.length} · ${money(revenue)} ${esc(pick(UI.currency))}</strong></div></div>
      <div class="tw-toolbar"><div class="tw-toolbar-copy"><strong>${esc(pick(cfg.title))}</strong><span>${esc(pick(cfg.subtitle))}</span></div><button class="tw-add" type="button" data-tw-add>${esc(pick(UI.add))} ${esc(pick(cfg.noun))}</button></div>
      <div class="tw-board">${board}</div></section>`;
    const out=window.Kiwi.appPage(nav,{title:pick(cfg.title),subtitle:(venue().name||'')+' · '+pick(cfg.subtitle),body});
    wire(out?.el || document.querySelector('[data-tw-page]'),cfg); return true;
  }
  function modalForm(cfg, existing) {
    if (!window.Kiwi?.modal) return;
    const r=existing||{}, statuses=statusList(cfg);
    const m=window.Kiwi.modal({title:(existing?pick(UI.edit):pick(UI.add))+' '+pick(cfg.noun),width:620,body:`<form class="tw-form" data-tw-form>
      <div class="tw-field full"><label for="tw-title">${esc(pick(UI.name))}</label><input id="tw-title" name="title" required maxlength="140" value="${esc(r.title||'')}"></div>
      ${cfg.date===false?'':`<div class="tw-field"><label for="tw-date">${esc(pick(UI.date))}</label><input id="tw-date" name="date" type="date" value="${esc(r.date||'')}"></div>`}
      ${cfg.money?`<div class="tw-field"><label for="tw-amount">${esc(pick(UI.amount))}</label><input id="tw-amount" name="amount" type="number" min="0" step="0.01" inputmode="decimal" value="${r.amount==null?'':esc(r.amount)}"></div>`:''}
      <div class="tw-field${cfg.date===false&&!cfg.money?' full':''}"><label for="tw-status">${esc(pick(UI.status))}</label><select id="tw-status" name="status">${statuses.map((s,i)=>`<option value="${i}"${(+r.status||0)===i?' selected':''}>${esc(pick(s))}</option>`).join('')}</select></div>
      <div class="tw-field full"><label for="tw-note">${esc(pick(UI.note))}</label><textarea id="tw-note" name="note" maxlength="1200">${esc(r.note||'')}</textarea></div>
      <div class="tw-field full tw-modal-actions"><button class="tw-cancel" type="button" data-tw-cancel>${esc(pick(UI.cancel))}</button><button class="tw-save" type="submit">${esc(pick(UI.save))}</button></div></form>`});
    const form=m.el.querySelector('[data-tw-form]');
    m.el.querySelector('[data-tw-cancel]').onclick=()=>m.close();
    form.onsubmit=(e)=>{e.preventDefault();const fd=new FormData(form),now=Date.now();const title=String(fd.get('title')||'').trim();if(!title)return;saveRecord(cfg,{id:r.id||('tw-'+now.toString(36)+'-'+Math.random().toString(36).slice(2,7)),title,date:cfg.date===false?'':String(fd.get('date')||''),amount:cfg.money?Math.max(0,+fd.get('amount')||0):0,status:+fd.get('status')||0,note:String(fd.get('note')||'').trim(),createdAt:r.createdAt||now,updatedAt:now,deletedAt:0});m.close();window.Kiwi.toast?.(pick(UI.saved),{type:'success'});};
  }
  function confirmDelete(cfg,r) {
    const m=window.Kiwi.modal({title:pick(UI.deleteTitle),desc:esc(pick(UI.deleteHint)),width:450,body:`<div class="tw-modal-actions"><button class="tw-cancel" type="button" data-tw-cancel>${esc(pick(UI.cancel))}</button><button class="tw-save" type="button" data-tw-confirm>${esc(pick(UI.remove))}</button></div>`});
    m.el.querySelector('[data-tw-cancel]').onclick=()=>m.close();m.el.querySelector('[data-tw-confirm]').onclick=()=>{saveRecord(cfg,{...r,deletedAt:Date.now(),updatedAt:Date.now()});m.close();window.Kiwi.toast?.(pick(UI.deleted),{type:'success'});};
  }
  function wire(host,cfg) {
    if(!host||host.__twWired)return;host.__twWired=true;host.addEventListener('click',(e)=>{const add=e.target.closest('[data-tw-add]');if(add)return modalForm(cfg);const edit=e.target.closest('[data-tw-edit]');if(edit){const r=rows(cfg.nav).find((x)=>x.id===edit.dataset.twEdit);if(r)modalForm(cfg,r);return;}const del=e.target.closest('[data-tw-delete]');if(del){const r=rows(cfg.nav).find((x)=>x.id===del.dataset.twDelete);if(r)confirmDelete(cfg,r);return;}const next=e.target.closest('[data-tw-next]');if(next){const r=rows(cfg.nav).find((x)=>x.id===next.dataset.twNext);if(r){const max=statusList(cfg).length-1;saveRecord(cfg,{...r,status:Math.min(max,(+r.status||0)+1),updatedAt:Date.now()});}return;}});
  }
  function install() {
    const H=window.Kiwi?.handlers;if(!H)return;
    [...new Set(pages.map((p)=>p.nav))].forEach((nav)=>{const key='nav-'+nav,orig=H[key];if(orig?.__kiwiTradeWorkspace)return;const fn=function(){return config(nav)?render(nav):(orig?orig.apply(this,arguments):undefined);};fn.__kiwiTradeWorkspace=true;fn.__kiwiTradeOriginal=orig;H[key]=fn;});
  }
  document.addEventListener('click',(e)=>{const a=e.target.closest?.('.sidebar a[data-nav]');if(!a)return;const nav=a.dataset.nav;if(!config(nav))return;e.preventDefault();e.stopImmediatePropagation();render(nav);},true);
  window.addEventListener('load',()=>{setTimeout(()=>{bindCloud();install();},280);window.KiwiVenue?.subscribe?.(()=>{openPage=null;bindCloud();setTimeout(install,0);});window.KiwiSales?.subscribe?.(()=>{if(openPage&&document.querySelector('[data-tw-page]'))render(openPage.nav);});window.addEventListener('kiwi:langchange',()=>{if(openPage&&document.querySelector('[data-tw-page]'))render(openPage.nav);});});
  window.KiwiTradeWorkspaces={pages,config,read,write,merge,render,rows};
})();
