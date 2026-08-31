/* Kiwi Reservations — one tenant-safe booking truth for dashboard and public page. */
(function () {
  'use strict';

  var VERSION = 1;
  var ACTIVE = { requested: 1, confirmed: 1, checked_in: 1 };
  var DONE = { completed: 1, cancelled: 1, no_show: 1 };
  var store = null;
  var open = false;
  function normalizePhone(value) {
    var raw = cleanText(value, 32);
    return !raw ? '' : (window.KiwiPhone ? window.KiwiPhone.normalize(raw) : raw);
  }

  var COPY = {
    fr: {
      title: 'Réservations', subtitle: 'Un agenda clair, relié au travail réel de votre établissement.',
      today: "Aujourd'hui", upcoming: 'À venir', needs: 'À confirmer', occupancy: 'Occupation',
      add: 'Nouvelle réservation', share: 'Lien de réservation', settings: 'Configurer',
      all: 'Toutes', confirmed: 'Confirmées', requested: 'À confirmer', completed: 'Terminées',
      emptyTitle: 'Votre agenda est prêt', emptyBody: 'Ajoutez un service et une ressource, puis ouvrez les réservations en ligne.', stepService: 'Un service', stepResource: 'Une ressource', stepOnline: 'Réservations en ligne',
      setup: 'Configurer les réservations', noService: 'Aucun service actif', noResource: 'Aucune ressource active',
      client: 'Client', phone: 'Téléphone', email: 'E-mail', service: 'Service', resource: 'Ressource',
      anyResource: 'Première disponibilité', start: 'Date et heure', guests: 'Personnes', note: 'Note interne',
      save: 'Enregistrer', cancel: 'Annuler', edit: 'Modifier', confirm: 'Confirmer', checkin: 'Arrivé',
      complete: 'Terminer', noShow: 'Absent', cancelled: 'Annulée', conflict: 'Ce créneau vient d’être pris. Choisissez une autre heure.',
      invalid: 'Vérifiez les champs obligatoires.', saved: 'Réservation enregistrée',
      setupTitle: 'Paramètres de réservation', publicLabel: 'Accepter les réservations en ligne',
      notice: 'Préavis minimum', window: 'Réservable sur', cancelDelay: "Délai d'annulation", direct: 'Confirmation immédiate',
      minutes: 'minutes', days: 'jours', hours: 'heures', businessHours: "Les disponibilités suivent les horaires de l’établissement.",
      services: 'Services', resources: 'Équipe & ressources', addService: 'Ajouter un service', addResource: 'Ajouter une ressource',
      name: 'Nom', duration: 'Durée', price: 'Prix', deposit: 'Acompte', kind: 'Type', active: 'Visible en ligne',
      person: 'Membre de l’équipe', room: 'Espace / cabine', table: 'Table', capacity: 'Capacité',
      linkCopied: 'Lien copié', linkOff: 'Activez les réservations en ligne avant de partager le lien.',
      linkTitle: 'Votre lien de réservation', linkBody: 'Ce lien utilise les mêmes disponibilités et réservations que ce tableau.',
      copy: 'Copier le lien', openLink: 'Ouvrir', settingsSaved: 'Paramètres enregistrés',
      overview: 'Vue agenda', configuration: 'Configuration', past: 'Passées', status: 'Statut',
      unavailable: 'Configurez au moins un service et une ressource actifs.', delete: 'Supprimer',
      requestedStatus: 'À confirmer', confirmedStatus: 'Confirmée', checked_inStatus: 'Client arrivé',
      completedStatus: 'Terminée', cancelledStatus: 'Annulée', no_showStatus: 'Absent',
      sourcePublic: 'En ligne', sourceStaff: 'Équipe', sourceImport: 'Importée',
      todayEmpty: "Aucune réservation aujourd'hui", onlineOff: 'Réservation en ligne fermée', onlineOn: 'Réservation en ligne ouverte'
    },
    en: {
      title: 'Bookings', subtitle: 'A clear diary connected to the real work of your venue.', today: 'Today', upcoming: 'Upcoming', needs: 'To confirm', occupancy: 'Occupancy',
      add: 'New booking', share: 'Booking link', settings: 'Configure', all: 'All', confirmed: 'Confirmed', requested: 'To confirm', completed: 'Completed',
      emptyTitle: 'Your diary is ready', emptyBody: 'Add a service and a resource, then open online booking.', stepService: 'A service', stepResource: 'A resource', stepOnline: 'Online booking', setup: 'Set up bookings', noService: 'No active service', noResource: 'No active resource',
      client: 'Customer', phone: 'Phone', email: 'Email', service: 'Service', resource: 'Resource', anyResource: 'First available', start: 'Date and time', guests: 'Guests', note: 'Internal note',
      save: 'Save', cancel: 'Cancel', edit: 'Edit', confirm: 'Confirm', checkin: 'Check in', complete: 'Complete', noShow: 'No-show', cancelled: 'Cancelled', conflict: 'That slot was just taken. Choose another time.', invalid: 'Check the required fields.', saved: 'Booking saved',
      setupTitle: 'Booking settings', publicLabel: 'Accept online bookings', notice: 'Minimum notice', window: 'Bookable for', cancelDelay: 'Cancellation deadline', direct: 'Instant confirmation', minutes: 'minutes', days: 'days', hours: 'hours', businessHours: 'Availability follows the venue opening hours.',
      services: 'Services', resources: 'Team & resources', addService: 'Add service', addResource: 'Add resource', name: 'Name', duration: 'Duration', price: 'Price', deposit: 'Deposit', kind: 'Type', active: 'Visible online', person: 'Team member', room: 'Room / space', table: 'Table', capacity: 'Capacity',
      linkCopied: 'Link copied', linkOff: 'Turn on online booking before sharing the link.', linkTitle: 'Your booking link', linkBody: 'This link uses the same availability and bookings as this dashboard.', copy: 'Copy link', openLink: 'Open', settingsSaved: 'Settings saved', overview: 'Diary', configuration: 'Configuration', past: 'Past', status: 'Status', unavailable: 'Configure at least one active service and resource.', delete: 'Delete',
      requestedStatus: 'To confirm', confirmedStatus: 'Confirmed', checked_inStatus: 'Checked in', completedStatus: 'Completed', cancelledStatus: 'Cancelled', no_showStatus: 'No-show', sourcePublic: 'Online', sourceStaff: 'Team', sourceImport: 'Imported', todayEmpty: 'No bookings today', onlineOff: 'Online booking closed', onlineOn: 'Online booking open'
    },
    ar: {
      title: 'الحجوزات', subtitle: 'جدول واضح مرتبط بالعمل الفعلي للمؤسسة.', today: 'اليوم', upcoming: 'القادمة', needs: 'بانتظار التأكيد', occupancy: 'نسبة الإشغال', add: 'حجز جديد', share: 'رابط الحجز', settings: 'الإعدادات', all: 'الكل', confirmed: 'المؤكدة', requested: 'بانتظار التأكيد', completed: 'المنتهية', emptyTitle: 'جدول الحجوزات جاهز', emptyBody: 'أضف خدمة ومورداً ثم فعّل الحجز عبر الإنترنت.', stepService: 'خدمة', stepResource: 'مورد', stepOnline: 'الحجز عبر الإنترنت', setup: 'إعداد الحجوزات', noService: 'لا توجد خدمة مفعّلة', noResource: 'لا يوجد مورد مفعّل', client: 'العميل', phone: 'الهاتف', email: 'البريد الإلكتروني', service: 'الخدمة', resource: 'المورد', anyResource: 'أول موعد متاح', start: 'التاريخ والوقت', guests: 'عدد الأشخاص', note: 'ملاحظة داخلية', save: 'حفظ', cancel: 'إلغاء', edit: 'تعديل', confirm: 'تأكيد', checkin: 'وصل العميل', complete: 'إنهاء', noShow: 'لم يحضر', cancelled: 'ملغى', conflict: 'تم حجز هذا الموعد للتو. اختر وقتاً آخر.', invalid: 'تحقق من الحقول المطلوبة.', saved: 'تم حفظ الحجز', setupTitle: 'إعدادات الحجز', publicLabel: 'قبول الحجوزات عبر الإنترنت', notice: 'الحد الأدنى للإشعار', window: 'فترة الحجز المتاحة', cancelDelay: 'مهلة الإلغاء', direct: 'تأكيد فوري', minutes: 'دقيقة', days: 'يوماً', hours: 'ساعات', businessHours: 'تتبع المواعيد ساعات عمل المؤسسة.', services: 'الخدمات', resources: 'الفريق والموارد', addService: 'إضافة خدمة', addResource: 'إضافة مورد', name: 'الاسم', duration: 'المدة', price: 'السعر', deposit: 'العربون', kind: 'النوع', active: 'ظاهر على الإنترنت', person: 'عضو من الفريق', room: 'قاعة أو غرفة', table: 'طاولة', capacity: 'السعة', linkCopied: 'تم نسخ الرابط', linkOff: 'فعّل الحجز عبر الإنترنت قبل مشاركة الرابط.', linkTitle: 'رابط الحجز الخاص بك', linkBody: 'يستخدم هذا الرابط نفس المواعيد والحجوزات الموجودة في لوحة التحكم.', copy: 'نسخ الرابط', openLink: 'فتح', settingsSaved: 'تم حفظ الإعدادات', overview: 'الجدول', configuration: 'الإعدادات', past: 'السابقة', status: 'الحالة', unavailable: 'أضف خدمة ومورداً مفعّلين على الأقل.', delete: 'حذف', requestedStatus: 'بانتظار التأكيد', confirmedStatus: 'مؤكد', checked_inStatus: 'وصل العميل', completedStatus: 'منتهٍ', cancelledStatus: 'ملغى', no_showStatus: 'لم يحضر', sourcePublic: 'عبر الإنترنت', sourceStaff: 'الفريق', sourceImport: 'مستوردة', todayEmpty: 'لا توجد حجوزات اليوم', onlineOff: 'الحجز عبر الإنترنت مغلق', onlineOn: 'الحجز عبر الإنترنت مفتوح'
    }
  };

  var TEMPLATE_COPY = {
    fr: {
      title: 'Démarrer avec un modèle restaurant', body: 'Ajoutez une base prête à adapter. Vos services et vos tables actuels restent intacts.',
      use: 'Ajouter ce modèle', added: 'Modèle ajouté. Vérifiez les détails puis enregistrez.', already: 'Ce modèle est déjà dans votre configuration.',
      services: 'services', tables: 'tables', seats: 'couverts',
      floorTitle: 'Mon plan de salle', floorBody: 'Reprend automatiquement les tables et capacités déjà dessinées.',
      hoursReady: 'Horaires d’ouverture reliés', hoursMissing: 'Horaires à configurer', teamReady: 'Équipe reliée', teamMissing: 'Planning équipe à compléter',
      staffing: "Adapter les créneaux au planning de l’équipe", tablesPerStaff: 'Tables par membre en salle',
      cafeTitle: 'Café & petite salle', cafeBody: 'Réservation simple et service rapide pour une petite équipe.',
      classicTitle: 'Restaurant classique', classicBody: 'Déjeuner et dîner, avec tables de 2 à 6 couverts.',
      groupsTitle: 'Groupes & privatisation', groupsBody: 'Grandes tables, salon privé et demandes à confirmer.',
      tableBooking: 'Réserver une table', lunch: 'Déjeuner', dinner: 'Dîner', groupMeal: 'Repas de groupe', privateEvent: 'Privatisation',
      table: 'Table', privateRoom: 'Salon privé', groupTerrace: 'Terrasse groupe'
    },
    en: {
      title: 'Start with a restaurant template', body: 'Add a ready-to-edit foundation. Your current services and tables stay intact.',
      use: 'Add this template', added: 'Template added. Review the details, then save.', already: 'This template is already in your configuration.',
      services: 'services', tables: 'tables', seats: 'seats',
      floorTitle: 'My floor plan', floorBody: 'Automatically uses the tables and capacities already drawn.',
      hoursReady: 'Opening hours connected', hoursMissing: 'Opening hours to configure', teamReady: 'Team connected', teamMissing: 'Team schedule to complete',
      staffing: 'Adapt slots to the team schedule', tablesPerStaff: 'Tables per floor team member',
      cafeTitle: 'Cafe & small dining room', cafeBody: 'Simple bookings and fast service for a small team.',
      classicTitle: 'Classic restaurant', classicBody: 'Lunch and dinner, with tables seating 2 to 6 guests.',
      groupsTitle: 'Groups & private events', groupsBody: 'Large tables, a private room and requests to confirm.',
      tableBooking: 'Book a table', lunch: 'Lunch', dinner: 'Dinner', groupMeal: 'Group meal', privateEvent: 'Private event',
      table: 'Table', privateRoom: 'Private room', groupTerrace: 'Group terrace'
    },
    ar: {
      title: 'ابدأ بنموذج جاهز للمطعم', body: 'أضف إعداداً جاهزاً للتعديل. لن يتم حذف خدماتك أو طاولاتك الحالية.',
      use: 'إضافة هذا النموذج', added: 'تمت إضافة النموذج. راجع التفاصيل ثم احفظ.', already: 'هذا النموذج موجود بالفعل في إعداداتك.',
      services: 'خدمات', tables: 'طاولات', seats: 'مقاعد',
      floorTitle: 'مخطط القاعة الخاص بي', floorBody: 'يستخدم تلقائياً الطاولات والسعات المرسومة مسبقاً.',
      hoursReady: 'ساعات العمل مرتبطة', hoursMissing: 'ساعات العمل تحتاج إلى إعداد', teamReady: 'الفريق مرتبط', teamMissing: 'جدول الفريق يحتاج إلى استكمال',
      staffing: 'تكييف المواعيد مع جدول الفريق', tablesPerStaff: 'عدد الطاولات لكل عضو في القاعة',
      cafeTitle: 'مقهى وقاعة صغيرة', cafeBody: 'حجز بسيط وخدمة سريعة لفريق صغير.',
      classicTitle: 'مطعم كلاسيكي', classicBody: 'الغداء والعشاء مع طاولات من مقعدين إلى ستة مقاعد.',
      groupsTitle: 'المجموعات والحجوزات الخاصة', groupsBody: 'طاولات كبيرة وقاعة خاصة وطلبات تحتاج إلى تأكيد.',
      tableBooking: 'حجز طاولة', lunch: 'الغداء', dinner: 'العشاء', groupMeal: 'وجبة جماعية', privateEvent: 'حجز خاص',
      table: 'طاولة', privateRoom: 'قاعة خاصة', groupTerrace: 'تراس للمجموعات'
    }
  };

  function lang() { try { var l = window.KiwiI18n && window.KiwiI18n.getLang && window.KiwiI18n.getLang(); return COPY[l] ? l : 'fr'; } catch (_) { return 'fr'; } }
  function t(k) { return (COPY[lang()] || COPY.fr)[k] || COPY.fr[k] || k; }
  function tt(k) { return (TEMPLATE_COPY[lang()] || TEMPLATE_COPY.fr)[k] || TEMPLATE_COPY.fr[k] || k; }
  function esc(v) { return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function clone(v) { try { return JSON.parse(JSON.stringify(v)); } catch (_) { return v; } }
  function id(prefix) { return prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8); }
  function venueId() { try { return window.KiwiVenue && window.KiwiVenue.getVenue && window.KiwiVenue.getVenue(); } catch (_) { return ''; } }
  function venue() { try { return window.KiwiVenue && window.KiwiVenue.getCurrentVenueData && window.KiwiVenue.getCurrentVenueData() || {}; } catch (_) { return {}; } }
  function slug() { try { return window.KiwiStore && window.KiwiStore.slugFor && window.KiwiStore.slugFor(venueId()) || ''; } catch (_) { return ''; } }
  function trade() { var v = venue(); return String(v.trade || v.type || window.KiwiTrade || '').toLowerCase(); }
  function hotelMode() { return /hotel|riad/.test(trade()); }
  function hotelInventory() { try { return window.KiwiHotelRooms && window.KiwiHotelRooms.current ? window.KiwiHotelRooms.current() : { rooms:[], roomTypes:[] }; } catch (_) { return { rooms:[], roomTypes:[] }; } }
  function blank() {
    return { v: VERSION, settings: { published: false, confirmation: 'instant', minNoticeMinutes: 60, windowDays: 60, cancellationHours: 12, slotStep: 15, staffingEnabled: false, tablesPerStaff: 4, updatedAt: 0 }, services: [], resources: [], blocked: [], bookings: [] };
  }
  function diningTrade() { return /restaurant|cafe|café|food|pizzeria|boulanger/.test(trade()); }
  function restaurantTemplates() {
    function svc(id, name, duration) { return { id: 'tpl-' + id, name: name, duration: duration, price: 0, deposit: 0, capacity: 1, resourceIds: [], active: true, updatedAt: 0 }; }
    function tables(prefix, specs) {
      var out = [], n = 0;
      specs.forEach(function (spec) {
        for (var i = 0; i < spec.count; i += 1) {
          n += 1;
          out.push({ id: 'tpl-' + prefix + '-table-' + n, name: tt('table') + ' ' + n, kind: 'table', capacity: spec.capacity, active: true, week: null, updatedAt: 0 });
        }
      });
      return out;
    }
    var presets = [
      { id: 'cafe', icon: 'local_cafe', title: tt('cafeTitle'), body: tt('cafeBody'), settings: { confirmation: 'instant', minNoticeMinutes: 30, windowDays: 30, cancellationHours: 2, staffingEnabled: true, tablesPerStaff: 5 }, services: [svc('cafe-table', tt('tableBooking'), 60)], resources: tables('cafe', [{ count: 4, capacity: 2 }, { count: 2, capacity: 4 }]) },
      { id: 'classic', icon: 'restaurant', title: tt('classicTitle'), body: tt('classicBody'), settings: { confirmation: 'instant', minNoticeMinutes: 120, windowDays: 60, cancellationHours: 12, staffingEnabled: true, tablesPerStaff: 4 }, services: [svc('classic-lunch', tt('lunch'), 90), svc('classic-dinner', tt('dinner'), 120)], resources: tables('classic', [{ count: 4, capacity: 2 }, { count: 4, capacity: 4 }, { count: 2, capacity: 6 }]) },
      { id: 'groups', icon: 'room_service', title: tt('groupsTitle'), body: tt('groupsBody'), settings: { confirmation: 'request', minNoticeMinutes: 1440, windowDays: 90, cancellationHours: 48, staffingEnabled: true, tablesPerStaff: 2 }, services: [svc('groups-meal', tt('groupMeal'), 180), svc('groups-private', tt('privateEvent'), 240)], resources: [
        { id: 'tpl-groups-table-1', name: tt('table') + ' 1', kind: 'table', capacity: 8, active: true, week: null, updatedAt: 0 },
        { id: 'tpl-groups-table-2', name: tt('table') + ' 2', kind: 'table', capacity: 10, active: true, week: null, updatedAt: 0 },
        { id: 'tpl-groups-private-room', name: tt('privateRoom'), kind: 'table', capacity: 12, active: true, week: null, updatedAt: 0 },
        { id: 'tpl-groups-terrace', name: tt('groupTerrace'), kind: 'table', capacity: 16, active: true, week: null, updatedAt: 0 }
      ] }
    ];
    var floor = floorPlanTemplate();
    return floor ? [floor].concat(presets) : presets;
  }
  function floorPlanTemplateFrom(raw) {
    var plan = raw;
    if (typeof plan === 'string') { try { plan = JSON.parse(plan); } catch (_) { plan = null; } }
    var rows = plan && Array.isArray(plan.tables) ? plan.tables : [];
    if (!rows.length) return null;
    var resources = rows.slice(0, 120).map(function (x, i) {
      var match = String(x && x.type || '').match(/(2|4|6|8|10|12)$/), cap = number(x && (x.capacity || x.seats), 1, 999, match ? +match[1] : 4);
      var rawId = cleanText(x && x.id, 40).replace(/[^a-zA-Z0-9_-]/g, '-') || String(i + 1);
      var label = cleanText(x && (x.num || x.name), 40) || String(i + 1);
      return { id: 'tpl-floor-' + rawId, name: tt('table') + ' ' + label, kind: 'table', capacity: cap, active: true, week: null, updatedAt: 0 };
    });
    return { id: 'floorplan', icon: 'restaurant', title: tt('floorTitle'), body: tt('floorBody'), settings: { confirmation: 'instant', minNoticeMinutes: 120, windowDays: 60, cancellationHours: 12, staffingEnabled: true, tablesPerStaff: 4 }, services: [{ id:'tpl-floorplan-table', name:tt('tableBooking'), duration:90, price:0, deposit:0, capacity:1, resourceIds:[], active:true, updatedAt:0 }], resources: resources };
  }
  function floorPlanTemplate() {
    try {
      var keys = ['kiwiPlanDeSalle:' + venueId(), 'kiwiPlanDeSalle:slug:' + slug()];
      for (var i = 0; i < keys.length; i += 1) { var raw = localStorage.getItem(keys[i]); if (raw) { var tpl = floorPlanTemplateFrom(raw); if (tpl) return tpl; } }
    } catch (_) {}
    return null;
  }
  function templateSeats(tpl) { return (tpl.resources || []).reduce(function (sum, r) { return sum + (+r.capacity || 0); }, 0); }
  function templatePanel() {
    if (!diningTrade()) return '';
    var hoursReady=false,teamCount=0;try{hoursReady=!!(window.KiwiHours&&window.KiwiHours.isConfigured&&window.KiwiHours.isConfigured(venueId()));}catch(_){}try{teamCount=(window.KiwiTeam&&window.KiwiTeam.roster?window.KiwiTeam.roster():[]).length;}catch(_){}
    return '<section class="kr-template-section"><div class="kr-template-intro"><span>'+esc(tt('title'))+'</span><p>'+esc(tt('body'))+'</p></div><div class="kr-template-smart"><span>'+icon('calendar')+esc(hoursReady?tt('hoursReady'):tt('hoursMissing'))+'</span><span>'+icon('person')+esc(teamCount?tt('teamReady')+' · '+teamCount:tt('teamMissing'))+'</span></div><div class="kr-template-grid">'+restaurantTemplates().map(function (tpl) {
      return '<article class="kr-template-card"><div class="kr-template-icon"><img src="assets/icons/material/'+tpl.icon+'.svg" alt="" aria-hidden="true"></div><div class="kr-template-copy"><h3>'+esc(tpl.title)+'</h3><p>'+esc(tpl.body)+'</p><div class="kr-template-meta"><span>'+tpl.services.length+' '+esc(tt('services'))+'</span><span>'+tpl.resources.length+' '+esc(tt('tables'))+'</span><span>'+templateSeats(tpl)+' '+esc(tt('seats'))+'</span></div></div><button type="button" class="kr-btn ghost" data-kr-template="'+esc(tpl.id)+'" aria-label="'+esc(tt('use')+' · '+tpl.title)+'">'+esc(tt('use'))+'</button></article>';
    }).join('')+'</div></section>';
  }
  function cleanText(v, max) { return String(v == null ? '' : v).trim().slice(0, max); }
  function number(v, min, max, fallback) { v = Number(v); return Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : fallback; }
  function normalize(raw) {
    var out = blank(), r = raw && typeof raw === 'object' ? raw : {};
    var s = r.settings || {};
    out.settings = { published: !!s.published, confirmation: s.confirmation === 'request' ? 'request' : 'instant', minNoticeMinutes: number(s.minNoticeMinutes, 0, 10080, 60), windowDays: number(s.windowDays, 1, 365, 60), cancellationHours: number(s.cancellationHours, 0, 720, 12), slotStep: [5, 10, 15, 20, 30, 60].indexOf(+s.slotStep) >= 0 ? +s.slotStep : 15, staffingEnabled: !!s.staffingEnabled, tablesPerStaff: number(s.tablesPerStaff, 1, 12, 4), updatedAt: +s.updatedAt || 0 };
    out.services = (Array.isArray(r.services) ? r.services : []).slice(0, 120).map(function (x) { return { id: cleanText(x && x.id, 64) || id('svc'), name: cleanText(x && x.name, 100), duration: number(x && x.duration, 5, 1440, 30), price: number(x && x.price, 0, 1000000, 0), deposit: number(x && x.deposit, 0, 1000000, 0), capacity: number(x && x.capacity, 1, 999, 1), resourceIds: (Array.isArray(x && x.resourceIds) ? x.resourceIds : []).slice(0, 60).map(function (z) { return cleanText(z, 64); }).filter(Boolean), active: x && x.active !== false, updatedAt: +x.updatedAt || 0 }; }).filter(function (x) { return x.id && x.name; });
    out.resources = (Array.isArray(r.resources) ? r.resources : []).slice(0, 120).map(function (x) { var kind = ['person', 'room', 'table'].indexOf(x && x.kind) >= 0 ? x.kind : 'person'; return { id: cleanText(x && x.id, 64) || id('res'), name: cleanText(x && x.name, 100), kind: kind, capacity: number(x && x.capacity, 1, 999, 1), active: x && x.active !== false, week: x && typeof x.week === 'object' ? clone(x.week) : null, updatedAt: +x.updatedAt || 0 }; }).filter(function (x) { return x.id && x.name; });
    out.blocked = (Array.isArray(r.blocked) ? r.blocked : []).slice(-500).map(function (x) { return { id: cleanText(x && x.id, 64) || id('blk'), resourceId: cleanText(x && x.resourceId, 64), startAt: +x.startAt || 0, endAt: +x.endAt || 0, reason: cleanText(x && x.reason, 120), updatedAt: +x.updatedAt || 0 }; }).filter(function (x) { return x.startAt && x.endAt > x.startAt; });
    out.bookings = (Array.isArray(r.bookings) ? r.bookings : []).slice(-4000).map(function (x) {
      var status = ['requested','confirmed','checked_in','completed','cancelled','no_show'].indexOf(x && x.status) >= 0 ? x.status : 'requested';
      var hotel = x && x.hotel && typeof x.hotel === 'object' ? {
        roomTypeName: cleanText(x.hotel.roomTypeName, 100), checkIn: cleanText(x.hotel.checkIn, 10),
        checkOut: cleanText(x.hotel.checkOut, 10), nights: number(x.hotel.nights, 1, 365, 1),
        rate: number(x.hotel.rate, 0, 1000000, 0), total: number(x.hotel.total, 0, 100000000, 0),
        channel: ['direct','booking','airbnb','expedia','walkin','other'].indexOf(x.hotel.channel) >= 0 ? x.hotel.channel : (x.source === 'public' ? 'direct' : 'other'),
        externalRef: cleanText(x.hotel.externalRef, 80)
      } : null;
      return { id: cleanText(x && x.id, 64) || id('bk'), code: cleanText(x && x.code, 24), customer: { name: cleanText(x && x.customer && x.customer.name, 100), phone: cleanText(x && x.customer && x.customer.phone, 32), email: cleanText(x && x.customer && x.customer.email, 160) }, serviceId: cleanText(x && x.serviceId, 64), resourceId: cleanText(x && x.resourceId, 64), startAt: +x.startAt || 0, endAt: +x.endAt || 0, partySize: number(x && x.partySize, 1, 999, 1), status: status, source: ['public','staff','import'].indexOf(x && x.source) >= 0 ? x.source : 'staff', note: cleanText(x && x.note, 600), manageToken: cleanText(x && x.manageToken, 80), publicRef: cleanText(x && x.publicRef, 80), hotel: hotel, createdAt: +x.createdAt || 0, updatedAt: +x.updatedAt || 0 };
    }).filter(function (x) { return x.id && x.customer.name && x.serviceId && x.startAt && x.endAt > x.startAt; });
    return out;
  }
  function byId(rows) { var out = Object.create(null); (rows || []).forEach(function (x) { if (x && x.id) out[x.id] = x; }); return out; }
  function merge(a, b) {
    a = normalize(a); b = normalize(b);
    function records(aa, bb, cap) { var all = byId(aa); (bb || []).forEach(function (x) { var p = all[x.id]; if (!p || (+x.updatedAt || 0) > (+p.updatedAt || 0)) all[x.id] = x; }); return Object.keys(all).map(function (k) { return all[k]; }).sort(function (x, y) { return (+x.updatedAt || 0) - (+y.updatedAt || 0); }).slice(-cap); }
    return { v: VERSION, settings: (+a.settings.updatedAt || 0) >= (+b.settings.updatedAt || 0) ? a.settings : b.settings, services: records(a.services, b.services, 120), resources: records(a.resources, b.resources, 120), blocked: records(a.blocked, b.blocked, 500), bookings: records(a.bookings, b.bookings, 4000) };
  }
  function S() {
    if (store) return store;
    if (!window.KiwiStore || !window.KiwiStore.define) return null;
    store = window.KiwiStore.define('reservations', { blank: blank, cloud: true, merge: merge, isEmpty: function (d) { d = normalize(d); return !d.services.length && !d.resources.length && !d.bookings.length; } });
    store.subscribe(function (vid) {
      try { window.dispatchEvent(new CustomEvent('kiwi-reservations-changed', { detail: { venue: vid || venueId() } })); } catch (_) {}
      if (open && (!vid || vid === venueId())) render();
    });
    return store;
  }
  function get() { var s = S(); return normalize(s ? s.get(venueId()) : blank()); }
  function set(doc) {
    doc = normalize(doc);
    if (S()) S().set(doc, venueId());
    try { window.dispatchEvent(new CustomEvent('kiwi-reservations-changed', { detail: { venue: venueId() } })); } catch (_) {}
    return doc;
  }
  function service(doc, sid) { return doc.services.find(function (x) { return x.id === sid && x.active; }); }
  function resourceCandidates(doc, svc, rid, partySize) {
    var allowed = svc && svc.resourceIds && svc.resourceIds.length ? svc.resourceIds : null;
    partySize = number(partySize, 1, 999, 1);
    return doc.resources.filter(function (r) { return r.active && (+r.capacity || 1) >= partySize && (!rid || r.id === rid) && (!allowed || allowed.indexOf(r.id) >= 0); });
  }
  function overlaps(a0, a1, b0, b1) { return a0 < b1 && b0 < a1; }
  function resourceFree(doc, rid, startAt, endAt, ignoreId) {
    var busy = doc.bookings.some(function (b) { return b.id !== ignoreId && b.resourceId === rid && ACTIVE[b.status] && overlaps(startAt, endAt, b.startAt, b.endAt); });
    if (busy) return false;
    return !doc.blocked.some(function (b) { return (!b.resourceId || b.resourceId === rid) && overlaps(startAt, endAt, b.startAt, b.endAt); });
  }
  function withinHours(resource, startAt, endAt) {
    var d = new Date(startAt), periods = [];
    if (resource && resource.week) {
      var keys = ['sun','mon','tue','wed','thu','fri','sat'], day = resource.week[keys[d.getDay()]] || {};
      periods = day.open === false ? [] : (day.periods || []);
    } else if (window.KiwiHours && window.KiwiHours.periodsOn) periods = window.KiwiHours.periodsOn(d, venueId()) || [];
    if (!periods.length) return !(window.KiwiHours && window.KiwiHours.isConfigured && window.KiwiHours.isConfigured(venueId()));
    var mins = d.getHours() * 60 + d.getMinutes(), end = mins + Math.round((endAt - startAt) / 60000);
    return periods.some(function (p) { var a = window.KiwiHours ? window.KiwiHours.toMin(p.from) : null, z = window.KiwiHours ? window.KiwiHours.toMin(p.to) : null; if (a == null || z == null) return false; if (z <= a) z += 1440; return mins >= a && end <= z; });
  }
  function chooseResource(doc, svc, rid, startAt, endAt, ignoreId, partySize) { return resourceCandidates(doc, svc, rid, partySize).find(function (r) { return withinHours(r, startAt, endAt) && resourceFree(doc, r.id, startAt, endAt, ignoreId); }) || null; }
  function staffingAllows(doc, startAt, endAt, ignoreId) {
    if (!doc.settings.staffingEnabled || !window.KiwiTeam || !window.KiwiTeam.bookingCoverage) return true;
    var coverage = window.KiwiTeam.bookingCoverage(startAt, endAt);
    if (!coverage || !coverage.configured) return true;
    var concurrent = doc.bookings.filter(function (b) { return b.id !== ignoreId && ACTIVE[b.status] && overlaps(startAt, endAt, b.startAt, b.endAt); }).length;
    return coverage.members.length > 0 && concurrent < coverage.members.length * doc.settings.tablesPerStaff;
  }
  function validate(input, doc, ignoreId) {
    doc = normalize(doc); input = input || {};
    var svc = service(doc, input.serviceId), startAt = +input.startAt || 0;
    if (!cleanText(input.customer && input.customer.name, 100) || !svc || !startAt) return { ok: false, error: 'invalid' };
    var endAt = startAt + svc.duration * 60000;
    var res = chooseResource(doc, svc, input.resourceId, startAt, endAt, ignoreId, input.partySize);
    if (!res || !staffingAllows(doc, startAt, endAt, ignoreId)) return { ok: false, error: 'conflict' };
    var now = Date.now();
    if (!ignoreId && startAt < now + doc.settings.minNoticeMinutes * 60000) return { ok: false, error: 'invalid' };
    if (startAt > now + doc.settings.windowDays * 86400000) return { ok: false, error: 'invalid' };
    return { ok: true, service: svc, resource: res, startAt: startAt, endAt: endAt };
  }
  function statusLabel(s) { return t(s + 'Status'); }
  function dateLabel(ts, withDate) { try { return new Date(ts).toLocaleString(lang() === 'ar' ? 'ar-MA' : lang(), withDate ? { weekday:'short', day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' } : { hour:'2-digit', minute:'2-digit' }); } catch (_) { return ''; } }
  function money(n) { try { return Number(n || 0).toLocaleString(lang() === 'ar' ? 'ar-MA' : 'fr-FR') + ' MAD'; } catch (_) { return n + ' MAD'; } }
  function dayStart(ts) { var d = new Date(ts || Date.now()); d.setHours(0,0,0,0); return d.getTime(); }
  function icon(name) { var safe = { calendar:'today', add:'today', link:'phonelink', settings:'schedule', person:'schedule', room:'room_service', table:'restaurant', service:'redeem' }[name] || 'today'; return '<img src="assets/icons/material/' + safe + '.svg" alt="" aria-hidden="true">'; }
  function render() {
    if (!window.Kiwi || !window.Kiwi.appPage) return;
    open = true;
    var doc = get(), now = Date.now(), today = dayStart(now), tomorrow = today + 86400000;
    var active = doc.bookings.filter(function (b) { return !DONE[b.status] && b.endAt >= today; }).sort(function (a,b){ return a.startAt-b.startAt; });
    var todayRows = active.filter(function (b) { return b.startAt >= today && b.startAt < tomorrow; });
    var upcoming = active.filter(function (b) { return b.startAt >= tomorrow; });
    var requested = active.filter(function (b) { return b.status === 'requested'; });
    var hotel = hotelMode() ? hotelInventory() : null;
    var configured = hotel ? hotel.rooms.some(function(x){return !x.deletedAt && x.status !== 'hs';}) && hotel.roomTypes.some(function(x){return !x.deletedAt && x.public !== false && (x.rate != null || hotel.baseRate != null);}) : doc.services.some(function (x) { return x.active; }) && doc.resources.some(function (x) { return x.active; });
    var capacity = hotel ? hotel.rooms.filter(function(x){return !x.deletedAt && x.status !== 'hs';}).length : doc.resources.filter(function (x) { return x.active; }).reduce(function (n,x){ return n + (+x.capacity || 1); },0);
    var occupancy = capacity ? Math.min(100, Math.round(todayRows.length / Math.max(1, capacity * 4) * 100)) : 0;
    var body = '<section class="kr-shell" data-kr-root>' +
      '<header class="kr-command"><div class="kr-command-main"><span class="kr-kicker">KIWI RESERVATIONS</span><h2>' + esc(t('title')) + '</h2><p>' + esc(t('subtitle')) + '</p></div>' +
      /* L'état « en ligne » est une pastille dans l'en-tête (plus une barre pleine largeur) ; les actions dessous, à droite. */
      '<div class="kr-command-side"><div class="kr-live' + (doc.settings.published ? ' is-on' : '') + '"><span class="kr-live-dot"></span><span>' + esc(doc.settings.published ? t('onlineOn') : t('onlineOff')) + '</span><strong>' + esc(venue().name || '') + '</strong></div>' +
      '<div class="kr-command-actions"><button type="button" class="kr-btn ghost" data-kr-share>' + icon('link') + esc(t('share')) + '</button><button type="button" class="kr-btn ghost" data-kr-setup>' + icon('settings') + esc(t('settings')) + '</button><button type="button" class="kr-btn primary" data-kr-new>' + icon('add') + esc(t('add')) + '</button></div></div></header>' +
      '<div class="kr-stats"><article><span>' + esc(t('today')) + '</span><strong>' + todayRows.length + '</strong><small>' + esc(todayRows.length ? dateLabel(todayRows[0].startAt, false) : t('todayEmpty')) + '</small></article><article><span>' + esc(t('upcoming')) + '</span><strong>' + upcoming.length + '</strong><small>' + esc(upcoming.length ? dateLabel(upcoming[0].startAt, true) : '·') + '</small></article><article><span>' + esc(t('needs')) + '</span><strong>' + requested.length + '</strong><small>' + esc(requested.length ? requested[0].customer.name : '·') + '</small></article><article><span>' + esc(t('occupancy')) + '</span><strong>' + occupancy + '%</strong><small>' + esc(capacity + ' ' + (hotel ? (lang()==='ar'?'غرفة':lang()==='en'?'rooms':'chambres') : t('resources').toLowerCase())) + '</small></article></div>' +
      (!configured ? '<div class="kr-empty"><div class="kr-empty-mark">' + icon('calendar') + '</div><div><h3>' + esc(t('emptyTitle')) + '</h3><p>' + esc(t('emptyBody')) + '</p>' + setupSteps(doc) + '</div><button type="button" class="kr-btn primary" data-kr-setup>' + esc(t('setup')) + '</button></div>' : agenda(doc, todayRows, upcoming)) + '</section>';
    var host = window.Kiwi.appPage('reservations', { title: t('title'), subtitle: (venue().name || '') + ' · ' + (doc.settings.published ? t('onlineOn') : t('onlineOff')), body: body });
    if (host && host.el) host.el.classList.add('kr-page');
    wire(host && host.el);
  }
  /* Les trois étapes de mise en route, lues dans le document — jamais décoratives :
   * un service actif, une ressource active, la réservation en ligne ouverte. */
  function setupSteps(doc) {
    var steps = [
      { k: 'stepService', ok: doc.services.some(function (x) { return x.active; }) },
      { k: 'stepResource', ok: doc.resources.some(function (x) { return x.active; }) },
      { k: 'stepOnline', ok: !!doc.settings.published }
    ];
    return '<div class="kr-steps">' + steps.map(function (st, i) {
      return '<span class="kr-step' + (st.ok ? ' done' : '') + '"><i>' + (i + 1) + '</i>' + esc(t(st.k)) + '</span>';
    }).join('') + '</div>';
  }
  function agenda(doc, todayRows, upcoming) {
    var services = byId(doc.services), resources = byId(doc.resources);
    function card(b) { var svc = services[b.serviceId] || {}, res = resources[b.resourceId] || {}, label=b.hotel?(b.hotel.roomTypeName+' · '+b.hotel.nights+' '+(lang()==='en'?'nights':lang()==='ar'?'ليالٍ':'nuits')+' · '+money(b.hotel.total)):(svc.name || '')+' · '+(res.name || ''); return '<article class="kr-booking status-' + esc(b.status) + '" data-kr-booking="' + esc(b.id) + '"><div class="kr-time"><strong>' + esc(dateLabel(b.startAt, false)) + '</strong><span>' + esc(b.hotel?(b.hotel.checkIn+' → '+b.hotel.checkOut):((svc.duration || '')+' min')) + '</span></div><div class="kr-booking-main"><div class="kr-booking-title"><h3>' + esc(b.customer.name) + '</h3><span class="kr-status">' + esc(statusLabel(b.status)) + '</span></div><p>' + esc(label) + (b.partySize > 1 ? ' · ' + esc(b.partySize) : '') + '</p><small>' + esc((b.customer.phone || b.customer.email || '') + (b.source ? ' · ' + t('source' + b.source.charAt(0).toUpperCase() + b.source.slice(1)) : '')) + '</small></div><button type="button" class="kr-more" data-kr-edit="' + esc(b.id) + '" aria-label="' + esc(t('edit')) + '">•••</button></article>'; }
    return '<div class="kr-agenda"><section class="kr-day"><div class="kr-section-head"><div><span>' + esc(new Date().toLocaleDateString(lang()==='ar'?'ar-MA':lang(),{weekday:'long',day:'numeric',month:'long'})) + '</span><h3>' + esc(t('today')) + '</h3></div><span class="kr-count">' + todayRows.length + '</span></div><div class="kr-list">' + (todayRows.length ? todayRows.map(card).join('') : '<div class="kr-list-empty">' + esc(t('todayEmpty')) + '</div>') + '</div></section><aside class="kr-next"><div class="kr-section-head"><div><span>' + esc(t('overview')) + '</span><h3>' + esc(t('upcoming')) + '</h3></div><span class="kr-count">' + upcoming.length + '</span></div><div class="kr-list compact">' + (upcoming.length ? upcoming.slice(0,12).map(function(b){ var svc=services[b.serviceId]||{}; return '<button type="button" class="kr-mini" data-kr-edit="'+esc(b.id)+'"><span>'+esc(dateLabel(b.startAt,true))+'</span><strong>'+esc(b.customer.name)+'</strong><small>'+esc(svc.name||'')+'</small></button>'; }).join('') : '<div class="kr-list-empty">·</div>') + '</div></aside></div>';
  }
  function formField(label, control, full) { return '<label class="kr-field' + (full ? ' full' : '') + '"><span>' + esc(label) + '</span>' + control + '</label>'; }
  function bookingModal(existing) {
    var doc = get(), b = existing || {}, services = doc.services.filter(function(x){return x.active;}), resources=doc.resources.filter(function(x){return x.active;});
    if (!services.length || !resources.length) { window.Kiwi.toast(t('unavailable'), { type:'warning' }); return setupModal(); }
    var start = b.startAt ? new Date(b.startAt) : new Date(Date.now() + Math.max(60, doc.settings.minNoticeMinutes) * 60000); start.setMinutes(Math.ceil(start.getMinutes()/15)*15,0,0);
    var val = function(d){ var z=new Date(d.getTime()-d.getTimezoneOffset()*60000); return z.toISOString().slice(0,16); };
    var m = window.Kiwi.modal({ title: existing ? t('edit') : t('add'), width: 700, body:'<form class="kr-form" data-kr-form>' +
      formField(t('client'), '<input name="name" maxlength="100" required autocomplete="name" value="'+esc(b.customer&&b.customer.name||'')+'">') +
      formField(t('phone'), '<input name="phone" maxlength="32" inputmode="tel" autocomplete="tel" placeholder="06… / +33…" value="'+esc(b.customer&&b.customer.phone||'')+'">') +
      formField(t('email'), '<input name="email" maxlength="160" type="email" autocomplete="email" value="'+esc(b.customer&&b.customer.email||'')+'">') +
      formField(t('guests'), '<input name="partySize" type="number" min="1" max="999" value="'+esc(b.partySize||1)+'">') +
      formField(t('service'), '<select name="serviceId" required><option value="">·</option>'+services.map(function(x){return '<option value="'+esc(x.id)+'"'+(x.id===b.serviceId?' selected':'')+'>'+esc(x.name)+' · '+esc(x.duration)+' min · '+esc(money(x.price))+'</option>';}).join('')+'</select>') +
      formField(t('resource'), '<select name="resourceId"><option value="">'+esc(t('anyResource'))+'</option>'+resources.map(function(x){return '<option value="'+esc(x.id)+'"'+(x.id===b.resourceId?' selected':'')+'>'+esc(x.name)+'</option>';}).join('')+'</select>') +
      formField(t('start'), '<input name="startAt" type="datetime-local" required value="'+esc(val(start))+'">') +
      formField(t('note'), '<textarea name="note" maxlength="600">'+esc(b.note||'')+'</textarea>', true) +
      '<div class="kr-form-error full" data-kr-error></div><div class="kr-form-actions full">'+(existing?'<button type="button" class="kr-btn danger" data-kr-delete>'+esc(t('delete'))+'</button>':'')+'<span></span><button type="button" class="kr-btn ghost" data-kr-close>'+esc(t('cancel'))+'</button><button type="submit" class="kr-btn primary">'+esc(t('save'))+'</button></div></form>' + (existing ? lifecycle(existing) : '') });
    var form=m.el.querySelector('[data-kr-form]');
    m.el.querySelector('[data-kr-close]').onclick=function(){m.close();};
    var del=m.el.querySelector('[data-kr-delete]'); if(del) del.onclick=function(){ var d=get(); d.bookings=d.bookings.map(function(x){return x.id===existing.id?Object.assign({},x,{status:'cancelled',updatedAt:Date.now()}):x;}); set(d); m.close(); render(); };
    form.onsubmit=function(e){ e.preventDefault(); var fd=new FormData(form), rawPhone=cleanText(fd.get('phone'),32), phone=normalizePhone(rawPhone), startAt=new Date(fd.get('startAt')).getTime(), input={customer:{name:fd.get('name'),phone:phone,email:fd.get('email')},serviceId:fd.get('serviceId'),resourceId:fd.get('resourceId'),startAt:startAt,partySize:fd.get('partySize'),note:fd.get('note')}; if(rawPhone&&!phone){form.querySelector('[data-kr-error]').textContent=lang()==='ar'?'أدخل رقم الهاتف مع رمز الدولة، مثل +33 أو +49.':lang()==='en'?'Include the country code for foreign numbers, such as +33 or +49.':'Pour un numéro étranger, ajoutez l’indicatif pays, par exemple +33 ou +49.';return;} var d=get(), check=validate(input,d,existing&&existing.id); if(!check.ok){form.querySelector('[data-kr-error]').textContent=t(check.error);return;} var now=Date.now(), rec={ id:existing&&existing.id||id('bk'), code:existing&&existing.code||('K'+Math.random().toString(36).slice(2,8).toUpperCase()), customer:{name:cleanText(input.customer.name,100),phone:phone,email:cleanText(input.customer.email,160)}, serviceId:check.service.id,resourceId:check.resource.id,startAt:check.startAt,endAt:check.endAt,partySize:number(input.partySize,1,999,1),status:existing&&existing.status||'confirmed',source:existing&&existing.source||'staff',note:cleanText(input.note,600),manageToken:existing&&existing.manageToken||'',createdAt:existing&&existing.createdAt||now,updatedAt:now}; var i=d.bookings.findIndex(function(x){return x.id===rec.id;}); if(i<0)d.bookings.push(rec);else d.bookings[i]=rec;set(d);m.close();window.Kiwi.toast(t('saved'),{type:'success'});render(); };
    wireLifecycle(m, existing);
  }
  function lifecycle(b){ if(DONE[b.status])return''; var buttons=[]; if(b.status==='requested')buttons.push(['confirmed',t('confirm')]); if(b.status==='confirmed')buttons.push(['checked_in',t('checkin')]); if(b.status==='checked_in')buttons.push(['completed',t('complete')]); buttons.push(['no_show',t('noShow')]); buttons.push(['cancelled',t('cancel')]); return '<div class="kr-lifecycle">'+buttons.map(function(x){return '<button type="button" data-kr-status="'+x[0]+'">'+esc(x[1])+'</button>';}).join('')+'</div>'; }
  function wireLifecycle(m,b){ if(!b)return;m.el.querySelectorAll('[data-kr-status]').forEach(function(btn){btn.onclick=function(){var d=get();d.bookings=d.bookings.map(function(x){return x.id===b.id?Object.assign({},x,{status:btn.dataset.krStatus,updatedAt:Date.now()}):x;});set(d);m.close();render();};}); }
  function hotelSettingsModal() {
    var doc=get(),s=doc.settings,inventory=hotelInventory();
    var m=window.Kiwi.modal({title:t('setupTitle'),width:720,body:'<form class="kr-settings" data-kr-hotel-settings><div class="kr-setting-hero"><label><input type="checkbox" name="published" '+(s.published?'checked':'')+'><span></span><strong>'+esc(t('publicLabel'))+'</strong></label><p>'+(lang()==='ar'?'يستخدم الرابط فئات الغرف والأسعار والتوفر الفعلي.':lang()==='en'?'The link uses your room categories, nightly rates and real availability.':'Le lien utilise vos catégories, tarifs par nuit et disponibilités réelles.')+'</p></div><div class="kr-setting-grid">'+formField(t('notice'),'<div class="kr-unit"><input type="number" name="noticeHours" min="0" max="168" value="'+Math.round(s.minNoticeMinutes/60)+'"><span>'+esc(t('hours'))+'</span></div>')+formField(t('window'),'<div class="kr-unit"><input type="number" name="windowDays" min="1" max="365" value="'+s.windowDays+'"><span>'+esc(t('days'))+'</span></div>')+formField(t('cancelDelay'),'<div class="kr-unit"><input type="number" name="cancelHours" min="0" max="720" value="'+s.cancellationHours+'"><span>'+esc(t('hours'))+'</span></div>')+formField(t('direct'),'<select name="confirmation"><option value="instant"'+(s.confirmation==='instant'?' selected':'')+'>'+esc(t('direct'))+'</option><option value="request"'+(s.confirmation==='request'?' selected':'')+'>'+esc(t('requested'))+'</option></select>')+'</div><div class="kr-empty"><div><h3>'+inventory.roomTypes.length+' '+(lang()==='ar'?'فئات':lang()==='en'?'room categories':'catégories de chambres')+'</h3><p>'+(lang()==='ar'?'عدّل السعة والإطلالة والأسرة والمرافق من مخطط الغرف.':lang()==='en'?'Edit occupancy, view, beds and amenities from the room plan.':'Modifiez capacité, vue, couchage et équipements depuis le plan des chambres.')+'</p></div><button type="button" class="kr-btn ghost" data-kr-room-types>'+(lang()==='ar'?'إدارة الفئات':lang()==='en'?'Manage categories':'Gérer les catégories')+'</button></div><div class="kr-form-actions"><span></span><button type="button" class="kr-btn ghost" data-kr-close>'+esc(t('cancel'))+'</button><button class="kr-btn primary" type="submit">'+esc(t('save'))+'</button></div></form>'});
    var form=m.el.querySelector('[data-kr-hotel-settings]');m.el.querySelector('[data-kr-close]').onclick=function(){m.close();};m.el.querySelector('[data-kr-room-types]').onclick=function(){m.close();var h=window.Kiwi&&window.Kiwi.handlers&&window.Kiwi.handlers['hx-room-types'];if(h)h();};
    form.onsubmit=function(e){e.preventDefault();var fd=new FormData(form),d=get(),now=Date.now();d.settings=Object.assign({},d.settings,{published:!!form.elements.published.checked,confirmation:fd.get('confirmation')==='request'?'request':'instant',minNoticeMinutes:number(fd.get('noticeHours'),0,168,1)*60,windowDays:number(fd.get('windowDays'),1,365,60),cancellationHours:number(fd.get('cancelHours'),0,720,12),updatedAt:now});set(d);m.close();window.Kiwi.toast(t('settingsSaved'),{type:'success'});render();};
  }
  function setupModal() {
    if (hotelMode()) return hotelSettingsModal();
    var doc=get(), s=doc.settings;
    var m=window.Kiwi.modal({title:t('setupTitle'),width:980,body:'<form class="kr-settings" data-kr-settings>'+templatePanel()+'<div class="kr-setting-hero"><label><input type="checkbox" name="published" '+(s.published?'checked':'')+'><span></span><strong>'+esc(t('publicLabel'))+'</strong></label><p>'+esc(t('businessHours'))+'</p></div><div class="kr-setting-grid">'+formField(t('notice'),'<div class="kr-unit"><input type="number" name="minNotice" min="0" max="10080" value="'+s.minNoticeMinutes+'"><span>'+esc(t('minutes'))+'</span></div>')+formField(t('window'),'<div class="kr-unit"><input type="number" name="windowDays" min="1" max="365" value="'+s.windowDays+'"><span>'+esc(t('days'))+'</span></div>')+formField(t('cancelDelay'),'<div class="kr-unit"><input type="number" name="cancelHours" min="0" max="720" value="'+s.cancellationHours+'"><span>'+esc(t('hours'))+'</span></div>')+formField(t('direct'),'<select name="confirmation"><option value="instant"'+(s.confirmation==='instant'?' selected':'')+'>'+esc(t('direct'))+'</option><option value="request"'+(s.confirmation==='request'?' selected':'')+'>'+esc(t('requested'))+'</option></select>')+formField(tt('staffing'),'<label class="kr-staffing-toggle"><input type="checkbox" name="staffingEnabled" '+(s.staffingEnabled?'checked':'')+'><span>'+esc(tt('staffing'))+'</span></label>')+formField(tt('tablesPerStaff'),'<input type="number" name="tablesPerStaff" min="1" max="12" value="'+s.tablesPerStaff+'">')+'</div><section class="kr-config-section"><div class="kr-config-head"><h3>'+esc(t('services'))+'</h3><button class="kr-btn ghost" type="button" data-kr-add-service>'+esc(t('addService'))+'</button></div><div class="kr-config-list" data-kr-services>'+doc.services.map(serviceRow).join('')+'</div></section><section class="kr-config-section"><div class="kr-config-head"><h3>'+esc(t('resources'))+'</h3><button class="kr-btn ghost" type="button" data-kr-add-resource>'+esc(t('addResource'))+'</button></div><div class="kr-config-list" data-kr-resources>'+doc.resources.map(resourceRow).join('')+'</div></section><div class="kr-form-actions"><span></span><button type="button" class="kr-btn ghost" data-kr-close>'+esc(t('cancel'))+'</button><button class="kr-btn primary" type="submit">'+esc(t('save'))+'</button></div></form>'});
    var form=m.el.querySelector('[data-kr-settings]');
    var pristine=!doc.services.length&&!doc.resources.length;
    m.el.querySelector('[data-kr-close]').onclick=function(){m.close();};
    m.el.querySelector('[data-kr-add-service]').onclick=function(){form.querySelector('[data-kr-services]').insertAdjacentHTML('beforeend',serviceRow({id:id('svc'),name:'',duration:30,price:0,deposit:0,capacity:1,active:true,resourceIds:[],updatedAt:0}));};
    m.el.querySelector('[data-kr-add-resource]').onclick=function(){form.querySelector('[data-kr-resources]').insertAdjacentHTML('beforeend',resourceRow({id:id('res'),name:'',kind:kindForTrade(),capacity:1,active:true,updatedAt:0}));};
    m.el.querySelectorAll('[data-kr-template]').forEach(function(btn){btn.onclick=function(){
      var tpl=restaurantTemplates().find(function(x){return x.id===btn.dataset.krTemplate;});
      if(!tpl)return;
      var added=0,serviceHost=form.querySelector('[data-kr-services]'),resourceHost=form.querySelector('[data-kr-resources]');
      tpl.services.forEach(function(x){if(!serviceHost.querySelector('[data-id="'+x.id+'"]')){serviceHost.insertAdjacentHTML('beforeend',serviceRow(x));added+=1;}});
      tpl.resources.forEach(function(x){if(!resourceHost.querySelector('[data-id="'+x.id+'"]')){resourceHost.insertAdjacentHTML('beforeend',resourceRow(x));added+=1;}});
      if(pristine&&tpl.settings){form.elements.confirmation.value=tpl.settings.confirmation;form.elements.minNotice.value=tpl.settings.minNoticeMinutes;form.elements.windowDays.value=tpl.settings.windowDays;form.elements.cancelHours.value=tpl.settings.cancellationHours;form.elements.staffingEnabled.checked=!!tpl.settings.staffingEnabled;form.elements.tablesPerStaff.value=tpl.settings.tablesPerStaff||4;pristine=false;}
      window.Kiwi.toast(added?tt('added'):tt('already'),{type:added?'success':'info'});
    };});
    form.addEventListener('click',function(e){var b=e.target.closest('[data-kr-remove-row]');if(b)b.closest('.kr-config-row').remove();});
    form.onsubmit=function(e){e.preventDefault();var now=Date.now(),d=get(),fd=new FormData(form);d.settings={published:!!form.elements.published.checked,confirmation:fd.get('confirmation')==='request'?'request':'instant',minNoticeMinutes:number(fd.get('minNotice'),0,10080,60),windowDays:number(fd.get('windowDays'),1,365,60),cancellationHours:number(fd.get('cancelHours'),0,720,12),slotStep:15,staffingEnabled:!!form.elements.staffingEnabled.checked,tablesPerStaff:number(fd.get('tablesPerStaff'),1,12,4),updatedAt:now};d.services=[].slice.call(form.querySelectorAll('[data-service-row]')).map(function(row){return{id:row.dataset.id,name:cleanText(row.querySelector('[name=name]').value,100),duration:number(row.querySelector('[name=duration]').value,5,1440,30),price:number(row.querySelector('[name=price]').value,0,1000000,0),deposit:number(row.querySelector('[name=deposit]').value,0,1000000,0),capacity:1,resourceIds:[],active:row.querySelector('[name=active]').checked,updatedAt:now};}).filter(function(x){return x.name;});d.resources=[].slice.call(form.querySelectorAll('[data-resource-row]')).map(function(row){return{id:row.dataset.id,name:cleanText(row.querySelector('[name=name]').value,100),kind:row.querySelector('[name=kind]').value,capacity:number(row.querySelector('[name=capacity]').value,1,999,1),active:row.querySelector('[name=active]').checked,week:null,updatedAt:now};}).filter(function(x){return x.name;});set(d);m.close();window.Kiwi.toast(t('settingsSaved'),{type:'success'});render();};
  }
  function serviceRow(x){return '<div class="kr-config-row" data-service-row data-id="'+esc(x.id)+'"><input name="name" placeholder="'+esc(t('name'))+'" value="'+esc(x.name)+'"><label><span>'+esc(t('duration'))+'</span><input name="duration" type="number" min="5" max="1440" value="'+esc(x.duration)+'"></label><label><span>'+esc(t('price'))+'</span><input name="price" type="number" min="0" value="'+esc(x.price)+'"></label><label><span>'+esc(t('deposit'))+'</span><input name="deposit" type="number" min="0" value="'+esc(x.deposit)+'"></label><label class="kr-check"><input name="active" type="checkbox" '+(x.active?'checked':'')+'><span>'+esc(t('active'))+'</span></label><button type="button" class="kr-row-remove" data-kr-remove-row aria-label="'+esc(t('delete'))+'">×</button></div>';}
  function resourceRow(x){return '<div class="kr-config-row resource" data-resource-row data-id="'+esc(x.id)+'"><input name="name" placeholder="'+esc(t('name'))+'" value="'+esc(x.name)+'"><select name="kind"><option value="person"'+(x.kind==='person'?' selected':'')+'>'+esc(t('person'))+'</option><option value="room"'+(x.kind==='room'?' selected':'')+'>'+esc(t('room'))+'</option><option value="table"'+(x.kind==='table'?' selected':'')+'>'+esc(t('table'))+'</option></select><label><span>'+esc(t('capacity'))+'</span><input name="capacity" type="number" min="1" max="999" value="'+esc(x.capacity||1)+'"></label><label class="kr-check"><input name="active" type="checkbox" '+(x.active?'checked':'')+'><span>'+esc(t('active'))+'</span></label><button type="button" class="kr-row-remove" data-kr-remove-row aria-label="'+esc(t('delete'))+'">×</button></div>';}
  function kindForTrade(){var x=trade();if(/restaurant|cafe|food|pizzeria|boulanger/.test(x))return'table';if(/spa|hotel|riad/.test(x))return'room';return'person';}
  function shareModal(){var d=get();if(!d.settings.published){window.Kiwi.toast(t('linkOff'),{type:'warning'});return setupModal();}var link=location.origin+'/booking?merchant='+encodeURIComponent(slug());var m=window.Kiwi.modal({title:t('linkTitle'),desc:esc(t('linkBody')),width:580,body:'<div class="kr-share"><div class="kr-share-url">'+esc(link)+'</div><div><button type="button" class="kr-btn ghost" data-kr-copy>'+esc(t('copy'))+'</button><a class="kr-btn primary" href="'+esc(link)+'" target="_blank" rel="noopener">'+esc(t('openLink'))+'</a></div></div>'});m.el.querySelector('[data-kr-copy]').onclick=function(){navigator.clipboard&&navigator.clipboard.writeText(link);window.Kiwi.toast(t('linkCopied'),{type:'success'});};}
  function wire(host){if(!host)return;host.onclick=function(e){if(e.target.closest('[data-kr-new]')){if(hotelMode()){var h=window.Kiwi&&window.Kiwi.handlers&&window.Kiwi.handlers['hx-walkin'];if(h)return h();}return bookingModal();}if(e.target.closest('[data-kr-setup]'))return setupModal();if(e.target.closest('[data-kr-share]'))return shareModal();var edit=e.target.closest('[data-kr-edit]');if(edit){var b=get().bookings.find(function(x){return x.id===edit.dataset.krEdit;});if(b&&b.hotel){window.Kiwi.toast((b.hotel.roomTypeName||'')+' · '+b.hotel.checkIn+' → '+b.hotel.checkOut,{type:'info',desc:b.customer.name+' · '+money(b.hotel.total)});return;}if(b)return bookingModal(b);}};}
  function install(){if(!window.Kiwi||!window.Kiwi.handlers)return setTimeout(install,80);var fn=function(){render();};fn.__kiwiReservations=true;window.Kiwi.handlers['nav-reservations']=fn;}
  document.addEventListener('click',function(e){var a=e.target.closest&&e.target.closest('.sidebar a[data-nav="reservations"]');if(!a)return;e.preventDefault();e.stopImmediatePropagation();render();},true);
  window.addEventListener('load',function(){setTimeout(function(){S();install();},420);window.KiwiVenue&&window.KiwiVenue.subscribe&&window.KiwiVenue.subscribe(function(){store=null;open=false;setTimeout(install,0);});window.addEventListener('kiwi:langchange',function(){if(open)render();});});
  window.KiwiReservations={blank:blank,normalize:normalize,merge:merge,validate:validate,resourceFree:resourceFree,chooseResource:chooseResource,staffingAllows:staffingAllows,restaurantTemplates:restaurantTemplates,floorPlanTemplateFrom:floorPlanTemplateFrom,templateSeats:templateSeats,get:get,set:set,render:render};
  try { window.dispatchEvent(new CustomEvent('kiwi-reservations-ready')); } catch (_) {}
}());
