/* Kiwi · hôtel en direct (B23)
 *
 * Une réservation prise en ligne (H-CF2F6C4B, 9 nov. 2026) n'apparaissait sur
 * le tableau de bord ouvert qu'après un rechargement : la relecture toutes les
 * 30 s ne tournait que sur la page « Réservations & RDV », et les pages de la
 * réception (Réservations & séjours, Réception, Plan des chambres, Ménage,
 * Accueil) ne relisaient qu'au chargement ou au retour sur l'onglet.
 *
 * Ici, sur un établissement hôtelier réel et tant que l'onglet est visible, les
 * documents « reservations » et « rooms » sont relus toutes les 30 s, quelle que
 * soit la page. Une nouvelle réservation en ligne, ou l'annulation d'une
 * réservation en ligne, se dit par un message et s'ajoute en tête de la cloche
 * des notifications (comme assets/quarantine-ui.js). Les réservations déjà là à
 * l'ouverture de la page ne sont pas annoncées. */
(function () {
  'use strict';
  var POLL_MS = 30000;
  var COPY = {
    fr: { booked: 'Nouvelle réservation en ligne', cancelled: 'Réservation en ligne annulée', room: 'Ch.', title: 'Réservations en ligne' },
    en: { booked: 'New online booking', cancelled: 'Online booking cancelled', room: 'Room', title: 'Online bookings' },
    ar: { booked: 'حجز جديد عبر الإنترنت', cancelled: 'أُلغي حجز عبر الإنترنت', room: 'غرفة', title: 'الحجوزات عبر الإنترنت' }
  };
  var ACTIVE = { requested: 1, confirmed: 1, checked_in: 1 };
  var seen = null, events = [];

  function lang() {
    var l = '';
    try { l = (window.KiwiI18n && window.KiwiI18n.getLang && window.KiwiI18n.getLang()) || ''; } catch (_) {}
    return l === 'en' || l === 'ar' ? l : 'fr';
  }
  function L() { return COPY[lang()]; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function onHotel() {
    try {
      var real = window.KiwiCloudDoc && window.KiwiCloudDoc.isReal && window.KiwiCloudDoc.isReal();
      var type = window.KiwiVenue && window.KiwiVenue.getVenueType && window.KiwiVenue.getVenueType();
      return !!real && /hotel|riad/i.test(String(type || ''));
    } catch (_) { return false; }
  }
  function bookings() {
    try { var d = window.KiwiReservations && window.KiwiReservations.get && window.KiwiReservations.get(); return (d && d.bookings) || []; } catch (_) { return []; }
  }
  function roomLabel(b) {
    var id = b && b.resourceId, n = '';
    try {
      var doc = window.KiwiHotelRooms && window.KiwiHotelRooms.current && window.KiwiHotelRooms.current();
      var room = doc && (doc.rooms || []).find(function (r) { return r && r.id === id; });
      n = room ? room.n : '';
    } catch (_) {}
    if (!n && /^room:/.test(String(id || ''))) n = String(id).slice(5);
    return n ? L().room + ' ' + n : '';
  }
  function day(iso) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(iso || ''))) return '';
    try { return new Intl.DateTimeFormat(lang() === 'ar' ? 'ar-MA' : lang() === 'en' ? 'en-GB' : 'fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(iso + 'T12:00:00Z')); } catch (_) { return iso; }
  }
  function line(b) {
    var h = b.hotel || {}, dates = h.checkIn && h.checkOut ? day(h.checkIn) + ' → ' + day(h.checkOut) : '';
    return [b.code || '', roomLabel(b), dates].filter(Boolean).join(' · ');
  }

  function docRead() {
    try { return (window.KiwiCloudDoc.status() || []).some(function (s) { return s.feature === 'reservations' && s.read; }); } catch (_) { return false; }
  }
  /* Compare la liste des réservations à celle déjà vue. La première lecture, une fois la
     copie serveur lue, ne fait que mémoriser : rien n'est annoncé à l'ouverture. */
  function scan() {
    if (!onHotel() || (!seen && !docRead())) return;
    var now = {}, fresh = [];
    bookings().forEach(function (b) {
      if (!b || !b.id) return;
      now[b.id] = b.status;
      if (!seen || b.source !== 'public') return;
      if (!(b.id in seen) && ACTIVE[b.status]) fresh.push({ kind: 'booked', b: b });
      else if (b.id in seen && ACTIVE[seen[b.id]] && b.status === 'cancelled') fresh.push({ kind: 'cancelled', b: b });
    });
    var first = !seen;
    seen = now;
    if (first) return;
    fresh.forEach(function (e) {
      var item = { kind: e.kind, text: line(e.b), at: Date.now() };
      events.unshift(item);
      try { window.Kiwi && window.Kiwi.toast && window.Kiwi.toast(L()[e.kind], { type: e.kind === 'booked' ? 'success' : 'warn', desc: item.text }); } catch (_) {}
    });
    if (events.length > 20) events.length = 20;
  }

  function poll() {
    try {
      if (document.visibilityState === 'visible' && onHotel() && window.KiwiCloudDoc && window.KiwiCloudDoc.pullFeatures) {
        window.KiwiCloudDoc.pullFeatures(['reservations', 'rooms']).then(scan, function () {});
      }
    } catch (_) {}
  }

  /* La cloche : ses notifications sont construites ailleurs ; une fois ouverte,
     on met en tête ce qui vient d'arriver en ligne. */
  function bellHtml() {
    var c = L();
    return '<div id="kiwi-hotel-live">' + events.map(function (e) {
      return '<div class="notif unread"><div class="n-body"><div class="n-title">' + esc(c[e.kind]) + '</div><div class="n-desc">' + esc(e.text) + '</div>' +
        '<div class="n-time">' + esc(new Date(e.at).toTimeString().slice(0, 5)) + '</div></div></div>';
    }).join('') + '</div>';
  }
  function addToBell() {
    if (!events.length) return;
    var backs = document.querySelectorAll('.kiwi-drawer-backdrop'), back = backs[backs.length - 1];
    var body = back && back.querySelector('.kiwi-drawer-body');
    if (!body || body.querySelector('#kiwi-hotel-live')) return;
    if (!body.querySelector('.notif')) body.innerHTML = '';
    body.insertAdjacentHTML('afterbegin', bellHtml());
  }
  function wire() {
    var H = window.Kiwi && window.Kiwi.handlers; if (!H) return;
    if (typeof H.notifications === 'function' && !H.notifications.__hotelLive) {
      var base = H.notifications;
      H.notifications = function () { var r = base.apply(this, arguments); addToBell(); return r; };
      H.notifications.__hotelLive = true;
    }
  }

  window.addEventListener('kiwi-reservations-changed', scan);
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') poll(); });
  setTimeout(function () { wire(); scan(); }, 2000);
  setInterval(poll, POLL_MS);
  window.KiwiHotelLive = { scan: scan, poll: poll, events: function () { return events.slice(); }, bellHtml: bellHtml };
})();
