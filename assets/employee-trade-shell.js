/* Kiwi employee self-service — trade-aware workspace for non-dining venues. */
(function () {
  'use strict';

  var lastData = null;
  var currentTrade = '';

  var TRADES = {
    fastfood:      { label: 'Restauration rapide', icon: 'sandwich', steps: ['Comptoir', 'Préparation', 'Remise', 'Nettoyage'] },
    pizzeria:      { label: 'Pizzeria', icon: 'pizza', steps: ['Commandes', 'Préparation', 'Four', 'Livraison'] },
    bakery:        { label: 'Boulangerie', icon: 'croissant', steps: ['Comptoir', 'Fournil', 'Commandes', 'Invendus'] },
    traiteur:      { label: 'Traiteur', icon: 'cooking-pot', steps: ['Préparation', 'Conditionnement', 'Chargement', 'Service'] },
    foodtruck:     { label: 'Food truck', icon: 'truck', steps: ['Mise en place', 'Service', 'Remise', 'Fermeture'] },
    boutique:      { label: 'Boutique', icon: 'shopping-bag', steps: ['Vente', 'Réassort', 'Réservations', 'Retours'] },
    epicerie:      { label: 'Épicerie', icon: 'shopping-basket', steps: ['Caisse', 'Réassort', 'Crédit', 'Inventaire'] },
    pharmacie:     { label: 'Pharmacie', icon: 'cross', steps: ['Ordonnances', 'Comptoir', 'Lots', 'Garde'] },
    librairie:     { label: 'Librairie', icon: 'book-open', steps: ['Vente', 'Commandes', 'Réception', 'Inventaire'] },
    fleuriste:     { label: 'Fleuriste', icon: 'flower-2', steps: ['Bouquets', 'Commandes', 'Fraîcheur', 'Livraison'] },
    pressing:      { label: 'Pressing', icon: 'shirt', steps: ['Réception', 'Atelier', 'Rangement', 'Retrait'] },
    spa:           { label: 'Spa', icon: 'sparkles', steps: ['Accueil', 'Rendez-vous', 'Cabines', 'Prestations'] },
    coiffure:      { label: 'Salon de coiffure', icon: 'scissors', steps: ['Accueil', 'Rendez-vous', 'Postes', 'Encaissement'] },
    hotel:         { label: 'Hôtel / Riad', icon: 'hotel', steps: ['Arrivées', 'Chambres', 'Ménage', 'Départs'] },
    gym:           { label: 'Salle de sport', icon: 'dumbbell', steps: ['Accueil', 'Cours', 'Coaching', 'Adhérents'] },
    autre:         { label: 'Établissement', icon: 'briefcase-business', steps: ['Accueil', 'Opérations', 'Suivi', 'Clôture'] },
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
  function isDining(value) {
    return ['restaurant', 'cafe', 'café'].indexOf(String(value || '').trim().toLowerCase()) !== -1;
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
    try { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Casablanca' }).format(new Date()); }
    catch (_) { return new Date().toISOString().slice(0, 10); }
  }
  function dateLabel(day) {
    try { return new Date(day + 'T12:00:00').toLocaleDateString(locale(), { weekday: 'short', day: 'numeric', month: 'short' }); }
    catch (_) { return day; }
  }
  function timeLabel(ts) {
    var n = Number(ts);
    if (!n) return '';
    try { return new Date(n).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' }); }
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
      first.innerHTML = '<i data-lucide="' + esc(trade.icon) + '"></i>';
    }
    if (menu) menu.hidden = true;
  }
  function mount(data) {
    if (!data || !data.employee || !data.store || isDining(data.store.type)) return;
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
    if (window.lucide) window.lucide.createIcons();
  }
  function render(root, data, trade) {
    var C = copy();
    var work = status(data);
    var next = nextShift(data);
    var team = activeColleagues(data);
    var messages = messageList(data);
    var pending = pendingCount(data);
    var stateLabel = work.key === 'live' ? C.live : work.key === 'pause' ? C.pause : C.off;
    var role = data.employee.role || data.employee.department || '';
    root.innerHTML = '<header class="ets-hero"><div class="ets-hero-icon"><i data-lucide="' + esc(trade.icon) + '"></i></div>'
      + '<div class="ets-hero-copy"><span class="ets-eyebrow">' + esc(C.eyebrow) + ' · ' + esc(trade.label) + '</span>'
      + '<h1>' + esc(data.employee.firstName || data.employee.name || 'Kiwi') + '</h1><p>' + esc([role, data.store.name].filter(Boolean).join(' · ')) + '</p></div>'
      + '<button class="ets-icon-btn" data-ets-action="refresh" type="button" aria-label="' + esc(C.refresh) + '"><i data-lucide="refresh-cw"></i></button></header>'
      + '<div class="ets-live-card ' + esc(work.key) + '"><div><span class="ets-status-dot"></span><b>' + esc(stateLabel) + '</b>'
      + (work.since ? '<small>' + esc(C.since) + ' ' + esc(work.since) + '</small>' : '') + '</div>'
      + '<div class="ets-next"><span>' + esc(C.next) + '</span><strong>' + (next ? esc(dateLabel(next.day) + ' · ' + next.start + '–' + next.end) : esc(C.none)) + '</strong></div></div>'
      + '<section class="ets-flow"><div class="ets-section-head"><div><span>' + esc(C.landmarks) + '</span><b>' + esc(trade.label) + '</b></div></div>'
      + '<div class="ets-flow-grid">' + trade.steps.map(function (step, index) { return '<div class="ets-flow-step"><em>' + (index + 1) + '</em><span>' + esc(step) + '</span></div>'; }).join('') + '</div></section>'
      + '<div class="ets-metrics"><article><span>' + esc(C.team) + '</span><strong>' + team.length + '</strong><small>' + (team.length ? esc(team.map(function (person) { return person.firstName || person.name; }).filter(Boolean).join(', ')) : esc(C.alone)) + '</small></article>'
      + '<article><span>' + esc(C.requests) + '</span><strong>' + pending + '</strong><small>' + esc(C.planning) + '</small></article></div>'
      + '<div class="ets-actions"><button type="button" data-ets-action="planning"><i data-lucide="calendar-days"></i><span>' + esc(C.planning) + '</span></button>'
      + '<button type="button" data-ets-action="availability"><i data-lucide="calendar-check"></i><span>' + esc(C.availability) + '</span></button>'
      + '<button type="button" data-ets-action="leave"><i data-lucide="calendar-off"></i><span>' + esc(C.leave) + '</span></button>'
      + '<button type="button" data-ets-action="messages"><i data-lucide="message-square-text"></i><span>' + esc(C.notifications) + '</span></button></div>'
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
  window.KiwiEmployeeTradeShell = { canonical: canonical, isDining: isDining, trades: Object.keys(TRADES), mount: mount };
})();
