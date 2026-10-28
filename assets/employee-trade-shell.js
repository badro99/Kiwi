/* Kiwi employee self-service — trade-aware workspace for non-dining venues. */
(function () {
  'use strict';

  var lastData = null;
  var currentTrade = '';
  var renderedDay = '';

  /* Un métier = libellé + quatre repères, en français (la clé), anglais et
     arabe. Les icônes sont des noms Google Material Symbols, dessinés par
     assets/material-icons.js (data-icon) : rien d'autre dans l'app. */
  var TRADES = {
    fastfood: { icon: 'lunch_dining',
      fr: ['Restauration rapide', 'Comptoir', 'Préparation', 'Remise', 'Nettoyage'],
      en: ['Fast food', 'Counter', 'Preparation', 'Handover', 'Cleaning'],
      ar: ['الوجبات السريعة', 'الكاونتر', 'التحضير', 'التسليم', 'التنظيف'] },
    pizzeria: { icon: 'local_pizza',
      fr: ['Pizzeria', 'Commandes', 'Préparation', 'Four', 'Livraison'],
      en: ['Pizzeria', 'Orders', 'Preparation', 'Oven', 'Delivery'],
      ar: ['بيتزيريا', 'الطلبات', 'التحضير', 'الفرن', 'التوصيل'] },
    bakery: { icon: 'bakery_dining',
      fr: ['Boulangerie', 'Comptoir', 'Fournil', 'Commandes', 'Invendus'],
      en: ['Bakery', 'Counter', 'Bakehouse', 'Orders', 'Unsold items'],
      ar: ['مخبزة', 'الكاونتر', 'غرفة الخبز', 'الطلبات', 'المنتجات غير المباعة'] },
    traiteur: { icon: 'skillet',
      fr: ['Traiteur', 'Préparation', 'Conditionnement', 'Chargement', 'Service'],
      en: ['Catering', 'Preparation', 'Packing', 'Loading', 'Service'],
      ar: ['متعهد الحفلات', 'التحضير', 'التعبئة', 'التحميل', 'الخدمة'] },
    foodtruck: { icon: 'local_shipping',
      fr: ['Food truck', 'Mise en place', 'Service', 'Remise', 'Fermeture'],
      en: ['Food truck', 'Setup', 'Service', 'Handover', 'Closing'],
      ar: ['فود تروك', 'التجهيز', 'الخدمة', 'التسليم', 'الإغلاق'] },
    boutique: { icon: 'shopping_bag',
      fr: ['Boutique', 'Vente', 'Réassort', 'Réservations', 'Retours'],
      en: ['Boutique', 'Sales', 'Restocking', 'Reservations', 'Returns'],
      ar: ['متجر', 'البيع', 'تجديد المخزون', 'الحجوزات', 'المرتجعات'] },
    epicerie: { icon: 'shopping_basket',
      fr: ['Épicerie', 'Caisse', 'Réassort', 'Crédit', 'Inventaire'],
      en: ['Grocery', 'Till', 'Restocking', 'Credit', 'Inventory'],
      ar: ['بقالة', 'الصندوق', 'تجديد المخزون', 'الائتمان', 'الجرد'] },
    pharmacie: { icon: 'medical_services',
      fr: ['Pharmacie', 'Ordonnances', 'Comptoir', 'Lots', 'Garde'],
      en: ['Pharmacy', 'Prescriptions', 'Counter', 'Batches', 'On-call duty'],
      ar: ['صيدلية', 'الوصفات الطبية', 'الكاونتر', 'الدفعات', 'الحراسة'] },
    librairie: { icon: 'menu_book',
      fr: ['Librairie', 'Vente', 'Commandes', 'Réception', 'Inventaire'],
      en: ['Bookshop', 'Sales', 'Orders', 'Receiving', 'Inventory'],
      ar: ['مكتبة', 'البيع', 'الطلبات', 'الاستلام', 'الجرد'] },
    fleuriste: { icon: 'local_florist',
      fr: ['Fleuriste', 'Bouquets', 'Commandes', 'Fraîcheur', 'Livraison'],
      en: ['Florist', 'Bouquets', 'Orders', 'Freshness', 'Delivery'],
      ar: ['بائع الزهور', 'باقات الورد', 'الطلبات', 'النضارة', 'التوصيل'] },
    pressing: { icon: 'checkroom',
      fr: ['Pressing', 'Réception', 'Atelier', 'Rangement', 'Retrait'],
      en: ['Dry cleaner', 'Drop-off', 'Workshop', 'Storage', 'Collection'],
      ar: ['مصبنة', 'الاستلام', 'الورشة', 'الترتيب', 'تسلم الزبون'] },
    spa: { icon: 'auto_awesome',
      fr: ['Spa', 'Accueil', 'Rendez-vous', 'Cabines', 'Prestations'],
      en: ['Spa', 'Reception', 'Appointments', 'Treatment rooms', 'Treatments'],
      ar: ['سبا', 'الاستقبال', 'المواعيد', 'غرف العلاج', 'الخدمات'] },
    coiffure: { icon: 'content_cut',
      fr: ['Salon de coiffure', 'Accueil', 'Rendez-vous', 'Postes', 'Encaissement'],
      en: ['Hair salon', 'Reception', 'Appointments', 'Stations', 'Payment'],
      ar: ['صالون الحلاقة', 'الاستقبال', 'المواعيد', 'المقاعد', 'الأداء'] },
    hotel: { icon: 'hotel',
      fr: ['Hôtel / Riad', 'Arrivées', 'Chambres', 'Ménage', 'Départs'],
      en: ['Hotel / Riad', 'Arrivals', 'Rooms', 'Housekeeping', 'Departures'],
      ar: ['فندق / رياض', 'الوصول', 'الغرف', 'التنظيف', 'المغادرة'] },
    gym: { icon: 'fitness_center',
      fr: ['Salle de sport', 'Accueil', 'Cours', 'Coaching', 'Adhérents'],
      en: ['Gym', 'Reception', 'Classes', 'Coaching', 'Members'],
      ar: ['قاعة رياضة', 'الاستقبال', 'الحصص', 'التدريب', 'المشتركون'] },
    autre: { icon: 'business_center',
      fr: ['Établissement', 'Accueil', 'Opérations', 'Suivi', 'Clôture'],
      en: ['Establishment', 'Reception', 'Operations', 'Follow-up', 'Closing'],
      ar: ['مؤسسة', 'الاستقبال', 'العمليات', 'المتابعة', 'الإغلاق'] },
  };
  var ALIASES = {
    'fast-food': 'fastfood', fast_food: 'fastfood', restauration_rapide: 'fastfood',
    boulangerie: 'bakery', patisserie: 'bakery', pâtisserie: 'bakery',
    caterer: 'traiteur', 'food-truck': 'foodtruck', food_truck: 'foodtruck',
    grocery: 'epicerie', épicerie: 'epicerie', pharmacy: 'pharmacie', bookstore: 'librairie',
    florist: 'fleuriste', laundry: 'pressing', blanchisserie: 'pressing', hair_salon: 'coiffure',
    salon: 'coiffure', hôtel: 'hotel', riad: 'hotel', fitness: 'gym',
  };

  function canonical(value) {
    var key = String(value || '').trim().toLowerCase().replace(/\s+/g, '_');
    return ALIASES[key] || (TRADES[key] ? key : 'autre');
  }
  /* Libellé et repères du métier dans la langue de la page (français si la
     langue n'a pas de liste). */
  function tradeText(trade) {
    var lang = locale();
    var list = trade[lang === 'ar-MA' ? 'ar' : lang === 'en-GB' ? 'en' : 'fr'] || trade.fr;
    return { label: list[0], steps: list.slice(1) };
  }
  function drawIcons() {
    if (window.KiwiIcon && typeof window.KiwiIcon.render === 'function') window.KiwiIcon.render(document);
  }
  function isDining(value) {
    return ['restaurant', 'cafe', 'café'].indexOf(String(value || '').trim().toLowerCase()) !== -1;
  }
  /* The venue type is old/blank on some long-lived merchants. That missing
     metadata must never demote a real waiter to the generic employee home: the
     restaurant workspace (tables, menu, bill requests and checkout) is the
     safer source of truth for an explicitly floor-facing role. Managers/owners
     are only inferred from the presence of a floor, because those roles exist
     in every vertical. */
  function isRestaurantService(data) {
    var employee = data && data.employee || {};
    var raw = employee.role || employee.department || '';
    var roles = window.KiwiRoles;
    var id = roles && typeof roles.idOf === 'function' ? roles.idOf(raw) : '';
    if (['serveur', 'chefrang', 'maitre', 'barman'].indexOf(id) !== -1) return true;

    var label = String(raw || '').trim().toLowerCase();
    try { label = label.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); } catch (_) {}
    label = label.replace(/[’`´]/g, "'").replace(/\s+/g, ' ');
    if (/^(serveur|serveuse|server|waiter|waitress|chef de rang|maitre d[' ]hotel|barman|barmaid)$/.test(label)) return true;
    if (!id && /^(manager|proprietaire|owner|accueil|host|hostess)$/.test(label)) {
      id = /^(manager)$/.test(label) ? 'manager' : /^(proprietaire|owner)$/.test(label) ? 'proprietaire' : 'accueil';
    }

    var tables = data && data.floor && data.floor.tables;
    var hasFloor = Array.isArray(tables) && tables.length > 0;
    return hasFloor && ['manager', 'proprietaire', 'accueil'].indexOf(id) !== -1;
  }
  function usesTradeWorkspace(data) {
    if (!data || !data.employee || !data.store) return false;
    var type = String(data.store.type || '').trim();
    if (isDining(type)) return false;
    if (!type && isRestaurantService(data)) return false;
    return true;
  }
  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char];
    });
  }
  function locale() {
    var lang = String(document.documentElement.lang || 'fr').toLowerCase();
    return lang.indexOf('ar') === 0 ? 'ar-MA' : lang.indexOf('en') === 0 ? 'en-GB' : 'fr-FR';
  }
  function copy() {
    var lang = locale();
    if (lang === 'ar-MA') return {
      eyebrow: 'مساحتي المهنية', service: 'خدمتي', live: 'في الخدمة', off: 'خارج الخدمة', pause: 'في استراحة',
      since: 'منذ', next: 'الخدمة القادمة', none: 'لا توجد خدمة منشورة قادمة', team: 'الفريق الآن',
      alone: 'لا يوجد زميل آخر مسجل حالياً', requests: 'طلبات قيد الانتظار', messages: 'آخر الرسائل',
      noMessages: 'لا توجد رسالة جديدة', refresh: 'تحديث', planning: 'التخطيط والطلبات', leave: 'طلب إجازة',
      availability: 'تحديد التوفر', notifications: 'فتح الرسائل', landmarks: 'مراحل العمل', today: 'اليوم',
    };
    if (lang === 'en-GB') return {
      eyebrow: 'My trade workspace', service: 'My shift', live: 'On duty', off: 'Off duty', pause: 'On break',
      since: 'Since', next: 'Next shift', none: 'No upcoming published shift', team: 'Team now',
      alone: 'No other colleague is clocked in', requests: 'Pending requests', messages: 'Latest messages',
      noMessages: 'No new message', refresh: 'Refresh', planning: 'Planning & requests', leave: 'Request leave',
      availability: 'Set availability', notifications: 'Open messages', landmarks: 'Trade flow', today: 'Today',
    };
    return {
      eyebrow: 'Mon espace métier', service: 'Mon service', live: 'En service', off: 'Hors service', pause: 'En pause',
      since: 'Depuis', next: 'Prochain service', none: 'Aucun prochain service publié', team: "L'équipe maintenant",
      alone: "Aucun autre collègue n'est pointé", requests: 'Demandes en attente', messages: 'Derniers messages',
      noMessages: 'Aucun nouveau message', refresh: 'Actualiser', planning: 'Planning & demandes', leave: 'Demander un congé',
      availability: 'Mes disponibilités', notifications: 'Ouvrir les messages', landmarks: 'Repères du métier', today: "Aujourd'hui",
    };
  }
  function dateKey() {
    try { return new (globalThis.KiwiZoneLaw?.DateTimeFormat || Intl.DateTimeFormat)('en-CA', { timeZone: lastData && lastData.store && lastData.store.timezone || 'Africa/Casablanca' }).format(new Date()); }
    catch (_) { return new Date().toISOString().slice(0, 10); }
  }
  function dateLabel(day) {
    try { return new Date(day + 'T12:00:00').toLocaleDateString(locale(), { weekday: 'short', day: 'numeric', month: 'short' }); }
    catch (_) { return day; }
  }
  function timeLabel(ts) {
    var n = Number(ts);
    if (!n) return '';
    try { return new Date(n).toLocaleTimeString(locale(), { timeZone: (globalThis.KiwiZoneLaw?.effectiveZone((lastData && lastData.store && lastData.store.timezone || 'Africa/Casablanca'), n) || (lastData && lastData.store && lastData.store.timezone || 'Africa/Casablanca')), hour: '2-digit', minute: '2-digit' }); }
    catch (_) { return ''; }
  }
  function nextShift(data) {
    var today = dateKey();
    var schedule = data && data.schedule || {};
    var days = Object.keys(schedule).filter(function (day) {
      var shift = schedule[day];
      return day >= today && shift && !shift.off && shift.start && shift.end;
    }).sort();
    return days.length ? Object.assign({ day: days[0] }, schedule[days[0]]) : null;
  }
  function pendingCount(data) {
    var planning = data && data.planning || {};
    return (planning.requests || []).filter(function (item) { return item && item.status === 'pending'; }).length
      + (planning.openShifts || []).filter(function (item) { return item && item.mine && item.status === 'claimed'; }).length
      + (planning.swapRequests || []).filter(function (item) { return item && item.mine && ['open', 'claimed'].indexOf(item.status) !== -1; }).length;
  }
  function activeColleagues(data) {
    return (data && data.colleagues || []).filter(function (person) {
      return person && person.id !== (data.employee && data.employee.id) && person.status !== 'off-duty';
    });
  }
  function messageList(data) {
    return (data && data.messages || []).slice(-3).reverse();
  }
  function status(data) {
    var open = data && data.attendance && data.attendance.open;
    if (!open) return { key: 'off', since: '' };
    return { key: open.pauseTs ? 'pause' : 'live', since: timeLabel(open.inTs) };
  }
  function nav(tab) {
    var button = document.querySelector('.bt-btn[data-tab="' + tab + '"]');
    if (button) button.click();
  }
  function openPlanning(action) {
    nav('profil');
    setTimeout(function () {
      var card = document.getElementById('kep-card');
      if (card) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
      if (action) {
        var button = document.querySelector('[data-kep="' + action + '"]');
        if (button) button.click();
      }
    }, 90);
  }
  function installActions(root) {
    if (root.dataset.etsBound) return;
    root.dataset.etsBound = '1';
    root.addEventListener('click', function (event) {
      var button = event.target.closest('[data-ets-action]');
      if (!button) return;
      var action = button.dataset.etsAction;
      if (action === 'refresh' && window.KiwiEmployeeLive) {
        button.disabled = true;
        KiwiEmployeeLive.refresh().catch(function () {}).finally(function () { button.disabled = false; });
      } else if (action === 'messages') nav('notifications');
      else if (action === 'planning') openPlanning('');
      else if (action === 'leave') openPlanning('leave');
      else if (action === 'availability') openPlanning('availability');
    });
  }
  function configureNav(trade) {
    var first = document.querySelector('.bt-btn[data-tab="tables"]');
    var menu = document.querySelector('.bt-btn[data-tab="menu"]');
    if (first) {
      first.setAttribute('aria-label', copy().service);
      first.title = copy().service;
      first.innerHTML = '<i data-icon="' + esc(trade.icon) + '"></i>';
    }
    if (menu) menu.hidden = true;
  }
  function restoreRestaurantWorkspace() {
    document.body.classList.remove('employee-trade-mode');
    Object.keys(TRADES).forEach(function (id) { document.body.classList.remove('trade-' + id); });
    var root = document.getElementById('employee-trade-home');
    if (root) root.remove();
    var first = document.querySelector('.bt-btn[data-tab="tables"]');
    var menu = document.querySelector('.bt-btn[data-tab="menu"]');
    if (first) {
      first.setAttribute('aria-label', 'Tables');
      first.title = 'Tables';
      first.innerHTML = '<i data-icon="restaurant"></i>';
    }
    if (menu) menu.hidden = false;
    drawIcons();
  }
  function mount(data) {
    if (!usesTradeWorkspace(data)) {
      restoreRestaurantWorkspace();
      return;
    }
    lastData = data;
    currentTrade = canonical(data.store.type);
    var trade = TRADES[currentTrade] || TRADES.autre;
    document.body.classList.add('employee-trade-mode', 'trade-' + currentTrade);
    configureNav(trade);
    var tab = document.querySelector('.tab-tables');
    if (!tab) return;
    var root = document.getElementById('employee-trade-home');
    if (!root) {
      root = document.createElement('section');
      root.id = 'employee-trade-home';
      root.className = 'ets-home';
      tab.insertBefore(root, tab.firstChild);
      installActions(root);
    }
    render(root, data, trade);
    renderedDay = dateKey();
    drawIcons();
  }
  function render(root, data, trade) {
    var C = copy();
    var text = tradeText(trade);
    var work = status(data);
    var next = nextShift(data);
    var team = activeColleagues(data);
    var messages = messageList(data);
    var pending = pendingCount(data);
    var stateLabel = work.key === 'live' ? C.live : work.key === 'pause' ? C.pause : C.off;
    var role = data.employee.role || data.employee.department || '';
    root.innerHTML = '<header class="ets-hero"><div class="ets-hero-icon"><i data-icon="' + esc(trade.icon) + '"></i></div>'
      + '<div class="ets-hero-copy"><span class="ets-eyebrow">' + esc(C.eyebrow) + ' · ' + esc(text.label) + '</span>'
      + '<h1>' + esc(data.employee.firstName || data.employee.name || 'Kiwi') + '</h1><p>' + esc([role, data.store.name].filter(Boolean).join(' · ')) + '</p></div>'
      + '<button class="ets-icon-btn" data-ets-action="refresh" type="button" aria-label="' + esc(C.refresh) + '"><i data-icon="refresh"></i></button></header>'
      + '<div class="ets-live-card ' + esc(work.key) + '"><div><span class="ets-status-dot"></span><b>' + esc(stateLabel) + '</b>'
      + (work.since ? '<small>' + esc(C.since) + ' ' + esc(work.since) + '</small>' : '') + '</div>'
      + '<div class="ets-next"><span>' + esc(C.next) + '</span><strong>' + (next ? esc(dateLabel(next.day) + ' · ' + next.start + '–' + next.end) : esc(C.none)) + '</strong></div></div>'
      + '<section class="ets-flow"><div class="ets-section-head"><div><span>' + esc(C.landmarks) + '</span><b>' + esc(text.label) + '</b></div></div>'
      + '<div class="ets-flow-grid">' + text.steps.map(function (step, index) { return '<div class="ets-flow-step"><em>' + (index + 1) + '</em><span>' + esc(step) + '</span></div>'; }).join('') + '</div></section>'
      + '<div class="ets-metrics"><article><span>' + esc(C.team) + '</span><strong>' + team.length + '</strong><small>' + (team.length ? esc(team.map(function (person) { return person.firstName || person.name; }).filter(Boolean).join(', ')) : esc(C.alone)) + '</small></article>'
      + '<article><span>' + esc(C.requests) + '</span><strong>' + pending + '</strong><small>' + esc(C.planning) + '</small></article></div>'
      + '<div class="ets-actions"><button type="button" data-ets-action="planning"><i data-icon="calendar_month"></i><span>' + esc(C.planning) + '</span></button>'
      + '<button type="button" data-ets-action="availability"><i data-icon="event_available"></i><span>' + esc(C.availability) + '</span></button>'
      + '<button type="button" data-ets-action="leave"><i data-icon="event_busy"></i><span>' + esc(C.leave) + '</span></button>'
      + '<button type="button" data-ets-action="messages"><i data-icon="chat"></i><span>' + esc(C.notifications) + '</span></button></div>'
      + '<section class="ets-messages"><div class="ets-section-head"><div><span>' + esc(C.messages) + '</span><b>' + (messages.length || 0) + '</b></div></div>'
      + (messages.length ? '<div class="ets-message-list">' + messages.map(function (message) {
        return '<article><div><b>' + esc(message.sender || data.store.name) + '</b><time>' + esc(timeLabel(message.ts)) + '</time></div><p>' + esc(message.text || '') + '</p></article>';
      }).join('') + '</div>' : '<p class="ets-empty">' + esc(C.noMessages) + '</p>') + '</section>';
  }

  document.addEventListener('kiwi-employee-data', function (event) { mount(event.detail); });
  window.addEventListener('load', function () {
    var data = window.KiwiEmployeeLive && KiwiEmployeeLive.data && KiwiEmployeeLive.data();
    if (data) mount(data);
  });
  function redrawOnDayChange() { if (lastData && renderedDay !== dateKey()) mount(lastData); }
  window.addEventListener('focus', redrawOnDayChange);
  setInterval(redrawOnDayChange, 60000);
  window.KiwiEmployeeTradeShell = {
    canonical: canonical, isDining: isDining, isRestaurantService: isRestaurantService,
    usesTradeWorkspace: usesTradeWorkspace, trades: Object.keys(TRADES), mount: mount,
    tradeText: function (id) { return tradeText(TRADES[canonical(id)] || TRADES.autre); },
    tradeIcon: function (id) { return (TRADES[canonical(id)] || TRADES.autre).icon; },
  };
})();
