/* Operator projection deliberately contains no ids, cookies or credentials. */
(function () {
  'use strict';
  var root = document.querySelector('main');
  if (!root) return;
  var COPY = {
    fr: ['Encore sur pages.dev', 'Commerce', 'Rôle de l’appareil', 'Dernière présence', 'Aucun appareil vu depuis 7 jours.', 'Liste indisponible.', 'Caisse', 'Cuisine', 'Employé', 'Propriétaire', 'Serveur'],
    en: ['Still on pages.dev', 'Merchant', 'Device role', 'Last seen', 'No devices seen in the last 7 days.', 'List unavailable.', 'Till', 'Kitchen', 'Employee', 'Owner', 'Waiter'],
    ar: ['ما زال على pages.dev', 'المتجر', 'دور الجهاز', 'آخر ظهور', 'لا توجد أجهزة خلال آخر 7 أيام.', 'القائمة غير متاحة.', 'الصندوق', 'المطبخ', 'الموظف', 'المالك', 'النادل']
  };
  var card = document.createElement('section'); card.className = 'origin-device-card'; root.prepend(card);
  var rows = [], unavailable = false;
  function render() {
    var lang = document.documentElement.lang || 'fr';
    try { lang = localStorage.getItem('kiwiLang') || lang; } catch (_) {}
    var c = COPY[lang] || COPY.fr;
    card.replaceChildren();
    var h = document.createElement('h2'); h.textContent = c[0]; card.appendChild(h);
    if (unavailable || !rows.length) { var p = document.createElement('p'); p.textContent = c[unavailable ? 5 : 4]; card.appendChild(p); return; }
    var table = document.createElement('table');
    var head = table.createTHead().insertRow();
    c.slice(1, 4).forEach(function (label) { var th = document.createElement('th'); th.scope = 'col'; th.textContent = label; head.appendChild(th); });
    var body = table.createTBody();
    rows.forEach(function (device) {
      var tr = body.insertRow();
      var roles = { till: c[6], kitchen: c[7], employee: c[8], owner: c[9], waiter: c[10] };
      [device.name, roles[device.role] || '', new Date(device.last_seen).toLocaleString(lang)].forEach(function (value) { tr.insertCell().textContent = value; });
    });
    card.appendChild(table);
  }
  async function load() {
    try {
      var r = await fetch('/api/admin/origin-devices', { cache: 'no-store', credentials: 'same-origin' });
      if (!r.ok) throw new Error('unavailable');
      rows = (await r.json()).devices || []; unavailable = false;
    } catch (_) { unavailable = true; }
    render();
  }
  new MutationObserver(render).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
  load(); setInterval(load, 60000);
})();
