/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · Hotel vertical.
 *
 * Pages (sidebar · VERTICAL_SECTIONS.hotel in venues.js):
 *   Réception · Plan des chambres · Réservations & séjours (tape chart) ·
 *   Ménage · Tarifs & occupation · Folios ·
 *   Canaux & OTA · Intelligence hôtel
 *
 * The folio engine is the strategic core: restaurant (POS) and hammam (spa)
 * charges post straight onto the room bill, taxe de séjour included — one
 * property, one system, one source of truth.
 *
 * Two operating modes were switched per-venue at runtime:
 *  · DEMO — the Riad Yasmina property (24 chambres, Médina de Marrakech).
 *    UNREACHABLE since dashboard2.html and its venues2.js fork were
 *    deleted: no surviving venue registry declares that venue, so the
 *    branch can never activate. Dead weight — safe to strip.
 *  · CUSTOM — any 0000-onboarded hotel: starter pages on the live
 *    rack/folio engine, sized by the step-2 « rooms » answer. This is the
 *    only live path today.
 * This file also owns the onboarding-wizard fork (obOnboard) that adds the
 * « Hôtel / Riad » trade to the 0000 flow.
 * ─────────────────────────────────────────────────────────────────────────── */
(() => {
  'use strict';

  /* Accès privés paresseux : aucun état n'est lu pendant cette liaison. */
  window.__kiwiHotelInternal.bind(Object.freeze({
    get CHANNELS() { return CHANNELS; },
    get DIRECT_TREND() { return DIRECT_TREND; },
    get F() { return F; },
    get FOLIOS() { return FOLIOS; },
    get HK_DONE() { return HK_DONE; },
    get HK_QUEUE() { return HK_QUEUE; },
    get HK_STAFF() { return HK_STAFF; },
    get HX_TARIFF_SYNC_COPY() { return HX_TARIFF_SYNC_COPY; },
    get K() { return K; },
    get MAD() { return MAD; },
    get QUICK_ITEMS() { return QUICK_ITEMS; },
    get R() { return R; },
    get ROOMS() { return ROOMS; },
    get SRC() { return SRC; },
    get SRC_DOT() { return SRC_DOT; },
    get SRC_LBL() { return SRC_LBL; },
    get TYPES() { return TYPES; },
    get cuAwaitTariffAck() { return cuAwaitTariffAck; },
    get cuBoards() { return cuBoards; },
    get cuChannelState() { return cuChannelState; },
    get cuCommercialError() { return cuCommercialError; },
    get cuCommercialState() { return cuCommercialState; },
    get cuDay() { return cuDay; },
    get cuDraftMoney() { return cuDraftMoney; },
    get cuDraftStatus() { return cuDraftStatus; },
    get cuKinds() { return cuKinds; },
    get cuLoadCommercial() { return cuLoadCommercial; },
    get cuLoadPerformance() { return cuLoadPerformance; },
    get cuMerchantSlug() { return cuMerchantSlug; },
    get cuPerfByScope() { return cuPerfByScope; },
    get cuRoomStatus() { return cuRoomStatus; },
    get cuSave() { return cuSave; },
    get cuStamp() { return cuStamp; },
    get cuStarter() { return cuStarter; },
    get cuState() { return cuState; },
    get cuStayScope() { return cuStayScope; },
    get cuStrip() { return cuStrip; },
    get cuTypes() { return cuTypes; },
    get cuWarmState() { return cuWarmState; },
    get donutCss() { return donutCss; },
    get esc() { return esc; },
    get fmt() { return fmt; },
    get folioBySrc() { return folioBySrc; },
    get folioPaid() { return folioPaid; },
    get folioTotal() { return folioTotal; },
    get hxLang() { return hxLang; },
    get hxLocale() { return hxLocale; },
    get hxTo() { return hxTo; },
    get isCustomHotel() { return isCustomHotel; },
    get ltr() { return ltr; },
    get rerender() { return rerender; },
    get roomTypeOf() { return roomTypeOf; },
    get srcPill() { return srcPill; },
    get toast() { return toast; },
    get tx() { return tx; },
    get txk() { return txk; },
    get txn() { return txn; },
  }));

  /* ═══════════════ HELPERS ═══════════════ */
  const fmt = (n) => (window.KiwiNumber?.format(Math.round(n), {}) ?? Math.round(n).toLocaleString(document.documentElement?.lang === 'en' ? 'en-GB' : 'fr-FR', {}));
  /* An amount reads left to right inside Arabic: the isolate keeps « MAD »
   * after the figure in a toast as well as in markup. */
  const MAD = (n) => (hxLang() === 'ar' ? '⁦' + fmt(n) + ' MAD⁩' : fmt(n) + ' MAD');
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
  /* Editors are declared outside register(), so they cannot see the
   * register-local `toast` destructuring. Always resolve the shared UI helper
   * at call time; this keeps reservation and OTA actions usable without
   * duplicating notification code in each workflow. */
  const toast = (message, options) => window.Kiwi?.toast?.(message, options);
  const TAX_PP_NIGHT = 25; // taxe de séjour (TPT + taxe communale) · MAD / adulte / nuit

  const { hxLang, hxLocale, tx, txk, HX_N, txn, ltr, hxTo, hxColon, HX_T } = window.__kiwiHotelInternal.language();

  /* ═══════════════ ROOMS · 24 chambres / 3 niveaux ═══════════════ */
  const TYPES = {
    patio:   { name: 'Chambre Patio',         base: 750 },
    confort: { name: 'Confort Médina',        base: 950 },
    suite:   { name: 'Suite Yasmina',         base: 1400 },
    royale:  { name: 'Suite Terrasse Royale', base: 1900 },
  };
  const SRC = {
    booking: { label: 'Booking.com', fee: 0.17 },
    expedia: { label: 'Expedia',     fee: 0.16 },
    airbnb:  { label: 'Airbnb',      fee: 0.03 },
    direct:  { label: 'Direct',      fee: 0 },
    walkin:  { label: 'Walk-in',     fee: 0 },
  };
  const FLOORS = [
    { lbl: 'Rez-de-chaussée · patio', rooms: [1, 2, 3, 4, 5, 6, 7, 8] },
    { lbl: '1er étage', rooms: [9, 10, 11, 12, 13, 14, 15, 16] },
    { lbl: '2e étage · terrasse', rooms: [17, 18, 19, 20, 21, 22, 23, 24] },
  ];
  const typeOf = (n) => (n <= 8 ? 'patio' : n <= 16 ? 'confort' : n <= 22 ? 'suite' : 'royale');

  /* status: occ | depart | arrivee | libre | sale | hs
   * hk (housekeeping): clean | dirty | encours | inspect */
  const ROOMS = {};
  for (let n = 1; n <= 24; n++) ROOMS[n] = { n, type: typeOf(n), status: 'libre', hk: 'clean', guest: null, meta: '' };
  function setRoom(n, status, guest, meta, hk) {
    Object.assign(ROOMS[n], { status, guest: guest || null, meta: meta || '', hk: hk || 'clean' });
  }
  // En maison (14) — arrivés avant aujourd'hui
  setRoom(1,  'occ', 'Hind & Omar Bennani',   'Booking · 3 nuits · j2');
  setRoom(2,  'occ', 'Yassine Oubella',       'Walk-in · départ demain');
  setRoom(6,  'occ', 'Mariam Bourkadi',       'Expedia · 2 nuits · j2');
  setRoom(7,  'occ', 'Ahmed & Leila El Fassi','Direct · 4 nuits · j3');
  setRoom(10, 'occ', 'Awa Diallo',            'Expedia · 4 nuits · j3');
  setRoom(11, 'occ', 'Sofia & Mehdi Alami',   'Direct · 2 nuits · j2');
  setRoom(13, 'occ', 'Famille Rousseau',      'Booking · 5 nuits · j2');
  setRoom(14, 'occ', 'Daniel Reyes',          'Direct · 3 nuits · j2');
  setRoom(17, 'occ', 'Sophie Marceau',        'Direct · 4 nuits · j3');
  setRoom(18, 'occ', 'Anna & Jonas Weber',    'Expedia · 3 nuits · j2');
  setRoom(19, 'occ', 'Famille Alaoui',        'Direct · 2 nuits · j2');
  setRoom(21, 'occ', 'Mei & Wei Chen',        'Airbnb · 3 nuits · j2');
  setRoom(22, 'occ', 'Inès & Paul Martin',    'Booking · 3 nuits · j2');
  setRoom(23, 'occ', 'Famille Lefèvre',       'Direct · 6 nuits · j4');
  // Départ en retard (1)
  setRoom(9,  'depart', 'Karim Bennis',       'Late check-out 13h · encaisser', 'dirty');
  // Arrivées du jour (7) — chambres prêtes ou en remise
  setRoom(3,  'arrivee', 'Lucía Marín',          'Booking · ETA 16h30 · 2 nuits');
  setRoom(5,  'sale',    'Rachid Benkirane',     'Arrive 18h30 · ménage en file', 'encours');
  setRoom(12, 'sale',    'Élodie & Marc Fournier', 'Arrive 17h00 · ménage en cours', 'encours');
  setRoom(15, 'arrivee', 'Sarah & Tom Whitaker', 'Airbnb · ETA 17h45 · rituel duo prépayé');
  setRoom(16, 'arrivee', 'Marta & Diego Gómez',  'Direct · ETA 16h00 · 2ᵉ séjour');
  setRoom(24, 'arrivee', 'Famille Rossi',        'Booking · ETA 15h30 · 5 nuits');
  // Libres ce soir (2) + hors-service (1)
  setRoom(4,  'libre', null, 'Libre ce soir');
  setRoom(20, 'libre', null, 'Libre ce soir');
  setRoom(8,  'hs',    null, 'Fuite SDB · plombier vendredi', 'dirty');

  /* ═══════════════ ARRIVÉES / DÉPARTS DU JOUR ═══════════════ */
  const ARRIVALS = [
    { id: 'a1', t: '15h30', guest: 'Famille Rossi',          room: 24, src: 'booking', nights: 5, pax: 4, note: 'Suite Terrasse Royale · lit bébé demandé', done: false },
    { id: 'a2', t: '16h00', guest: 'Marta & Diego Gómez',    room: 16, src: 'direct',  nights: 3, pax: 2, note: 'Client fidèle ×2 · acompte 1 180 réglé · thé sans sucre', done: false, repeat: true },
    { id: 'a3', t: '16h30', guest: 'Lucía Marín',            room: 3,  src: 'booking', nights: 2, pax: 1, note: 'Étage calme demandé', done: false },
    { id: 'a4', t: '17h00', guest: 'Élodie & Marc Fournier', room: 12, src: 'booking', nights: 3, pax: 2, note: 'Chambre en remise · ménage en cours', done: false },
    { id: 'a5', t: '17h45', guest: 'Sarah & Tom Whitaker',   room: 15, src: 'airbnb',  nights: 2, pax: 2, note: 'Rituel hammam duo prépayé · posté sur folio', done: false },
    { id: 'a6', t: '18h30', guest: 'Rachid Benkirane',       room: 5,  src: 'direct',  nights: 1, pax: 1, note: 'Réservé par téléphone ce matin', done: false },
    { id: 'a7', t: '19h00', guest: 'Famille Lemoine',        room: 9,  src: 'booking', nights: 2, pax: 3, note: 'Après late check-out · ménage à suivre', done: false },
  ];
  const DEPARTURES = [
    { id: 'd1', t: '10h30', guest: 'M. & Mme Laurent',  room: 24, folio: 6240, settled: true },
    { id: 'd2', t: '11h00', guest: 'Iker Etxeberria',   room: 16, folio: 2890, settled: true },
    { id: 'd3', t: '11h40', guest: 'Claire Dubois',     room: 12, folio: 4820, settled: true },
    { id: 'd4', t: '12h10', guest: 'Youssef Tahiri',    room: 5,  folio: 1130, settled: true },
    { id: 'd5', t: '13h00', guest: 'Karim Bennis',      room: 9,  folio: 0,    settled: false, late: true },
  ];

  /* ═══════════════ FOLIOS · le cœur stratégique ═══════════════
   * src: room | resto | spa | taxe | fee — resto/spa = lignes POS/hammam
   * postées automatiquement sur la note de chambre. */
  const FOLIOS = {};
  function folio(room, guest, src, pax, nights, lines) {
    FOLIOS[room] = { room, guest, src, pax, nights, lines };
  }
  folio(1, 'Hind & Omar Bennani', 'booking', 2, 3, [
    { t: 'hier 15h04', label: 'Nuit 1 · Chambre Patio', qty: '×1', amt: 750, src: 'room' },
    { t: 'hier 21h12', label: 'Dîner · tajine poulet ×2, thé ×2, eau', qty: '', amt: 415, src: 'resto' },
    { t: 'auto', label: 'Taxe de séjour · 2 pers × 1 nuit', qty: '', amt: 50, src: 'taxe' },
  ]);
  folio(2, 'Yassine Oubella', 'walkin', 1, 2, [
    { t: 'hier 19h48', label: 'Nuit 1 · Chambre Patio', qty: '×1', amt: 750, src: 'room', paid: true },
    { t: '16h20', label: 'Thé à la menthe', qty: '×2', amt: 60, src: 'resto' },
    { t: 'auto', label: 'Taxe de séjour · 1 pers × 1 nuit', qty: '', amt: 25, src: 'taxe' },
  ]);
  folio(6, 'Mariam Bourkadi', 'expedia', 1, 2, [
    { t: 'hier 17h30', label: 'Nuit 1 · Chambre Patio', qty: '×1', amt: 750, src: 'room' },
    { t: 'auto', label: 'Taxe de séjour · 1 pers × 1 nuit', qty: '', amt: 25, src: 'taxe' },
  ]);
  folio(7, 'Ahmed & Leila El Fassi', 'direct', 2, 4, [
    { t: 'j1 · j2', label: 'Nuits 1-2 · Chambre Patio', qty: '×2', amt: 1500, src: 'room' },
    { t: 'j1 21h05', label: 'Dîner aux chandelles · tajine agneau, pastilla, thé', qty: '', amt: 525, src: 'resto' },
    { t: 'j2 11h30', label: 'Hammam traditionnel', qty: '×2', amt: 560, src: 'spa' },
    { t: '14h05', label: 'Déjeuner terrasse', qty: '', amt: 312, src: 'resto' },
    { t: 'auto', label: 'Taxe de séjour · 2 pers × 2 nuits', qty: '', amt: 100, src: 'taxe' },
  ]);
  folio(9, 'Karim Bennis', 'booking', 1, 2, [
    { t: 'j1 · j2', label: 'Nuits 1-2 · Confort Médina', qty: '×2', amt: 1900, src: 'room' },
    { t: 'hier 20h44', label: 'Dîner · couscous, thé, cornes de gazelle', qty: '', amt: 305, src: 'resto' },
    { t: '11h42', label: 'Late check-out 13h00', qty: '', amt: 150, src: 'fee', paid: true },
    { t: 'auto', label: 'Taxe de séjour · 1 pers × 2 nuits', qty: '', amt: 50, src: 'taxe' },
  ]);
  folio(10, 'Awa Diallo', 'expedia', 1, 4, [
    { t: 'j1 · j2', label: 'Nuits 1-2 · Confort Médina', qty: '×2', amt: 1900, src: 'room' },
    { t: 'j2 16h15', label: 'Gommage beldi', qty: '×1', amt: 250, src: 'spa' },
    { t: 'auto', label: 'Taxe de séjour · 1 pers × 2 nuits', qty: '', amt: 50, src: 'taxe' },
  ]);
  folio(11, 'Sofia & Mehdi Alami', 'direct', 2, 2, [
    { t: 'hier 14h02', label: 'Nuit 1 · Confort Médina', qty: '×1', amt: 950, src: 'room' },
    { t: 'hier 21h26', label: 'Dîner · pastilla ×2, jus, eau', qty: '', amt: 384, src: 'resto' },
    { t: 'auto', label: 'Taxe de séjour · 2 pers × 1 nuit', qty: '', amt: 50, src: 'taxe' },
  ]);
  folio(13, 'Famille Rousseau', 'booking', 2, 5, [
    { t: 'hier 16h40', label: 'Nuit 1 · Confort Médina', qty: '×1', amt: 950, src: 'room' },
    { t: 'hier 20h58', label: 'Dîner famille · 4 couverts', qty: '', amt: 720, src: 'resto' },
    { t: 'auto', label: 'Taxe de séjour · 2 adultes × 1 nuit', qty: '', amt: 50, src: 'taxe' },
  ]);
  folio(14, 'Daniel Reyes', 'direct', 1, 3, [
    { t: 'hier 15h40', label: 'Nuit 1 · Confort Médina', qty: '×1', amt: 950, src: 'room' },
    { t: 'j2 12h30', label: 'Massage à l’huile d’argan 60min', qty: '×1', amt: 450, src: 'spa' },
    { t: '13h10', label: 'Déjeuner · tajine poulet citron', qty: '', amt: 165, src: 'resto' },
    { t: 'auto', label: 'Taxe de séjour · 1 pers × 1 nuit', qty: '', amt: 25, src: 'taxe' },
  ]);
  folio(17, 'Sophie Marceau', 'direct', 1, 4, [
    { t: 'j1 · j2', label: 'Nuits 1-2 · Suite Yasmina', qty: '×2', amt: 2800, src: 'room' },
    { t: 'j1 18h20', label: 'Hammam traditionnel', qty: '×1', amt: 280, src: 'spa' },
    { t: 'j2 21h02', label: 'Dîner · pastilla seafood, thé', qty: '', amt: 412, src: 'resto' },
    { t: '12h40', label: 'Thé à la menthe', qty: '×1', amt: 30, src: 'resto' },
    { t: 'auto', label: 'Taxe de séjour · 1 pers × 2 nuits', qty: '', amt: 50, src: 'taxe' },
  ]);
  folio(18, 'Anna & Jonas Weber', 'expedia', 2, 3, [
    { t: 'hier 15h12', label: 'Nuit 1 · Suite Yasmina', qty: '×1', amt: 1400, src: 'room' },
    { t: 'hier 18h22', label: 'Hammam + gommage beldi', qty: '×1', amt: 530, src: 'spa' },
    { t: 'auto', label: 'Taxe de séjour · 2 pers × 1 nuit', qty: '', amt: 50, src: 'taxe' },
  ]);
  folio(19, 'Famille Alaoui', 'direct', 2, 2, [
    { t: 'hier 13h50', label: 'Nuit 1 · Suite Yasmina', qty: '×1', amt: 1400, src: 'room' },
    { t: 'hier 21h30', label: 'Privatisation dîner patio · anniversaire · 16 couverts', qty: '', amt: 3840, src: 'resto' },
    { t: 'auto', label: 'Taxe de séjour · 2 adultes × 1 nuit', qty: '', amt: 50, src: 'taxe' },
  ]);
  folio(21, 'Mei & Wei Chen', 'airbnb', 2, 3, [
    { t: 'hier 16h05', label: 'Nuit 1 · Suite Yasmina', qty: '×1', amt: 1400, src: 'room' },
    { t: 'hier 22h36', label: 'Dîner aux chandelles · terrasse', qty: '', amt: 684, src: 'resto' },
    { t: 'auto', label: 'Taxe de séjour · 2 pers × 1 nuit', qty: '', amt: 50, src: 'taxe' },
  ]);
  folio(22, 'Inès & Paul Martin', 'booking', 2, 3, [
    { t: 'hier 17h22', label: 'Nuit 1 · Suite Yasmina', qty: '×1', amt: 1400, src: 'room' },
    { t: 'auto', label: 'Taxe de séjour · 2 pers × 1 nuit', qty: '', amt: 50, src: 'taxe' },
  ]);
  folio(23, 'Famille Lefèvre', 'direct', 2, 6, [
    { t: 'j1-j3', label: 'Nuits 1-3 · Suite Terrasse Royale', qty: '×3', amt: 5700, src: 'room' },
    { t: 'j1 21h00', label: 'Dîner · 3 couverts', qty: '', amt: 640, src: 'resto' },
    { t: 'j2 20h45', label: 'Dîner · 3 couverts + pâtisseries', qty: '', amt: 600, src: 'resto' },
    { t: 'j2 11h00', label: 'Hammam traditionnel', qty: '×2', amt: 560, src: 'spa' },
    { t: 'j3 17h30', label: 'Massage à l’huile d’argan 60min', qty: '×1', amt: 450, src: 'spa' },
    { t: 'auto', label: 'Taxe de séjour · 2 adultes × 3 nuits', qty: '', amt: 150, src: 'taxe' },
  ]);
  folio(15, 'Sarah & Tom Whitaker', 'airbnb', 2, 2, [
    { t: '12h54', label: 'Rituel hammam + massage duo · demain 17h', qty: '×1', amt: 980, src: 'spa', paid: true },
  ]);

  const folioTotal = (f) => f.lines.reduce((a, l) => a + l.amt, 0);
  const folioPaid = (f) => f.lines.reduce((a, l) => a + (l.paid ? l.amt : 0), 0);
  const folioBySrc = (f, s) => f.lines.filter((l) => l.src === s).reduce((a, l) => a + l.amt, 0);

  /* ═══════════════ MÉNAGE ═══════════════ */
  const HK_STAFF = [
    { id: 'khadija', name: 'Khadija El Amrani', role: 'Gouvernante · inspections', av: 'KE', cls: '',  today: '2 inspections · 2 validées' },
    { id: 'naima',   name: 'Naima Bouziane',    role: 'Femme de chambre',          av: 'NB', cls: 'b', today: '4 chambres · 1 en cours' },
    { id: 'fatiha',  name: 'Fatiha Zerouali',   role: 'Femme de chambre',          av: 'FZ', cls: 'c', today: '3 chambres · 1 en file' },
    { id: 'hicham',  name: 'Hicham Daoudi',     role: 'Valet · patio & parties communes', av: 'HD', cls: 'd', today: 'Patio + terrasse faits' },
  ];
  const HK_QUEUE = [
    { room: 12, st: 'encours', who: 'Naima B.',  note: 'Départ 11h40 · arrivée 17h00 · démarré il y a 28 min', prio: true },
    { room: 5,  st: 'file',    who: 'Fatiha Z.', note: 'Départ 12h10 · arrivée 18h30', prio: false },
    { room: 9,  st: 'attente', who: null,        note: 'Late check-out · libération 15h00 · arrivée 19h00', prio: false },
  ];
  const HK_DONE = [
    { room: 24, at: '11h10', by: 'Naima B.',  inspected: true, note: 'Relouée ce soir · Famille Rossi 15h30' },
    { room: 16, at: '11h45', by: 'Fatiha Z.', inspected: true, note: 'Relouée ce soir · M. & Mme Gómez 16h00' },
  ];

  /* ═══════════════ TAPE CHART · 8 → 21 juin ═══════════════ */
  const TAPE_DAYS = ['Lun 8', 'Mar 9', 'Mer 10', 'Jeu 11', 'Ven 12', 'Sam 13', 'Dim 14', 'Lun 15', 'Mar 16', 'Mer 17', 'Jeu 18', 'Ven 19', 'Sam 20', 'Dim 21'];
  const TODAY_IDX = 2;
  // {r, g, s (start index), n (nights), src}
  const STAYS = [
    { r: 1,  g: 'Bennani',    s: 1,  n: 3, src: 'booking' }, { r: 1,  g: 'Cohen',     s: 6,  n: 2, src: 'booking' }, { r: 1, g: 'Amrani', s: 11, n: 3, src: 'direct' },
    { r: 2,  g: 'Oubella',    s: 1,  n: 2, src: 'walkin' },  { r: 2,  g: 'Petit',     s: 5,  n: 2, src: 'booking' }, { r: 2, g: 'Silva', s: 9, n: 4, src: 'booking' },
    { r: 3,  g: 'Marín',      s: 2,  n: 2, src: 'booking' }, { r: 3,  g: 'Benali',    s: 6,  n: 3, src: 'direct' },
    { r: 4,  g: 'Müller',     s: 3,  n: 2, src: 'booking' }, { r: 4,  g: 'Okafor',    s: 8,  n: 4, src: 'booking' },
    { r: 5,  g: 'Tahiri',     s: 0,  n: 2, src: 'direct' },  { r: 5,  g: 'Benkirane', s: 2,  n: 1, src: 'direct' }, { r: 5, g: 'Janssen', s: 5, n: 3, src: 'expedia' },
    { r: 6,  g: 'Bourkadi',   s: 1,  n: 2, src: 'expedia' }, { r: 6,  g: 'Sánchez',   s: 5,  n: 3, src: 'booking' },
    { r: 7,  g: 'El Fassi',   s: 0,  n: 4, src: 'direct' },  { r: 7,  g: 'Dupont',    s: 6,  n: 2, src: 'booking' }, { r: 7, g: 'Ricci', s: 10, n: 3, src: 'booking' },
    { r: 9,  g: 'Bennis',     s: 0,  n: 2, src: 'booking' }, { r: 9,  g: 'Lemoine',   s: 2,  n: 2, src: 'booking' }, { r: 9, g: 'Haddad', s: 6, n: 2, src: 'direct' },
    { r: 10, g: 'Diallo',     s: 0,  n: 4, src: 'expedia' }, { r: 10, g: 'Moreau',    s: 5,  n: 4, src: 'booking' },
    { r: 11, g: 'Alami',      s: 1,  n: 2, src: 'direct' },  { r: 11, g: 'Kovač',     s: 5,  n: 2, src: 'booking' }, { r: 11, g: 'Berrada', s: 9, n: 3, src: 'direct' },
    { r: 12, g: 'Dubois',     s: 0,  n: 2, src: 'booking' }, { r: 12, g: 'Fournier',  s: 2,  n: 3, src: 'booking' }, { r: 12, g: 'Smith', s: 6, n: 4, src: 'airbnb' },
    { r: 13, g: 'Rousseau',   s: 1,  n: 5, src: 'booking' }, { r: 13, g: 'Tazi',      s: 7,  n: 2, src: 'direct' },
    { r: 14, g: 'Reyes',      s: 1,  n: 3, src: 'direct' },  { r: 14, g: 'Lindqvist', s: 5,  n: 4, src: 'booking' },
    { r: 15, g: 'Whitaker',   s: 2,  n: 2, src: 'airbnb' },  { r: 15, g: 'Mansouri',  s: 5,  n: 2, src: 'direct' }, { r: 15, g: 'Brown', s: 8, n: 3, src: 'booking' },
    { r: 16, g: 'Etxeberria', s: 0,  n: 2, src: 'booking' }, { r: 16, g: 'Gómez',     s: 2,  n: 3, src: 'direct' }, { r: 16, g: 'Nguyen', s: 6, n: 3, src: 'expedia' },
    { r: 17, g: 'Marceau',    s: 0,  n: 4, src: 'direct' },  { r: 17, g: 'Klein',     s: 5,  n: 3, src: 'booking' },
    { r: 18, g: 'Weber',      s: 1,  n: 3, src: 'expedia' }, { r: 18, g: 'Bouhaddou', s: 5,  n: 2, src: 'direct' }, { r: 18, g: 'García', s: 8, n: 4, src: 'booking' },
    { r: 19, g: 'Alaoui',     s: 1,  n: 2, src: 'direct' },  { r: 19, g: 'Rey',       s: 4,  n: 3, src: 'booking' }, { r: 19, g: 'Belkacem', s: 9, n: 2, src: 'direct' },
    { r: 20, g: 'Van Dijk',   s: 3,  n: 4, src: 'booking' }, { r: 20, g: 'Idrissi',   s: 9,  n: 3, src: 'direct' },
    { r: 21, g: 'Chen',       s: 1,  n: 3, src: 'airbnb' },  { r: 21, g: 'Laurent',   s: 5,  n: 2, src: 'booking' }, { r: 21, g: 'Pereira', s: 8, n: 3, src: 'booking' },
    { r: 22, g: 'Martin',     s: 1,  n: 3, src: 'booking' }, { r: 22, g: 'Zniber',    s: 5,  n: 3, src: 'direct' },
    { r: 23, g: 'Lefèvre',    s: -1, n: 7, src: 'direct' },  { r: 23, g: 'Whitman',   s: 7,  n: 4, src: 'booking' },
    { r: 24, g: 'Laurent',    s: 0,  n: 2, src: 'booking' }, { r: 24, g: 'Rossi',     s: 2,  n: 5, src: 'booking' }, { r: 24, g: 'Al Saud', s: 8, n: 4, src: 'direct' },
  ];

  /* ═══════════════ CLIENTS · CRM ═══════════════ */
  const GUESTS = [
    { id: 'g1', name: 'Marta & Diego Gómez', country: 'Espagne', stays: 2, last: 'fév. 2026', ltv: 9840, prefs: ['Suite étage haut', 'Thé sans sucre'], repeat: true, arrivingToday: true, split: [62, 24, 14] },
    { id: 'g2', name: 'Ahmed & Leila El Fassi', country: 'Maroc', stays: 3, last: 'en maison · Ch. 7', ltv: 14210, prefs: ['Chambre patio', 'Allergie arachide'], repeat: true, allergy: true, split: [58, 28, 14] },
    { id: 'g3', name: 'Famille Whitman', country: 'États-Unis', stays: 2, last: 'mai 2026', ltv: 28400, prefs: ['Suites communicantes', 'Petit-déj 8h'], repeat: true, split: [71, 19, 10] },
    { id: 'g4', name: 'Famille Alaoui', country: 'Maroc', stays: 4, last: 'en maison · Ch. 19', ltv: 19850, prefs: ['Privatisation dîners', 'Patio le soir'], repeat: true, split: [44, 49, 7] },
    { id: 'g5', name: 'Sophie Marceau', country: 'France', stays: 2, last: 'en maison · Ch. 17', ltv: 11620, prefs: ['Suite Yasmina', 'Hammam au calme'], repeat: true, split: [66, 18, 16] },
    { id: 'g6', name: 'Claire Dubois', country: 'France', stays: 1, last: 'départ ce matin', ltv: 4820, prefs: ['Étage calme'], split: [64, 22, 14] },
    { id: 'g7', name: 'Mei & Wei Chen', country: 'Chine', stays: 1, last: 'en maison · Ch. 21', ltv: 2134, prefs: ['Dîner terrasse'], split: [66, 31, 3] },
    { id: 'g8', name: 'Anna & Jonas Weber', country: 'Allemagne', stays: 1, last: 'en maison · Ch. 18', ltv: 1980, prefs: ['Vélo médina', 'Hammam duo'], split: [71, 2, 27] },
    { id: 'g9', name: 'Daniel Reyes', country: 'États-Unis', stays: 1, last: 'en maison · Ch. 14', ltv: 1590, prefs: ['Check-in anticipé'], split: [60, 12, 28] },
    { id: 'g10', name: 'Famille Rossi', country: 'Italie', stays: 1, last: 'arrive 15h30', ltv: 0, prefs: ['Lit bébé', 'Terrasse'], split: [0, 0, 0] },
  ];
  const NATIONALITIES = [
    { c: 'France', pct: 34, color: 'var(--atlas)' },
    { c: 'Maroc', pct: 22, color: 'var(--riad)' },
    { c: 'Espagne', pct: 12, color: 'var(--atlas-600)' },
    { c: 'États-Unis', pct: 9, color: 'var(--warning)' },
    { c: 'Allemagne', pct: 8, color: 'var(--n-400)' },
    { c: 'Royaume-Uni', pct: 6, color: 'var(--mint)' },
    { c: 'Autres', pct: 9, color: 'var(--n-200)' },
  ];

  /* ═══════════════ CANAUX · 30 jours ═══════════════ */
  const CHANNELS = [
    { key: 'booking', label: 'Booking.com', nights: 295, pct: 54, rev: 330480, feePct: 17, fee: 56180, color: 'var(--riad)' },
    { key: 'direct',  label: 'Direct · tél / WhatsApp / site', nights: 137, pct: 25, rev: 153000, feePct: 0, fee: 0, color: 'var(--atlas)' },
    { key: 'airbnb',  label: 'Airbnb', nights: 66, pct: 12, rev: 73440, feePct: 3, fee: 2200, color: 'var(--warning)' },
    { key: 'expedia', label: 'Expedia', nights: 49, pct: 9, rev: 55080, feePct: 16, fee: 8810, color: 'var(--n-400)' },
  ];
  const DIRECT_TREND = [18, 19, 20, 22, 23, 25]; // % direct · 6 derniers mois

  /* ═══════════════ TARIFS · 7 jours ═══════════════ */
  const RATE_DAYS = ['Mer 10', 'Jeu 11', 'Ven 12', 'Sam 13', 'Dim 14', 'Lun 15', 'Mar 16'];
  const RATES = {
    patio:   { base: [750, 750, 750, 750, 750, 750, 750],     ai: [null, null, 820, 890, 860, null, null] },
    confort: { base: [950, 950, 950, 950, 950, 950, 950],     ai: [null, null, 1040, 1120, 1080, null, null] },
    suite:   { base: [1400, 1400, 1400, 1400, 1400, 1400, 1400], ai: [null, null, null, 1590, 1520, null, null] },
    royale:  { base: [1900, 1900, 1900, 1900, 1900, 1900, 1900], ai: [null, null, 2100, 2200, 2150, null, null] },
  };
  let aiApplied = false;

  /* ═══════════════ INTELLIGENCE ═══════════════ */
  const FORECAST = {
    months: ['Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc', 'Jan', 'Fév', 'Mars', 'Avr', 'Mai', 'Juin'],
    occ:    [58,     64,     76,    88,    84,    91,    72,    52,    68,     88,    79,    74],
    notes:  { 7: 'Ramadan', 8: 'Aïd al-Fitr', 5: 'Fêtes' },
  };
  const NOSHOW_RISK = [
    { ref: 'Rés. #88512', room: 'Ch. 4', when: 'demain', src: 'Booking.com', risk: 34, why: 'Non prépayée · profil 2 annulations passées', high: true },
    { ref: 'Rés. #88547', room: 'Ch. 2', when: 'samedi', src: 'Booking.com', risk: 18, why: 'Non garantie · réservation J-2' },
    { ref: 'Rés. #88560', room: '2 ch. groupe', when: 'dimanche', src: 'Expedia', risk: 12, why: 'Groupe · arrivée tardive annoncée' },
  ];

  /* ═══════════════ RENDER HELPERS ═══════════════ */
  const srcPill = (s) => `<span class="hx-src ${s}">${SRC[s] ? (s === 'direct' ? tx('Direct') : SRC[s].label.split(' ')[0]) : s}</span>`;
  const SRC_LBL = {
    get room() { return tx('Chambre'); }, get resto() { return tx('Restaurant · POS'); }, get spa() { return tx('Hammam & spa'); },
    get taxe() { return tx('Taxe de séjour'); }, get fee() { return tx('Frais'); },
  };
  const SRC_DOT = { room: 'room', resto: 'resto', spa: 'spa', taxe: 'taxe', fee: 'taxe' };

  let openDrawer = null;   // { el, page }
  let openModal = null;
  let cuTapeOffset = 0;
  let cuStayView = 'tape';
  let cuReservationEventsBound = false;
  let cuReceptionControlsBound = false;
  /* Occupation réelle, recalculée à chaque peinture (voir cuRoomOccupancy). */
  let cuOccupancyMemo = null;
  const cuRackFilter = {
    floor: 'all',
    floors: new Set(),
    categories: new Set(),
    status: 'all',
    hasView: false,
    views: new Set(),
    characteristics: new Set(),
    connectingOnly: false,
    minCapacity: 0,
    q: '',
  };
  let cuSelectionMode = false;
  const cuSelectedRooms = new Set();
  const cuSelectedRows = () => Object.values(R()).filter((r) => !r.deletedAt && cuSelectedRooms.has(String(r.id)));
  const cuSelectedNumbers = () => cuSelectedRows().map((r) => r.n).sort((a, b) => a - b);
  let cuFloorSaving = false;
  let cuBulkSaving = false;
  let cuBulkPlan = null;
  function cuPendingBulk() {
    try {
      const plan = JSON.parse(localStorage.getItem('kiwi:hotel-bulk-draft:v1:' + cuStateId()) || 'null');
      return plan?.operationId && plan.merchant === cuMerchantSlug() && plan.stateId === cuStateId() && Array.isArray(plan.targets) && plan.targets.length ? plan : null;
    } catch (_) { return null; }
  }
  let cuCurrentFilterVenue = null;
  const DEFAULT_VIEWS = ['Mer', 'Jardin', 'Piscine', 'Ville', 'Patio'];
  const VIEW_LABELS = {
    Mer: { fr: 'Mer', en: 'Sea', ar: 'بحر' },
    Jardin: { fr: 'Jardin', en: 'Garden', ar: 'حديقة' },
    Piscine: { fr: 'Piscine', en: 'Pool', ar: 'مسبح' },
    Ville: { fr: 'Ville', en: 'City', ar: 'مدينة' },
    Patio: { fr: 'Patio', en: 'Patio', ar: 'فناء' },
  };
  const HOTEL_CHARACTERISTICS = [
    { id: 'balcony', label: 'Balcon', labels: { fr: 'Balcon', en: 'Balcony', ar: 'شرفة' } },
    { id: 'terrace', label: 'Terrasse', labels: { fr: 'Terrasse', en: 'Terrace', ar: 'تراس' } },
    { id: 'pmr', label: 'Accessible PMR', labels: { fr: 'Accessible PMR', en: 'Accessible (PRM)', ar: 'ولوج لذوي الاحتياجات' } },
    { id: 'bathtub', label: 'Baignoire', labels: { fr: 'Baignoire', en: 'Bathtub', ar: 'حوض استحمام' } },
    { id: 'shower_walkin', label: 'Douche à l’italienne', labels: { fr: 'Douche à l’italienne', en: 'Walk-in shower', ar: 'دش إيطالي' } },
    { id: 'quiet', label: 'Calme / insonorisée', labels: { fr: 'Calme / insonorisée', en: 'Quiet / soundproof', ar: 'هادئة / عازلة للصوت' } },
    { id: 'desk', label: 'Espace bureau', labels: { fr: 'Espace bureau', en: 'Desk space', ar: 'مكتب عمل' } },
    { id: 'ac', label: 'Climatisation', labels: { fr: 'Climatisation', en: 'Air conditioning', ar: 'مكيف هواء' } },
  ];

  function trL(o) {
    const l = (window.KiwiI18n && window.KiwiI18n.getLang && window.KiwiI18n.getLang()) || 'fr';
    return o == null ? '' : (o[l] ?? o.fr ?? o);
  }
  function cuAuthorizer() {
    const auth = window.KiwiPinAuthorizer || window.KiwiAuthorizer;
    if (auth && typeof auth === 'object') {
      return {
        id: String(auth.id || 'supervisor'),
        name: String(auth.name || 'Superviseur').trim(),
        role: String(auth.role || 'manager').trim(),
      };
    }
    return null;
  }

  function cuAllViews() {
    const st = cuState();
    const views = Array.isArray(st.views) ? st.views : DEFAULT_VIEWS;
    return Array.from(new Set(views));
  }
  function cuViewLabel(v, l) {
    if (!v) return '';
    const lang = l || (window.KiwiI18n && window.KiwiI18n.getLang && window.KiwiI18n.getLang()) || 'fr';
    if (VIEW_LABELS[v] && VIEW_LABELS[v][lang]) return VIEW_LABELS[v][lang];
    return v;
  }
  function cuAllCharacteristics() {
    const st = cuState();
    const customs = Array.isArray(st.customCharacteristics) ? st.customCharacteristics : [];
    return HOTEL_CHARACTERISTICS.concat(customs);
  }
  function cuCharLabel(c, l) {
    if (!c) return '';
    const lang = l || (window.KiwiI18n && window.KiwiI18n.getLang && window.KiwiI18n.getLang()) || 'fr';
    if (typeof c === 'string') {
      const found = cuAllCharacteristics().find((h) => h.id === c);
      if (found) return cuCharLabel(found, lang);
      return c;
    }
    if (c.labels && typeof c.labels === 'object') {
      return c.labels[lang] || c.labels.fr || c.label || c.id;
    }
    return c.label || c.name || c.id;
  }
  function cuActiveActor() {
    if (window.KiwiMe && typeof window.KiwiMe === 'object') {
      return {
        id: String(window.KiwiMe.id || window.KiwiMe.email || 'me'),
        name: String(window.KiwiMe.name || window.KiwiMe.business || 'Propriétaire').trim(),
        role: String(window.KiwiMe.role || (window.KiwiMe.operator ? 'operator' : 'owner')).trim(),
      };
    }
    if (window.KiwiCurrentStaff && typeof window.KiwiCurrentStaff === 'object') {
      return {
        id: String(window.KiwiCurrentStaff.id || 'staff'),
        name: String(window.KiwiCurrentStaff.name || 'Personnel').trim(),
        role: String(window.KiwiCurrentStaff.role || 'staff').trim(),
      };
    }
    if (window.KiwiIdentity?.state?.authenticated) {
      return {
        id: 'authenticated-user',
        name: 'Utilisateur connecté',
        role: window.KiwiIdentity.state.operator ? 'operator' : 'owner',
      };
    }
    return {
      id: 'local-operator',
      name: 'Opérateur local',
      role: 'operator',
    };
  }
  const K = () => window.Kiwi;

  /* ═══════════════ CUSTOM HOTELS · DURABLE ROOM REGISTER ═══════════════
   * The old custom-hotel path derived rooms once from the optional onboarding
   * answer and kept the result in a page-memory object. A skipped answer meant
   * a permanently blank rack; even a configured hotel lost every operational
   * change on refresh. The room register now has one venue-scoped local copy
   * and, for real stores, a tenant-scoped CloudDoc (`feature: rooms`). */
  const isCustomHotel = () => {
    const KV = window.KiwiVenue;
    let paired = null;
    let pairedReal = false;
    try { paired = window.KiwiPlatform?.pairedVenue?.() || window.KiwiCaissePairing?.pairedVenue?.() || JSON.parse(localStorage.getItem('kiwiPairedVenue') || 'null'); } catch (_) {}
    try { pairedReal = !!(paired && paired.merchant && localStorage.getItem('kiwiPaired') === '1'); } catch (_) {}
    const own = !!(KV?.isCustom?.() || window.KiwiEnv?.isReal?.() || window.KiwiMe
      || pairedReal);
    const type = KV?.getVenueType?.() || (window.KiwiMe && window.KiwiMe.type)
      || (paired && (paired.subtype || paired.type));
    return own && type === 'hotel';
  };
  const CUSTOM_HX = {}; // venueId → hydrated operating state
  const HX_STORE_PREFIX = 'kiwi:hotel-rooms:v2:';
  let hotelCloud = null;

  function cuVenueId() {
    try { return String(window.KiwiVenue?.getVenue?.() || ''); } catch (_) { return ''; }
  }
  const cuD1Stays = new Map();
  const cuStayLoads = new Map();
  const cuInHouseSnapshots = new Map();
  const cuReceptionFilters = new Map();
  function cuStayScope() {
    return String(window.KiwiStore?.slugFor?.(cuVenueId()) || cuStateId());
  }
  function cuStayCache() {
    const scope = cuStayScope();
    if (!cuD1Stays.has(scope)) cuD1Stays.set(scope, new Map());
    return cuD1Stays.get(scope);
  }

  async function cuFetchStaysForWindow(start, end) {
    const slug = window.KiwiStore?.slugFor?.(cuVenueId()) || '';
    if (!slug) {
      cuStayLoads.set(cuStayScope(), { loading: false, error: txk('Hôtel non connecté au serveur : liste non vérifiée.') });
      return [];
    }
    const scope = cuStayScope(), cache = cuStayCache();
    const load = { loading: true, error: '' };
    cuStayLoads.set(scope, load);
    try {
      const res = await fetch(`/api/hotel/stays?merchant=${encodeURIComponent(slug)}&from=${encodeURIComponent(start)}&to=${encodeURIComponent(end)}&includeCancelled=1`, { cache: 'no-store' });
      if (!res.ok) throw new Error('unavailable');
      const data = await res.json();
      if (!Array.isArray(data.stays)) throw new Error('invalid-response');
      data.stays.forEach((s) => {
        if (s && s.id && (+s.updatedAt || 0) >= (+cache.get(s.id)?.updatedAt || 0)) cache.set(s.id, s);
      });
      if (data.stays.length >= 1000) load.error = txk('Limite de lecture atteinte : cette liste peut être incomplète. Réduisez la période.');
      return data.stays;
    } catch (_) {
      load.error = txk('Actualisation indisponible. Les données affichées peuvent être anciennes ; réessayez avant de confirmer une disponibilité.');
      return [];
    } finally {
      load.loading = false;
    }
  }

  function cuAllStays() {
    const doc = window.KiwiReservations?.get?.() || { bookings: [] };
    const all = new Map();
    (doc.bookings || []).forEach((b) => { if (b && b.id) all.set(b.id, b); });
    cuStayCache().forEach((b, id) => {
      if (b && (+b.updatedAt || 0) >= (+all.get(id)?.updatedAt || 0)) all.set(id, b);
    });
    return all;
  }

  function cuStateId() {
    const id = cuVenueId();
    if (id !== 'scoped' && id !== 'own') return id;
    try {
      const slug = String(window.KiwiVenue?.getCurrentVenueData?.()?.slug || '').trim();
      return slug ? id + ':' + slug : id + ':unresolved';
    } catch (_) { return id + ':unresolved'; }
  }
  function cuStoreKey(id) { return HX_STORE_PREFIX + String(id || cuStateId() || 'unknown'); }
  function cuStamp() { return Date.now(); }
  function cuTypeId(name, stamp) {
    const slug = String(name || 'type').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 36) || 'type';
    return 'type:' + slug + ':' + String(stamp || cuStamp()).slice(-6);
  }
  function cuFloorId(name, stamp) {
    const slug = String(name || 'section').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 36) || 'section';
    return 'floor:' + slug + ':' + String(stamp || cuStamp()).slice(-6);
  }
  function cuDefaultTypes(now) {
    return [
      { id: 'type:chambre', name: tx('Chambre'), rate: null, description: '', maxGuests: 2, beds: tx('1 grand lit'), sizeM2: null, view: '', amenities: [], photos: [], public: true, updatedAt: now },
      { id: 'type:suite', name: tx('Suite'), rate: null, description: '', maxGuests: 2, beds: tx('1 grand lit'), sizeM2: null, view: '', amenities: [], photos: [], public: true, updatedAt: now },
    ];
  }
  function cuSafePhoto(x, index, typeName) {
    const url = String(typeof x === 'string' ? x : x?.url || '').trim();
    if (!/^\/api\/media\/(?:media\/)?[a-z0-9][a-z0-9-]{2,63}\/(?:hotel-room\/)?[a-z0-9-]{6,80}\.(?:jpe?g|png|webp|gif|avif)$/i.test(url)) return null;
    return { url, alt: String(x?.alt || (typeName + ' · photo ' + (index + 1))).trim().slice(0, 120), updatedAt: +x?.updatedAt || 0 };
  }
  function cuSeed() {
    const vd = window.KiwiVenue?.getCurrentVenueData?.() || {};
    const configuredRooms = parseInt(vd.profileInfo && vd.profileInfo.rooms, 10);
    const count = Number.isFinite(configuredRooms) && configuredRooms > 0
      ? Math.min(120, configuredRooms) : 0;
    const now = cuStamp();
    const roomTypes = Object.fromEntries(cuDefaultTypes(now).map((x) => [x.id, x]));
    const rooms = {};
    for (let n = 1; n <= count; n++) rooms[n] = {
      id: 'room:' + n, n, typeId: 'type:chambre', typeName: tx('Chambre'),
      floor: count > 8 ? tx('Niveau {n}', { n: Math.floor((n - 1) / 8) + 1 }) : tx('Vos chambres'),
      rate: null, status: 'libre', hk: 'clean', guest: null, meta: txk('Libre · propre'), updatedAt: now,
    };
    const floorNames = [...new Set(Object.values(rooms).map((r) => r.floor))];
    if (!floorNames.length) floorNames.push(tx('Vos chambres'));
    const floors = Object.fromEntries(floorNames.map((name, order) => {
      const id = cuFloorId(name, now + order);
      Object.values(rooms).filter((r) => r.floor === name).forEach((r) => { r.floorId = id; });
      return [id, { id, name, order, updatedAt: now + order }];
    }));
    return {
      v: 4, rooms, roomRecords: Object.values(rooms), roomTypes, floors,
      floorRecords: Object.values(floors),
      typeRecords: Object.values(roomTypes), folios: {}, baseRate: null,
      rateUpdatedAt: 0, sold: 0, updatedAt: now,
      views: DEFAULT_VIEWS.slice(),
      customCharacteristics: [],
      roomAudits: [],
    };
  }
  function cuHydrate(raw) {
    raw = raw && typeof raw === 'object' ? raw : {};
    const roomRecords = Array.isArray(raw.rooms) ? raw.rooms : (Array.isArray(raw.roomRecords) ? raw.roomRecords : []);
    let typeRecords = Array.isArray(raw.roomTypes) ? raw.roomTypes : (Array.isArray(raw.typeRecords) ? raw.typeRecords : []);
    if (!typeRecords.length) {
      const migrated = new Map();
      roomRecords.filter((x) => x && !x.deletedAt).forEach((x) => {
        const name = String(x.typeName || x.type || 'Chambre').trim() || 'Chambre';
        const key = name.toLocaleLowerCase('fr');
        if (!migrated.has(key)) migrated.set(key, {
          id: cuTypeId(name, x.updatedAt || cuStamp()), name,
          rate: x.rate != null && Number.isFinite(+x.rate) && +x.rate >= 0 ? +x.rate : null,
          updatedAt: +x.updatedAt || 0,
        });
      });
      typeRecords = migrated.size ? [...migrated.values()] : cuDefaultTypes(cuStamp());
    }
    const roomTypes = {};
    typeRecords.forEach((x) => {
      if (!x || x.deletedAt) return;
      const id = String(x.id || cuTypeId(x.name, x.updatedAt));
      // Direct-guest meal supplements (MAD per person per night), same
      // sanitize-as-missing rule as the server: garbage reads as unset.
      let boardRates;
      if (x.boardRates && typeof x.boardRates === 'object' && !Array.isArray(x.boardRates)) {
        boardRates = {};
        let any = false;
        for (const key of ['bb', 'hb_lunch', 'hb_dinner', 'full_board']) {
          const value = x.boardRates[key];
          const rate = (value == null || value === '') ? null
            : (Number.isFinite(+value) && +value >= 0 ? Math.round(+value * 100) / 100 : null);
          boardRates[key] = rate;
          if (rate != null) any = true;
        }
        if (!any) boardRates = undefined;
      }
      roomTypes[id] = {
        ...x,
        id, name: String(x.name || 'Chambre').trim().slice(0, 60) || 'Chambre',
        rate: x.rate != null && Number.isFinite(+x.rate) && +x.rate >= 0 ? +x.rate : null,
        boardRates,
        description: String(x.description || '').trim().slice(0, 300),
        maxGuests: Number.isFinite(+x.maxGuests) ? Math.max(1, Math.min(12, Math.round(+x.maxGuests))) : 2,
        beds: String(x.beds || '').trim().slice(0, 80),
        sizeM2: x.sizeM2 != null && Number.isFinite(+x.sizeM2) && +x.sizeM2 > 0 ? Math.min(999, Math.round(+x.sizeM2)) : null,
        view: String(x.view || '').trim().slice(0, 80),
        amenities: (Array.isArray(x.amenities) ? x.amenities : String(x.amenities || '').split(','))
          .map((v) => String(v || '').trim().slice(0, 40)).filter(Boolean).slice(0, 12),
        photos: (Array.isArray(x.photos) ? x.photos : []).slice(0, 8).map((p, i) => cuSafePhoto(p, i, String(x.name || 'Chambre'))).filter(Boolean),
        public: x.public !== false,
        updatedAt: +x.updatedAt || 0,
      };
    });
    if (!Object.keys(roomTypes).length) cuDefaultTypes(cuStamp()).forEach((x) => { roomTypes[x.id] = x; });
    const findType = (x) => {
      if (x.typeId && roomTypes[x.typeId]) return x.typeId;
      const name = String(x.typeName || x.type || 'Chambre').trim().toLocaleLowerCase('fr');
      return Object.values(roomTypes).find((t) => t.name.toLocaleLowerCase('fr') === name)?.id || Object.keys(roomTypes)[0];
    };
    let floorRecords = Array.isArray(raw.floors) ? raw.floors : (Array.isArray(raw.floorRecords) ? raw.floorRecords : []);
    if (!floorRecords.length) {
      const names = [];
      roomRecords.filter((x) => x && !x.deletedAt).forEach((x) => {
        const name = String(x.floor || 'Vos chambres').trim() || 'Vos chambres';
        if (!names.some((n) => n.toLocaleLowerCase('fr') === name.toLocaleLowerCase('fr'))) names.push(name);
      });
      if (!names.length) names.push('Vos chambres');
      floorRecords = names.map((name, order) => ({ id: cuFloorId(name, order + 1), name, order, updatedAt: 0 }));
    }
    const floors = {};
    floorRecords.forEach((x, index) => {
      if (!x || x.deletedAt) return;
      const id = String(x.id || cuFloorId(x.name, x.updatedAt));
      floors[id] = { ...x, id, name: String(x.name || 'Vos chambres').trim().slice(0, 60) || 'Vos chambres', order: Number.isFinite(+x.order) ? +x.order : index, updatedAt: +x.updatedAt || 0 };
    });
    const findFloor = (x) => {
      if (x.floorId && floors[x.floorId]) return x.floorId;
      const name = String(x.floor || 'Vos chambres').trim().toLocaleLowerCase('fr');
      return Object.values(floors).find((f) => f.name.toLocaleLowerCase('fr') === name)?.id || Object.keys(floors)[0];
    };
    const rooms = {};
    roomRecords.forEach((x) => {
      if (!x || x.deletedAt) return;
      const n = parseInt(x.n, 10);
      if (!Number.isFinite(n) || n < 1 || n > 9999 || rooms[n]) return;
      rooms[n] = {
        ...x,
        id: String(x.id || ('room:' + n)), n,
        typeId: findType(x),
        typeName: String(x.typeName || x.type || 'Chambre').slice(0, 60),
        floorId: findFloor(x),
        floor: String(x.floor || floors[findFloor(x)]?.name || 'Vos chambres').slice(0, 60),
        rate: x.rate != null && Number.isFinite(+x.rate) && +x.rate >= 0 ? +x.rate : null,
        status: ['libre', 'sale', 'hs', 'occ', 'depart', 'arrivee'].includes(x.status) ? x.status : 'libre',
        hk: String(x.hk || (x.status === 'sale' ? 'dirty' : 'clean')),
        guest: x.guest ? String(x.guest).slice(0, 120) : null,
        meta: String(x.meta || (x.status === 'sale' ? txk('À remettre à blanc') : txk('Libre · propre'))).slice(0, 180),
        updatedAt: +x.updatedAt || 0,
        view: x.view ? String(x.view).trim().slice(0, 60) : null,
        characteristics: Array.isArray(x.characteristics) ? x.characteristics.map(String) : [],
        connectingRoomIds: Array.isArray(x.connectingRoomIds) ? x.connectingRoomIds.map(String) : [],
        connectingMeta: (x.connectingMeta && typeof x.connectingMeta === 'object') ? x.connectingMeta : {},
      };
    });
    const folios = {};
    const folioRows = Array.isArray(raw.folios) ? raw.folios : Object.values(raw.folios || {});
    folioRows.forEach((f) => { if (f && !f.closedAt && rooms[+f.room]) folios[+f.room] = f; });
    return {
      documentExtras: { ...raw },
      configUpdatedAt: +raw.configUpdatedAt || 0,
      v: 4, rooms, roomRecords: roomRecords.slice(), roomTypes, typeRecords: typeRecords.slice(), floors,
      floorRecords: floorRecords.slice(), folios, closedFolios: folioRows.filter((f) => f?.closedAt),
      baseRate: raw.baseRate != null && Number.isFinite(+raw.baseRate) && +raw.baseRate >= 0 ? +raw.baseRate : null,
      rateUpdatedAt: +raw.rateUpdatedAt || 0,
      sold: Math.max(0, +raw.sold || 0), updatedAt: +raw.updatedAt || 0,
      count: Object.keys(rooms).length,
      views: Array.isArray(raw.views) ? raw.views.map(String).slice(0, 50) : DEFAULT_VIEWS.slice(),
      customCharacteristics: Array.isArray(raw.customCharacteristics) ? raw.customCharacteristics.slice(0, 50) : [],
      roomAudits: Array.isArray(raw.roomAudits) ? raw.roomAudits.slice() : [],
    };
  }
  function cuDocument(st) {
    const live = Object.values(st.rooms || {});
    const byId = {};
    (st.roomRecords || []).forEach((r) => { if (r && r.id) byId[r.id] = r; });
    live.forEach((r) => { byId[r.id || ('room:' + r.n)] = { ...r, id: r.id || ('room:' + r.n) }; });
    const typeById = {};
    (st.typeRecords || []).forEach((t) => { if (t && t.id) typeById[t.id] = t; });
    Object.values(st.roomTypes || {}).forEach((t) => { typeById[t.id] = t; });
    const floorById = {};
    (st.floorRecords || []).forEach((f) => { if (f && f.id) floorById[f.id] = f; });
    Object.values(st.floors || {}).forEach((f) => { floorById[f.id] = f; });
    return {
      ...(st.documentExtras || {}),
      v: 4, rooms: Object.values(byId), roomTypes: Object.values(typeById), floors: Object.values(floorById), folios: (st.closedFolios || []).concat(Object.values(st.folios || {})),
      configUpdatedAt: st.configUpdatedAt || 0,
      baseRate: st.baseRate, rateUpdatedAt: st.rateUpdatedAt || 0,
      sold: st.sold || 0, updatedAt: st.updatedAt || 0,
      views: Array.isArray(st.views) ? st.views.slice(0, 50) : DEFAULT_VIEWS.slice(),
      customCharacteristics: Array.isArray(st.customCharacteristics) ? st.customCharacteristics.slice(0, 50) : [],
      roomAudits: Array.isArray(st.roomAudits) ? st.roomAudits.slice() : [],
    };
  }
  function cuWriteLocal(st, id) {
    try {
      localStorage.setItem(cuStoreKey(id), JSON.stringify(cuDocument(st)));
      return true;
    } catch (err) {
      console.warn('cuWriteLocal storage failed', err);
      return false;
    }
  }
  function cuReadLocal(id) {
    try {
      const raw = JSON.parse(localStorage.getItem(cuStoreKey(id)) || 'null');
      return raw ? cuHydrate(raw) : null;
    } catch (_) { return null; }
  }
  function cuMerge(mine, theirs) {
    const a = mine && typeof mine === 'object' ? mine : {};
    const b = theirs && typeof theirs === 'object' ? theirs : {};
    const rows = {};
    const take = (x) => {
      if (!x) return;
      const id = String(x.id || ('room:' + x.n));
      const old = rows[id];
      const xt = Math.max(+x.updatedAt || 0, +x.deletedAt || 0);
      const ot = old ? Math.max(+old.updatedAt || 0, +old.deletedAt || 0) : -1;
      if (!old || xt >= ot) rows[id] = { ...x, id };
    };
    (Array.isArray(b.rooms) ? b.rooms : []).forEach(take);
    (Array.isArray(a.rooms) ? a.rooms : []).forEach(take);

    // Connecting-room reciprocity reconciliation
    const activeRooms = Object.values(rows).filter((r) => r && !r.deletedAt);
    const activeMap = new Map();
    activeRooms.forEach((r) => activeMap.set(String(r.id), r));

    const linkDecisions = new Map();
    const pairKeyOf = (id1, id2) => JSON.stringify([String(id1), String(id2)].sort());
    const recordDecision = (id1, id2, at, linked, explicit = true) => {
      if (!id1 || !id2 || id1 === id2) return;
      const pairKey = pairKeyOf(id1, id2);
      const prev = linkDecisions.get(pairKey);
      if (!prev || (explicit && !prev.explicit) || (explicit === prev.explicit && (at > prev.at || (at === prev.at && !linked)))) linkDecisions.set(pairKey, { at, linked, explicit });
    };

    const allSources = (Array.isArray(a.rooms) ? a.rooms : []).concat(Array.isArray(b.rooms) ? b.rooms : []);
    allSources.forEach((r) => {
      if (!r || !r.id) return;
      const rid = String(r.id);
      const meta = (r.connectingMeta && typeof r.connectingMeta === 'object') ? r.connectingMeta : {};
      for (const [targetId, entry] of Object.entries(meta)) {
        if (entry && typeof entry === 'object' && entry.at != null) {
          recordDecision(rid, String(targetId), +entry.at || 0, !!entry.linked);
        }
      }
      if (Array.isArray(r.connectingRoomIds)) {
        const rTime = Math.max(+r.updatedAt || 0, 1);
        r.connectingRoomIds.forEach((cid) => {
          if (cid && cid !== rid) {
            const pairKey = pairKeyOf(rid, cid);
            if (!linkDecisions.has(pairKey)) {
              recordDecision(rid, String(cid), rTime, true, false);
            }
          }
        });
      }
    });

    activeRooms.forEach((r) => {
      const rid = String(r.id);
      const newConnecting = new Set();
      const newMeta = { ...(r.connectingMeta || {}) };

      for (const other of activeRooms) {
        const oid = String(other.id);
        if (rid === oid) continue;
        const pairKey = pairKeyOf(rid, oid);
        const decision = linkDecisions.get(pairKey);
        if (decision) {
          newMeta[oid] = { at: decision.at, linked: decision.linked };
          if (decision.linked) newConnecting.add(oid);
        } else if (Array.isArray(r.connectingRoomIds) && r.connectingRoomIds.includes(oid)) {
          newConnecting.add(oid);
        }
      }
      r.connectingRoomIds = Array.from(newConnecting);
      r.connectingMeta = newMeta;
    });

    // Enforce strict mutual reciprocity and remove dead references
    activeRooms.forEach((r) => {
      const rid = String(r.id);
      r.connectingRoomIds = (r.connectingRoomIds || []).filter((cid) => {
        const other = activeMap.get(String(cid));
        return other && Array.isArray(other.connectingRoomIds) && other.connectingRoomIds.map(String).includes(rid);
      });
    });

    const types = {};
    const takeType = (x) => {
      if (!x) return;
      const id = String(x.id || cuTypeId(x.name, x.updatedAt));
      const old = types[id];
      const xt = Math.max(+x.updatedAt || 0, +x.deletedAt || 0);
      const ot = old ? Math.max(+old.updatedAt || 0, +old.deletedAt || 0) : -1;
      if (!old || xt >= ot) types[id] = { ...x, id };
    };
    (Array.isArray(b.roomTypes) ? b.roomTypes : []).forEach(takeType);
    (Array.isArray(a.roomTypes) ? a.roomTypes : []).forEach(takeType);
    const floors = {};
    const takeFloor = (x) => {
      if (!x) return;
      const id = String(x.id || cuFloorId(x.name, x.updatedAt));
      const old = floors[id];
      const xt = Math.max(+x.updatedAt || 0, +x.deletedAt || 0);
      const ot = old ? Math.max(+old.updatedAt || 0, +old.deletedAt || 0) : -1;
      if (!old || xt >= ot) floors[id] = { ...x, id };
    };
    (Array.isArray(b.floors) ? b.floors : []).forEach(takeFloor);
    (Array.isArray(a.floors) ? a.floors : []).forEach(takeFloor);
    const folios = {};
    const takeFolio = (f) => {
      if (!f || !f.room) return;
      const old = folios[f.room];
      if (!old || (+f.updatedAt || 0) >= (+old.updatedAt || 0)) folios[f.room] = f;
    };
    (Array.isArray(b.folios) ? b.folios : []).forEach(takeFolio);
    (Array.isArray(a.folios) ? a.folios : []).forEach(takeFolio);
    const rateOwner = (+a.rateUpdatedAt || 0) >= (+b.rateUpdatedAt || 0) ? a : b;

    // Deduplicate audit events by id
    const auditMap = new Map();
    const takeAudit = (item) => {
      if (!item || typeof item !== 'object') return;
      const id = String(item.operationId || item.id || ('audit_' + item.at + '_' + (item.actor?.id || '')));
      if (!auditMap.has(id)) {
        auditMap.set(id, item);
      } else {
        const prev = auditMap.get(id);
        if ((+item.at || 0) >= (+prev.at || 0)) auditMap.set(id, item);
      }
    };
    (Array.isArray(a.roomAudits) ? a.roomAudits : []).forEach(takeAudit);
    (Array.isArray(b.roomAudits) ? b.roomAudits : []).forEach(takeAudit);

    const configOwner = (+a.configUpdatedAt || 0) > (+b.configUpdatedAt || 0) ? a : b;
    const mergedViews = Array.isArray(configOwner.views) ? configOwner.views.slice() : DEFAULT_VIEWS.slice();

    return {
      ...a, ...b,
      v: 4, rooms: Object.values(rows), roomTypes: Object.values(types), floors: Object.values(floors), folios: Object.values(folios),
      baseRate: rateOwner.baseRate == null ? null : +rateOwner.baseRate,
      rateUpdatedAt: +rateOwner.rateUpdatedAt || 0,
      sold: Math.max(+a.sold || 0, +b.sold || 0), updatedAt: Math.max(+a.updatedAt || 0, +b.updatedAt || 0),
      views: mergedViews,
      configUpdatedAt: +configOwner.configUpdatedAt || 0,
      customCharacteristics: (configOwner.customCharacteristics || []).slice(),
      roomAudits: Array.from(auditMap.values()).sort((x, y) => (+x.at || 0) - (+y.at || 0)),
    };
  }
  function cuState() {
    cuEnsureFilterVenue();
    const id = cuStateId();
    if (!CUSTOM_HX[id]) {
      CUSTOM_HX[id] = cuReadLocal(id) || cuSeed();
      cuWriteLocal(CUSTOM_HX[id], id);
    }
    CUSTOM_HX[id].count = Object.keys(CUSTOM_HX[id].rooms || {}).length;
    return CUSTOM_HX[id];
  }
  function cuSave(st) {
    st = st || cuState();
    st.count = Object.keys(st.rooms || {}).length;
    st.updatedAt = cuStamp();
    const localOk = cuWriteLocal(st, cuStateId());
    if (hotelCloud) hotelCloud.push();
    return localOk;
  }
  async function cuSaveCloud(st) {
    if (!hotelCloud || typeof hotelCloud.save !== 'function') return { ok: false, status: 503, error: 'cloud-unavailable' };
    const scope = cuStateId();
    const payload = cuDocument(st || cuState());
    const result = await hotelCloud.save(payload);
    if (scope !== cuStateId()) return { ok: false, status: 409, error: 'tenant-switched' };
    return result || { ok: false, status: 503, error: 'unconfirmed' };
  }
  async function cuCommitDraft(st) {
    const scope = cuStateId();
    st.updatedAt = cuStamp();
    const result = await cuSaveCloud(st);
    if (!result.ok) throw new Error(result.status === 409
      ? trL({fr:'Actualisez le plan puis réessayez. Aucune modification confirmée.',en:'Refresh the room plan and retry. No change confirmed.',ar:'حدّث مخطط الغرف وأعد المحاولة. لم يتم تأكيد أي تعديل.'})
      : trL({fr:'Enregistrement non confirmé. Vérifiez la connexion et réessayez.',en:'Save not confirmed. Check your connection and retry.',ar:'لم يتم تأكيد الحفظ. تحقق من الاتصال وأعد المحاولة.'}));
    if (scope !== cuStateId()) throw new Error(tx('Établissement changé'));
    const next = result.data ? cuHydrate(result.data) : st;
    CUSTOM_HX[scope] = next;
    const cached = cuWriteLocal(next, scope);
    if (!cached) toast(trL({fr:'Confirmé au serveur, cache local indisponible',en:'Saved on server; local cache unavailable',ar:'حُفظ في الخادم؛ التخزين المحلي غير متاح'}), {type:'warn'});
    return next;
  }
  function cuCloudWrite(doc) {
    const id = cuStateId();
    if (!id) return;
    CUSTOM_HX[id] = cuHydrate(doc);
    cuWriteLocal(CUSTOM_HX[id], id);
    if (openDrawer && isCustomHotel()) rerender();
  }
  function bindCuCloud() {
    if (!window.KiwiCloudDoc || !window.KiwiVenue) return;
    if (!hotelCloud) hotelCloud = window.KiwiCloudDoc.attach({
      feature: 'rooms',
      slug: () => window.KiwiCloudDoc.slugFor(cuVenueId()),
      localKey: () => cuStoreKey(),
      read: () => cuDocument(cuState()),
      write: cuCloudWrite,
      merge: cuMerge,
      isEmpty: (d) => !d || (!d.rooms?.length && !d.floors?.length && !d.roomTypes?.length),
      onPulled: () => { if (openDrawer && isCustomHotel()) rerender(); },
    });
    hotelCloud.bind();
  }
  /* Venue-routed accessors — the shared folio/rack/walk-in engine reads
   * through these so it operates on whichever hotel is active. */
  const R = () => (isCustomHotel() ? cuState().rooms : ROOMS);
  const F = () => (isCustomHotel() ? cuState().folios : FOLIOS);
  const roomTypeOf = (n) => {
    if (!isCustomHotel()) return TYPES[ROOMS[n].type];
    const st = cuState();
    const r = st.rooms[n] || {};
    const type = st.roomTypes?.[r.typeId];
    return {
      name: type?.name || r.typeName || tx('Chambre'),
      maxGuests: type?.maxGuests || 2,
      base: type ? (type.rate == null ? st.baseRate : type.rate) : (r.rate == null ? st.baseRate : r.rate),
    };
  };
  const totalRooms = () => (isCustomHotel() ? cuState().count : 24);
  /* Ticket #0006 · connecting doors are physical: same floor only. Keyed on
   * floorId (rename-safe); rooms without one fall back to the floor label so
   * unknown floors group together instead of vanishing. */
  const cuFloorKey = (r) => String((r && r.floorId) || ('~' + ((r && r.floor) || '')));
  const roomCountLabel = () => txn(totalRooms(), 'chambre');
  const vName = () => ((window.KiwiVenue && window.KiwiVenue.getCurrentVenueData && window.KiwiVenue.getCurrentVenueData()) || {}).name || tx('Votre établissement');
  /* A custom hotel's encaissements are REAL — feed the merchant sales store
   * so the hero, KPI band and feed recompute from them (same pipeline as
   * the POS «Nouvelle vente»). */
  /* `method` est le moyen réellement encaissé, choisi à la réception :
   * espèces ou carte. Avant, chaque départ et chaque walk-in partaient en
   * « carte », et le Z déclarait en terminal de l'argent qui dormait dans le
   * tiroir. */
  function recordSale(amount, identity, label, method) {
    if (!isCustomHotel() || !(amount > 0)) return false;
    if (method !== 'cash' && method !== 'card') return false;
    const live = window.KiwiLive;
    if (!live?.isOn?.() || !live?.postSale) return false;
    const key = String(identity || ('hotel-' + Date.now())).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 54);
    const result = live.postSale({
      id: 'hotel-' + key, amount: Math.round(amount * 100) / 100, method,
      label: String(label || 'Encaissement hôtel').slice(0, 80), ref: key,
      time: new Date(), channel: 'hotel'
    });
    return result?.ok === true;
  }

  /* Title and subtitle may be functions: a language switch re-reads them
   * (see the kiwi:langchange listener in register). */
  function page(pageKey, title, subtitle, bodyFn) {
    const titleFn = typeof title === 'function' ? title : () => title;
    const subFn = typeof subtitle === 'function' ? subtitle : () => subtitle;
    const p = K().appPage(pageKey, { title: titleFn(), subtitle: subFn(), body: bodyFn() });
    openDrawer = { el: p.el, page: pageKey, bodyFn, titleFn, subFn, close: p.close };
    return p;
  }
  function rerender() {
    // Les séjours ont pu bouger depuis la peinture précédente.
    cuOccupancyMemo = null;
    if (!openDrawer) return;
    const body = openDrawer.el.querySelector('.genpage-body') || openDrawer.el.querySelector('.kiwi-drawer-body');
    if (body) {
      const scrollEl = body.closest('.genpage-scroll') || body;
      const top = scrollEl ? scrollEl.scrollTop : 0;
      const left = scrollEl ? scrollEl.scrollLeft : 0;
      const winTop = typeof window !== 'undefined' ? window.scrollY : 0;
      const winLeft = typeof window !== 'undefined' ? window.scrollX : 0;
      body.innerHTML = openDrawer.bodyFn();
      if (scrollEl) {
        scrollEl.scrollTop = top;
        scrollEl.scrollLeft = left;
      }
      if (typeof window !== 'undefined' && window.scrollTo) {
        window.scrollTo(winLeft, winTop);
      }
    }
    if (openDrawer.page === 'chambres' && isCustomHotel()) {
      const first = openDrawer.el.querySelector('.genpage-head p .seg');
      if (first) first.textContent = roomCountLabel();
    }
  }

  /* ═══════════════ FOLIO MODAL · la note unifiée ═══════════════ */
  function folioModalHtml(room, highlightNew) { return window.__kiwiHotelInternal.part('folio').folioModalHtml.apply(this, arguments); }
  function openFolio(room, highlightNew) {
    const f = F()[room];
    const m = K().modal({
      tag: tx('FOLIO · CH. {n}', { n: room }),
      title: f ? f.guest : tx('Chambre {n}', { n: room }),
      desc: isCustomHotel() ? tx('Nuits, formule repas et consommations de la chambre, une seule note.') : 'Chambres + restaurant + hammam + taxe de séjour, une seule note.',
      width: 600,
      body: folioModalHtml(room, highlightNew),
    });
    openModal = { el: m.el, close: m.close, room };
    if (f) f.lines.forEach((l) => { delete l.isNew; });
  }

  /* Add-charge picker — restaurant + spa items du riad postent sur le folio */
  const QUICK_ITEMS = [
    { label: 'Thé à la menthe', amt: 30, src: 'resto' },
    { label: 'Déjeuner terrasse · formule', amt: 165, src: 'resto' },
    { label: 'Dîner aux chandelles · couvert', amt: 240, src: 'resto' },
    { label: 'Hammam traditionnel', amt: 280, src: 'spa' },
    { label: 'Gommage beldi', amt: 250, src: 'spa' },
    { label: 'Rituel hammam + massage duo', amt: 980, src: 'spa' },
  ];
  /* Custom hotel → generic picker shaped by the step-2 profile (resto / spa
   * answered ⇒ their item families appear); riad → the Café-Atlas-DNA carte. */
  function quickItems() { return window.__kiwiHotelInternal.part('folio').quickItems.apply(this, arguments); }
  function addChargeHtml(room) { return window.__kiwiHotelInternal.part('folio').addChargeHtml.apply(this, arguments); }

  function nowLabel() { return window.__kiwiHotelInternal.part('folio').nowLabel.apply(this, arguments); }
  function postCharge(room, label, amt, src, silent) { return window.__kiwiHotelInternal.part('folio').postCharge.apply(this, arguments); }

  /* ═══════════════ PAGE · RÉCEPTION ═══════════════ */
  function counts() {
    if (isCustomHotel()) {
      const rs = Object.values(R());
      const tonight = cuTonight();
      return {
        occToNight: tonight.sold,
        tonightKnown: tonight.known,
        toClean: rs.filter((r) => cuRoomStatus(r).key === 'sale').length,
        arrDone: 0, depPending: 0,
      };
    }
    const occToNight = Object.values(ROOMS).filter((r) => ['occ', 'depart', 'arrivee', 'sale'].includes(r.status) && r.guest).length;
    const toClean = HK_QUEUE.length;
    const arrDone = ARRIVALS.filter((a) => a.done).length;
    const depPending = DEPARTURES.filter((d) => !d.settled).length;
    return { occToNight, toClean, arrDone, depPending };
  }
  function receptionBody() {
    const c = counts();
    const arr = ARRIVALS.map((a) => `
      <div class="hx-arr${a.done ? ' done' : ''}">
        <span class="tm">${a.t}</span>
        <div class="who">
          <b>${a.guest} · Ch. ${a.room}</b>${a.repeat ? ' <span class="hx-pill ok">FIDÈLE ×2</span>' : ''}
          <div class="sub">${srcPill(a.src)} ${a.nights} nuit${a.nights > 1 ? 's' : ''} · ${a.pax} pers · ${a.note}</div>
        </div>
        <span>${a.done ? '<span class="hx-pill ok">ARRIVÉ ✓</span>' : '<span class="hx-pill neutral">À VENIR</span>'}</span>
        ${a.done
          ? `<button class="hx-btn ghost" data-action="hx-folio" data-arg="${a.room}">Folio</button>`
          : `<button class="hx-btn atlas" data-action="hx-checkin" data-arg="${a.id}">Check-in</button>`}
      </div>`).join('');
    const dep = DEPARTURES.map((d) => `
      <div class="hx-arr${d.settled ? ' done' : ''}">
        <span class="tm">${d.t}</span>
        <div class="who">
          <b>${d.guest} · Ch. ${d.room}</b>
          <div class="sub">${d.settled ? 'Folio soldé · ' + MAD(d.folio) : 'Late check-out réglé 150 MAD · chambre encore occupée'}</div>
        </div>
        <span>${d.settled ? '<span class="hx-pill ok">SOLDÉ ✓</span>' : '<span class="hx-pill late">EN RETARD</span>'}</span>
        ${d.settled
          ? `<span style="font-size:11px;color:var(--n-500);font-family:var(--mono);">9h0${DEPARTURES.indexOf(d) + 1} → IBAN</span>`
          : `<button class="hx-btn atlas" data-action="hx-checkout" data-arg="${d.room}">Check-out</button>`}
      </div>`).join('');
    const inHouse = Object.values(ROOMS).filter((r) => r.status === 'occ');
    return `<div class="hx-page">
      <div class="hx-strip">
        <div class="hx-kpi"><div class="l">Occupation ce soir</div><div class="v">${c.occToNight} / 24</div><div class="d up">${(window.KiwiNumber?.number((c.occToNight / 24 * 100), 1) ?? new Intl.NumberFormat(document.documentElement?.lang === 'en' ? 'en-GB' : 'fr-FR', {minimumFractionDigits:1,maximumFractionDigits:1}).format((c.occToNight / 24 * 100)))} % · +2,4 pts vs hier</div></div>
        <div class="hx-kpi"><div class="l">Arrivées</div><div class="v">${ARRIVALS.length} <small>· ${c.arrDone} faites</small></div><div class="d">premier ETA 15h30</div></div>
        <div class="hx-kpi"><div class="l">Départs</div><div class="v">5 <small>· ${5 - c.depPending} soldés</small></div><div class="d ${c.depPending ? 'warn' : 'up'}">${c.depPending ? '1 en retard · Ch. 9' : 'tous soldés ✓'}</div></div>
        <div class="hx-kpi"><div class="l">À nettoyer</div><div class="v">${c.toClean} <small>/ 24</small></div><div class="d">ménage en cours · Ch. 12</div></div>
        <div class="hx-kpi"><div class="l">ADR ce soir</div><div class="v">985 <small>MAD</small></div><div class="d up">RevPAR 862 MAD</div></div>
      </div>
      <div class="hx-h"><span class="t">Arrivées du jour</span><span class="s">check-in en un geste · la chambre passe « occupée » et le folio s'ouvre</span>
        <button class="hx-demo" data-action="hx-demo-folio"><i></i>Démo · thé + hammam → folio Ch. 7</button>
      </div>
      <div class="block" style="padding:6px 14px;"><div class="hx-list">${arr}</div></div>
      <div class="hx-h"><span class="t">Départs du jour</span><span class="s">folio encaissé en un geste · taxe de séjour incluse · règlement T+1</span></div>
      <div class="block" style="padding:6px 14px;"><div class="hx-list">${dep}</div></div>
      <div class="hx-h"><span class="t">En maison · ${inHouse.length} chambres</span>
        <span class="a" data-action="nav-chambres">Plan des chambres →</span>
        <button class="hx-btn ghost" data-action="hx-walkin">+ Walk-in · vendre une chambre</button>
      </div>
      <div class="block" style="padding:12px 14px;font-size:12.5px;color:var(--n-500);line-height:2;">
        ${inHouse.map((r) => `<span style="display:inline-block;margin-right:14px;"><b style="color:var(--ink);font-family:var(--mono);">Ch. ${r.n}</b> ${r.guest}</span>`).join('')}
      </div>
    </div>`;
  }

  /* ═══════════════ PAGE · PLAN DES CHAMBRES ═══════════════ */
  function rackBody() {
    const stLbl = { occ: 'Occupée', depart: 'Départ du jour', arrivee: 'Arrivée du jour', libre: 'Libre · propre', sale: 'Libre · sale', hs: 'Hors-service' };
    const floors = FLOORS.map((f) => `
      <div class="hx-floor-lbl">${f.lbl}</div>
      <div class="hx-rack">${f.rooms.map((n) => {
        const r = ROOMS[n];
        const bdg = r.status === 'depart' ? '<span class="bdg">DÉPART</span>'
          : r.status === 'arrivee' ? '<span class="bdg">ARRIVÉE</span>'
          : r.status === 'sale' ? '<span class="bdg">MÉNAGE</span>' : '';
        return `<div class="hx-room st-${r.status}" data-action="hx-room" data-arg="${n}">
          ${bdg}
          <div><div class="no">CH. ${n}</div><div class="ty">${TYPES[r.type].name}</div></div>
          <div><div class="gu">${r.guest || (r.status === 'hs' ? 'Hors-service' : 'Libre')}</div><div class="mt">${r.meta || ''}</div></div>
        </div>`;
      }).join('')}</div>`).join('');
    return `<div class="hx-page">
      <div class="hx-legend">
        <span><span class="sw" style="background:var(--atlas);border-color:var(--atlas);"></span>Occupée</span>
        <span><span class="sw" style="background:var(--atlas);border-top:3px solid var(--warning);"></span>Départ du jour</span>
        <span><span class="sw" style="background:var(--mint-soft);border:1.5px dashed var(--atlas);"></span>Arrivée du jour</span>
        <span><span class="sw" style="background:var(--surface,#fff);"></span>Libre · propre</span>
        <span><span class="sw" style="background:var(--warn-soft);border-color:var(--warning);"></span>Libre · sale</span>
        <span><span class="sw" style="background:repeating-linear-gradient(45deg,var(--n-100),var(--n-100) 4px,transparent 4px,transparent 8px);"></span>Hors-service</span>
        <span style="margin-left:auto;">Toucher une chambre → client + folio</span>
      </div>
      ${floors}
    </div>`;
  }
  function cuConnectingAvail(cr, dates) {
    if (!cr) return '';
    const crStatus = cuRoomStatus(cr);
    if (!dates || !dates.startAt || !dates.endAt) {
      return tx('Disponibilité non vérifiée (dates requises)');
    }
    const doc = window.KiwiReservations?.get?.();
    if (!doc || !Array.isArray(doc.bookings)) {
      return tx('Disponibilité non vérifiée (réservations non chargées)');
    }
    if (typeof window.KiwiReservations.resourceFree !== 'function') {
      return tx('Disponibilité non vérifiée');
    }
    const parseTime = (v) => typeof v === 'number' ? v : Date.parse(v);
    const start = parseTime(dates.startAt), end = parseTime(dates.endAt);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return tx('Disponibilité non vérifiée (dates invalides)');
    let isFree;
    try { isFree = window.KiwiReservations.resourceFree(doc, cr.id, start, end); }
    catch (_) { return tx('Disponibilité non vérifiée'); }
    if (!isFree) {
      return tx('Occupée / réservée sur ces dates');
    }
    return cr.status === 'libre' ? tx('Disponible pour ces dates') : crStatus.label;
  }
  function roomModal(n, opts) {
    const r = R()[n];
    if ((r.status === 'occ' || r.status === 'depart') && F()[n]) return openFolio(n);
    if (r.status === 'arrivee' && F()[n]) return openFolio(n);
    const dates = (opts && opts.startAt && opts.endAt) ? { startAt: +opts.startAt, endAt: +opts.endAt } : null;
    /* Ce qu'on affiche est l'état réel de la chambre, séjours compris — sans
     * quoi une chambre habitée s'annonce « Libre · propre » et propose le
     * walk-in. `live` sert aussi à nommer le client présent. */
    const liveRoom = cuRoomLive(r);
    const liveStatus = cuRoomStatus(r);
    const stLbl = { arrivee: tx('Arrivée attendue'), libre: tx('Libre · propre'), sale: tx('Libre · sale, en remise'), hs: tx('Hors-service') };
    const m = K().modal({
      tag: tx('CH. {n}', { n }) + ' · ' + roomTypeOf(n).name.toUpperCase(),
      title: r.guest || liveRoom?.stay?.customer?.name || (liveRoom ? liveStatus.label : (stLbl[r.status] || tx('Chambre {n}', { n }))),
      desc: tx(r.meta || ''),
      width: 480,
      body: `
        <div style="display:flex;flex-direction:column;gap:10px;font-size:13px;">
          <div style="display:flex;justify-content:space-between;"><span style="color:var(--n-500);">${tx('Statut')}</span><b>${esc(liveStatus.label)}</b></div>
          ${liveRoom ? `<div style="display:flex;justify-content:space-between;"><span style="color:var(--n-500);">${tx('Dossier')}</span><b>${esc(cuDay(liveRoom.stay.hotel.checkIn))}${hxTo()}${esc(cuDay(liveRoom.stay.hotel.checkOut))}</b></div>` : ''}
          <div style="display:flex;justify-content:space-between;"><span style="color:var(--n-500);">${tx('Tarif de base')}</span><b style="font-family:var(--mono);">${tx('{amount} / nuit', { amount: MAD(roomTypeOf(n).base) })}</b></div>
          ${r.view ? `<div style="display:flex;justify-content:space-between;"><span style="color:var(--n-500);">${tx('Vue')}</span><b>${tx('Vue {name}', { name: esc(cuViewLabel(r.view)) })}</b></div>` : ''}
          ${(r.characteristics && r.characteristics.length) ? `<div style="display:flex;justify-content:space-between;"><span style="color:var(--n-500);">${tx('Équipements')}</span><b>${esc(r.characteristics.map((c) => cuCharLabel(c)).join(', '))}</b></div>` : ''}
          ${(r.connectingRoomIds && r.connectingRoomIds.length) ? `
          <div style="display:flex;flex-direction:column;gap:4px;padding:8px 10px;border-radius:8px;background:var(--n-50,#f7f8f7);margin-top:4px;">
            <span style="color:var(--n-500);font-size:11.5px;font-weight:600;">${tx('Portes communicantes')}</span>
            <div style="display:flex;flex-direction:column;gap:3px;font-size:12px;">
              ${r.connectingRoomIds.map((cid) => {
                const cr = Object.values(R()).find((x) => x.id === cid);
                if (!cr) return '';
                const availLabel = cuConnectingAvail(cr, dates);
                return `<span><b>${tx('Ch. {n}', { n: cr.n })}</b> (${esc(roomTypeOf(cr.n).name)}) · ${esc(availLabel)}</span>`;
              }).filter(Boolean).join('')}
            </div>
            <small style="color:var(--n-500);font-size:11px;">${tx('Chambre communicante vendue séparément. Non réservée automatiquement.')}</small>
          </div>` : ''}
          ${liveStatus.key === 'sale' ? `<div style="display:flex;justify-content:space-between;"><span style="color:var(--n-500);">${tx('Ménage')}</span><b>${isCustomHotel() ? tx('à remettre à blanc') : ((HK_QUEUE.find((q) => q.room === n) || {}).who || 'à assigner')}</b></div>` : ''}
        </div>
        <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:20px;flex-wrap:wrap;">
          ${liveStatus.key === 'libre' ? `<button class="hx-btn atlas" data-action="hx-walkin-room" data-arg="${n}">${tx('Vendre ce soir · walk-in')}</button>` : ''}
          ${liveRoom && liveRoom.kind !== 'arrivee' ? `<button class="hx-btn ghost" data-action="hx-stay-edit" data-arg="${esc(liveRoom.stay.id)}">${tx('Ouvrir le dossier')}</button>` : ''}
          ${liveStatus.key === 'sale' ? (isCustomHotel()
            ? `<button class="hx-btn atlas" data-action="hx-hk-done" data-arg="${n}">${tx('Marquer propre · relouable')}</button>`
            : `<button class="hx-btn atlas" data-action="hx-hk-open">Ouvrir la file ménage</button>`) : ''}
          ${r.status === 'hs' ? `<button class="hx-btn ghost" data-action="hx-hs-fix" data-arg="${n}">${tx('Marquer réparée')}</button>` : ''}
        </div>`,
    });
    openModal = { el: m.el, close: m.close };
  }

  /* ═══════════════ PAGE · RÉSERVATIONS (TAPE CHART) ═══════════════ */
  function occupancyByDay() {
    return TAPE_DAYS.map((_, di) => {
      const cnt = STAYS.filter((s) => di >= s.s && di < s.s + s.n).length;
      return Math.min(cnt, 23);
    });
  }
  function tapeBody() {
    const occ = occupancyByDay();
    const head = `<div class="hx-tape" style="--days:${TAPE_DAYS.length};">
      <div class="hd" style="text-align:left;padding-left:8px;">CHAMBRE</div>
      ${TAPE_DAYS.map((d, i) => `<div class="hd${i === TODAY_IDX ? ' today' : ''}">${d}${i === TODAY_IDX ? ' ·' : ''}</div>`).join('')}
      ${FLOORS.flatMap((f) => f.rooms).map((rn) => {
        const cells = TAPE_DAYS.map((_, di) => `<div class="cell${di === TODAY_IDX ? ' today' : ''}" style="grid-column:${di + 1};"></div>`).join('');
        const stays = STAYS.filter((s) => s.r === rn && s.s + s.n > 0 && s.s < TAPE_DAYS.length).map((s) => {
          const from = Math.max(0, s.s), to = Math.min(TAPE_DAYS.length, s.s + s.n);
          return `<div class="stay src-${s.src}" style="grid-column:${from + 1} / ${to + 1};" data-action="hx-stay" data-arg="${s.r}|${s.g}|${s.n}|${s.src}">${s.g}</div>`;
        }).join('');
        return `<div class="rm">Ch. ${rn} · ${TYPES[typeOf(rn)].name.split(' ')[0]}${ROOMS[rn].status === 'hs' ? ' ⊘' : ''}</div>` +
          `<div class="rw" style="--days:${TAPE_DAYS.length};">${cells}${stays}</div>`;
      }).join('')}
      <div class="occ-lbl">Occupation</div>
      ${occ.map((c, i) => `<div class="occ-cell${i === TODAY_IDX ? ' today' : ''}" style="background:rgba(11,110,79,${(c / 24 * 0.55).toFixed(2)});${c >= 22 ? 'color:#fff;font-weight:700;' : ''}">${Math.round(c / 24 * 100)} %</div>`).join('')}
    </div>`;
    return `<div class="hx-page">
      <div class="hx-legend">
        <span><span class="sw" style="background:var(--riad);"></span>Booking.com</span>
        <span><span class="sw" style="background:var(--atlas);"></span>Direct</span>
        <span><span class="sw" style="background:var(--warning);"></span>Airbnb</span>
        <span><span class="sw" style="background:var(--n-400);"></span>Expedia</span>
        <span><span class="sw" style="background:var(--mint-soft);border-color:var(--atlas);"></span>Walk-in</span>
        <span style="margin-left:auto;">Samedi 13 · 96 %, pensez aux tarifs weekend (Tarifs & occupation)</span>
      </div>
      <div class="block hx-tape-wrap" style="padding:14px;">${head}</div>
    </div>`;
  }

  /* ═══════════════ PAGE · MÉNAGE ═══════════════ */
  function menageBody() { return window.__kiwiHotelInternal.part('housekeeping').menageBody.apply(this, arguments); }

  /* ═══════════════ PAGE · TARIFS & OCCUPATION ═══════════════ */
  function tarifsBody() {
    const grid = `<div class="hx-rates">
      <div class="hd" style="text-align:left;padding-left:8px;">TYPE · ${aiApplied ? 'TARIFS IA APPLIQUÉS' : 'TARIF / NUIT'}</div>
      ${RATE_DAYS.map((d, i) => `<div class="hd${i >= 3 && i <= 4 ? ' we' : ''}">${d}${i === 0 ? ' · AUJ.' : ''}</div>`).join('')}
      ${Object.keys(RATES).map((ty) => {
        const r = RATES[ty];
        return `<div class="ty">${TYPES[ty].name}</div>` + r.base.map((b, i) => `
          <div class="rc${aiApplied && r.ai[i] ? ' edited' : ''}" data-action="hx-rate-cell" data-arg="${ty}|${i}">
            <div class="base">${fmt(b)}</div>
            ${!aiApplied && r.ai[i] ? `<div class="ai up">IA ${fmt(r.ai[i])}</div>` : (aiApplied && r.ai[i] ? '<div class="ai">appliqué ✓</div>' : '<div class="ai" style="color:var(--n-300);">·</div>')}
          </div>`).join('');
      }).join('')}
    </div>`;
    return `<div class="hx-page">
      <div class="hx-strip">
        <div class="hx-kpi"><div class="l">ADR · 30 jours</div><div class="v">894 <small>MAD</small></div><div class="d up">+3,2 % vs mois dernier</div></div>
        <div class="hx-kpi"><div class="l">RevPAR · 30 jours</div><div class="v">681 <small>MAD</small></div><div class="d up">+5,8 %</div></div>
        <div class="hx-kpi"><div class="l">Occupation · 30 j</div><div class="v">76,2 <small>%</small></div><div class="d up">riads médina : 70 % méd.</div></div>
        <div class="hx-kpi"><div class="l">Weekend 13-14</div><div class="v">96 <small>%</small></div><div class="d warn">demande forte · montez les prix</div></div>
      </div>
      <div class="hx-h"><span class="t">Calendrier tarifaire · 7 jours</span><span class="s">touchez une cellule pour ajuster · l'IA suggère selon saison, remplissage et comp-set</span>
        ${aiApplied ? '<span class="hx-pill ok">SUGGESTIONS APPLIQUÉES ✓</span>' : '<button class="hx-btn atlas" data-action="hx-apply-ai">Appliquer les suggestions IA</button>'}
      </div>
      <div class="block hx-rates-wrap" style="padding:14px;">${grid}</div>
      <div class="hx-row r-2">
        <div class="block" style="padding:16px;">
          <div class="hx-h" style="margin:0 0 10px;"><span class="t">Pourquoi ces suggestions</span></div>
          <div style="font-size:12.5px;color:var(--n-500);line-height:1.7;">
            Samedi 13 juin est à <b style="color:var(--ink);">96 % de remplissage</b> avec 3 jours d'avance, la demande médina monte de 14 % cette semaine (comp-set 64 riads).
            La <b style="color:var(--ink);">Suite Terrasse Royale est sous-cotée</b> : vos 2 suites partent 5 jours sur 7 alors que le comp-set premium affiche +18 % sur le weekend.
            Revenu projeté si appliqué : <b style="color:var(--atlas);">+4 280 MAD sur 7 jours</b>.
          </div>
        </div>
        <div class="block" style="padding:16px;">
          <div class="hx-h" style="margin:0 0 10px;"><span class="t">Saisonnalité Marrakech</span></div>
          <div style="display:flex;flex-direction:column;gap:8px;font-size:12.5px;color:var(--n-500);">
            <div style="display:flex;justify-content:space-between;"><span><span class="hx-ev peak">HAUTE SAISON</span></span><span>octobre → décembre · février → avril</span></div>
            <div style="display:flex;justify-content:space-between;"><span><span class="hx-ev dip">ÉTÉ</span></span><span>juillet-août · chaleur, visez les nuitées MRE</span></div>
            <div style="display:flex;justify-content:space-between;"><span><span class="hx-ev dip">RAMADAN 2027</span></span><span>≈ 8 février → 9 mars · creux puis pic Aïd</span></div>
            <div style="display:flex;justify-content:space-between;"><span><span class="hx-ev peak">AÏD AL-FITR</span></span><span>≈ 10-13 mars 2027 · +28 % vs moyenne</span></div>
          </div>
        </div>
      </div>
    </div>`;
  }

  /* ═══════════════ PAGE · CLIENTS & FIDÉLITÉ ═══════════════ */
  function donutCss(parts) {
    let acc = 0;
    const stops = parts.map((p) => { const s = `${p.color} ${acc}% ${acc + p.pct}%`; acc += p.pct; return s; }).join(', ');
    return `background: conic-gradient(${stops});`;
  }
  function hotesBody() {
    const rows = GUESTS.map((g) => `
      <div class="hx-guest" data-action="hx-guest" data-arg="${g.id}">
        <span class="hx-av ${g.repeat ? '' : 'd'}">${g.name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()}</span>
        <div>
          <div class="nm">${g.name}
            ${g.repeat ? `<span class="hx-pill ok">FIDÈLE ×${g.stays}</span>` : ''}
            ${g.arrivingToday ? '<span class="hx-pill dark">ARRIVE AUJOURD\'HUI</span>' : ''}
          </div>
          <div class="meta">${g.country} · ${g.stays} séjour${g.stays > 1 ? 's' : ''} · dernier : ${g.last}</div>
          <div style="margin-top:4px;display:flex;gap:5px;flex-wrap:wrap;">${g.prefs.map((p) => `<span class="hx-pref${/allergie/i.test(p) ? ' allergy' : ''}">${p}</span>`).join('')}</div>
        </div>
        <span></span>
        <div class="ltv">${g.ltv ? MAD(g.ltv) : '·'}<small>valeur vie client</small></div>
      </div>`).join('');
    return `<div class="hx-page">
      <div class="hx-strip">
        <div class="hx-kpi"><div class="l">Profils clients</div><div class="v">612</div><div class="d up">+38 ce mois</div></div>
        <div class="hx-kpi"><div class="l">Clients fidèles ≥2 séjours</div><div class="v">134</div><div class="d up">22 % du fichier</div></div>
        <div class="hx-kpi"><div class="l">Valeur vie moyenne</div><div class="v">6 840 <small>MAD</small></div><div class="d">chambres + resto + hammam</div></div>
        <div class="hx-kpi"><div class="l">Fidèles revenus via OTA</div><div class="v">22</div><div class="d warn">~28 200 MAD de commission évitable</div></div>
      </div>
      <div class="hx-row r-21">
        <div class="block" style="padding:6px 14px;">
          <div class="hx-h" style="margin:10px 2px 2px;"><span class="t">Fichier clients</span><span class="s">reconnaissance automatique au check-in · préférences servies sans demander</span></div>
          ${rows}
        </div>
        <div class="block" style="padding:16px;">
          <div class="hx-h" style="margin:0 0 12px;"><span class="t">Mix nationalités · 30 j</span></div>
          <div class="hx-donut-wrap">
            <div class="hx-donut" style="${donutCss(NATIONALITIES)}"><div class="ctr"><b>34 %</b><span>FRANCE</span></div></div>
            <div class="hx-dlg">${NATIONALITIES.map((n) => `<div class="r"><span class="sw" style="background:${n.color};"></span><span>${n.c}</span><span class="pc">${n.pct} %</span><span></span></div>`).join('')}</div>
          </div>
          <div style="font-size:11.5px;color:var(--n-500);margin-top:12px;line-height:1.6;">Le couple FR + MA pèse 56 % des nuitées, alignez petits-déjeuners, langues du staff et horaires hammam.</div>
        </div>
      </div>
    </div>`;
  }
  function guestModal(id) {
    const g = GUESTS.find((x) => x.id === id);
    if (!g) return;
    const m = K().modal({
      tag: 'CLIENT · ' + g.country.toUpperCase(),
      title: g.name,
      desc: `${g.stays} séjour${g.stays > 1 ? 's' : ''} · dernier : ${esc(g.last)}`,
      width: 520,
      body: `
        <div style="display:flex;flex-direction:column;gap:12px;font-size:13px;">
          <div style="display:flex;justify-content:space-between;"><span style="color:var(--n-500);">Valeur vie client</span><b style="font-family:var(--mono);font-size:16px;">${g.ltv ? MAD(g.ltv) : '·'}</b></div>
          ${g.ltv ? `<div>
            <div style="font-size:11px;font-family:var(--mono);color:var(--n-500);letter-spacing:.05em;margin-bottom:6px;">RÉPARTITION · CHAMBRES / RESTAURANT / HAMMAM</div>
            <div style="display:flex;height:10px;border-radius:999px;overflow:hidden;">
              <i style="flex:${g.split[0]};background:var(--atlas);"></i><i style="flex:${g.split[1]};background:var(--warning);"></i><i style="flex:${g.split[2]};background:var(--riad);"></i>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--n-500);margin-top:5px;"><span>Chambres ${g.split[0]} %</span><span>Restaurant ${g.split[1]} %</span><span>Hammam ${g.split[2]} %</span></div>
          </div>` : ''}
          <div>
            <div style="font-size:11px;font-family:var(--mono);color:var(--n-500);letter-spacing:.05em;margin-bottom:6px;">PRÉFÉRENCES, SERVIES AU CHECK-IN</div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;">${g.prefs.map((p) => `<span class="hx-pref${/allergie/i.test(p) ? ' allergy' : ''}" style="font-size:11.5px;padding:4px 10px;">${p}</span>`).join('')}</div>
          </div>
        </div>
        <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:20px;">
          <button class="hx-btn ghost" data-action="hx-guest-msg" data-arg="${g.id}">Message WhatsApp</button>
          <button class="hx-btn atlas" data-action="hx-guest-direct" data-arg="${g.id}">Proposer un séjour direct · −10 %</button>
        </div>`,
    });
    openModal = { el: m.el, close: m.close };
  }

  /* ═══════════════ PAGE · FOLIOS ═══════════════ */
  function foliosBody() { return window.__kiwiHotelInternal.part('folio').foliosBody.apply(this, arguments); }

  /* ═══════════════ PAGE · CANAUX & OTA ═══════════════ */
  function canauxBody() { return window.__kiwiHotelInternal.part('channels').canauxBody.apply(this, arguments); }

  /* ═══════════════ PAGE · INTELLIGENCE ═══════════════ */
  function forecastSvg() {
    const W = 720, Hh = 200, pad = 28;
    const pts = FORECAST.occ.map((v, i) => {
      const x = pad + i * ((W - pad * 2) / (FORECAST.occ.length - 1));
      const y = Hh - pad - (v / 100) * (Hh - pad * 2);
      return [x, y];
    });
    const line = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
    const area = line + ` L ${pts[pts.length - 1][0].toFixed(1)} ${Hh - pad} L ${pad} ${Hh - pad} Z`;
    const labels = FORECAST.months.map((m, i) => `<text x="${pts[i][0]}" y="${Hh - 8}" text-anchor="middle" font-size="9.5" font-family="var(--mono)" fill="var(--n-400)">${m}</text>`).join('');
    const marks = Object.keys(FORECAST.notes).map((idx) => {
      const i = +idx;
      return `<circle cx="${pts[i][0]}" cy="${pts[i][1]}" r="4.5" fill="${i === 7 ? 'var(--warning)' : 'var(--mint)'}" stroke="var(--riad)" stroke-width="1.5"/>
        <text x="${pts[i][0]}" y="${pts[i][1] - 11}" text-anchor="middle" font-size="9" font-family="var(--mono)" fill="var(--n-500)">${FORECAST.notes[i].toUpperCase()}</text>`;
    }).join('');
    const grid = [25, 50, 75, 100].map((g) => {
      const y = Hh - pad - (g / 100) * (Hh - pad * 2);
      return `<line x1="${pad}" y1="${y}" x2="${W - pad}" y2="${y}" stroke="var(--n-100)" stroke-width="1"/><text x="${pad - 6}" y="${y + 3}" text-anchor="end" font-size="9" font-family="var(--mono)" fill="var(--n-400)">${g}</text>`;
    }).join('');
    const vals = FORECAST.occ.map((v, i) => `<text x="${pts[i][0]}" y="${pts[i][1] - (Object.keys(FORECAST.notes).includes(String(i)) ? 22 : 9)}" text-anchor="middle" font-size="9.5" font-weight="600" font-family="var(--mono)" fill="var(--atlas)">${v}</text>`).join('');
    return `<svg class="hx-fc-svg" viewBox="0 0 ${W} ${Hh}" role="img" aria-label="Prévision d'occupation 12 mois">
      ${grid}
      <path d="${area}" fill="rgba(11,110,79,0.09)"/>
      <path d="${line}" fill="none" stroke="var(--atlas)" stroke-width="2.2" stroke-linecap="round"/>
      ${vals}${marks}${labels}
    </svg>`;
  }
  function intelBody() {
    const ns = NOSHOW_RISK.map((n) => `
      <div class="hx-q">
        <i class="dot" style="background:${n.high ? 'var(--danger)' : 'var(--warning)'};"></i>
        <div><div class="nm">${n.ref} · ${n.room} · ${n.when}</div><div class="nt">${n.src} · ${n.why}</div></div>
        <span class="hx-pill ${n.high ? 'late' : 'pend'}">RISQUE ${n.risk} %</span>
        <button class="hx-btn ghost" data-action="hx-noshow-secure" data-arg="${n.ref}">Demander prépaiement</button>
      </div>`).join('');
    return `<div class="hx-page">
      <div class="hx-h"><span class="t">Prévision d'occupation · 12 mois</span><span class="s">saisonnalité Marrakech + calendrier hégirien + événements ville, comme la prévision de stock du restaurant</span></div>
      <div class="block" style="padding:16px;">
        ${forecastSvg()}
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;">
          <span class="hx-ev peak">HAUTE SAISON · OCT → DÉC</span>
          <span class="hx-ev dip">RAMADAN · 8 FÉV → 9 MARS 2027 · −20 pts</span>
          <span class="hx-ev peak">AÏD AL-FITR · ≈10-13 MARS · PIC FAMILLES MRE</span>
          <span class="hx-ev dip">ÉTÉ · JUIL-AOÛT · CHALEUR</span>
        </div>
      </div>
      <div class="hx-row r-2">
        <div class="block" style="padding:16px;">
          <div class="hx-h" style="margin:0 0 8px;"><span class="t">Suggestions tarifaires</span><span class="a" data-action="nav-tarifs">Ouvrir les tarifs →</span></div>
          <div style="font-size:12.5px;color:var(--n-500);line-height:1.8;">
            <div>· Weekend 13-14 juin : <b style="color:var(--ink);">+18 %</b> sur Confort & Suites, 96 % de remplissage anticipé.</div>
            <div>· Suite Terrasse Royale <b style="color:var(--ink);">sous-cotée de ~200 MAD</b> vs comp-set premium médina.</div>
            <div>· Mardi-mercredi : promo directe −10 %, remplirait <b style="color:var(--ink);">~2 chambres / semaine</b> en creux.</div>
          </div>
        </div>
        <div class="block" style="padding:6px 14px;">
          <div class="hx-h" style="margin:10px 2px 2px;"><span class="t">Risque no-show · 7 jours</span><span class="s">historique + garantie + délai de réservation</span></div>
          ${ns}
        </div>
      </div>
      <div class="hx-bleed">
        <div class="lbl">OÙ PART L'ARGENT · 30 JOURS</div>
        <div class="big">−${MAD(67190 + 3850 + 950)}</div>
        <div class="sub">Trois fuites mesurées par Kiwi sur votre exploitation, et le manque à gagner des nuits invendues à surveiller.</div>
        <div style="margin-top:14px;">
          <div class="hx-bleed-row"><div>Commissions OTA<div class="nt">Booking 56 180 · Expedia 8 810 · Airbnb 2 200</div></div><span class="am">−${MAD(67190)}</span></div>
          <div class="hx-bleed-row"><div>Late check-outs · 9 rotations bloquées<div class="nt">2 arrivées retardées + 1 surclassement offert</div></div><span class="am">−${MAD(3850)}</span></div>
          <div class="hx-bleed-row"><div>No-shows · 4 ce mois<div class="nt">3 800 MAD récupérés (1ʳᵉ nuit retenue) · 1 non garanti perdu</div></div><span class="am">−${MAD(950)}</span></div>
          <div class="hx-bleed-row"><div>Nuits invendues · 173 nuits<div class="nt">60 % en milieu de semaine → promo directe mar-mer suggérée</div></div><span class="am" style="color:#A8C8B8;">~154 000 MAD de potentiel</span></div>
        </div>
      </div>
    </div>`;
  }

  /* ═══════════════ ACTIONS ═══════════════ */
  /* ═══════════════ CUSTOM-HOTEL PAGES (0000 session) ═══════════════
   * A merchant-created hotel speaks the same modules in starter state —
   * no Riad Yasmina data anywhere. The rack, walk-in, folio and ménage
   * loops are LIVE on the merchant's own rooms; data-fed pages (tape,
   * CRM, canaux, intelligence) show what will appear, pages-pro style. */
  const SPARK_IC = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.9 5.8a2 2 0 001.3 1.3L21 12l-5.8 1.9a2 2 0 00-1.3 1.3L12 21l-1.9-5.8a2 2 0 00-1.3-1.3L3 12l5.8-1.9a2 2 0 001.3-1.3z"/></svg>';
  const CHECK_IC = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
  function cuStarter(head, msg, bullets, foot) {
    return `<div class="gp-starter">
      <div class="gp-starter-ic">${SPARK_IC}</div>
      <h3>${head}</h3>
      <p>${msg}</p>
      <div class="gp-starter-list">
        ${(bullets || []).map((b) => `<div class="gp-starter-row"><span style="color:var(--atlas);display:inline-flex;">${CHECK_IC}</span><span>${b}</span></div>`).join('')}
      </div>
      ${foot ? `<div style="display:flex;gap:10px;justify-content:center;margin-top:18px;flex-wrap:wrap;">${foot}</div>` : ''}
    </div>`;
  }
  function cuStrip() {
    cuWarmStays();
    const c = counts();
    const total = totalRooms();
    const free = Object.values(R()).filter((r) => cuRoomStatus(r).key === 'libre').length;
    const fmtPct = (v) => (window.KiwiNumber?.number(v, 1) ?? new Intl.NumberFormat(document.documentElement?.lang === 'en' ? 'en-GB' : 'fr-FR', {minimumFractionDigits:1,maximumFractionDigits:1}).format(v));
    /* Pas de chambre déclarée, ou séjours pas encore lus : « · », pas « 0 / 0 »
     * ni « 0,0 % », qui se liraient comme une mesure. */
    const known = total > 0 && c.tonightKnown !== false;
    cuStripUnknown = !known && total > 0;
    const occ = known ? `${c.occToNight} / ${total}` : '·';
    const occNote = total === 0 ? tx('aucune chambre déclarée') : (known ? `${ltr(fmtPct(c.occToNight / total * 100) + ' %')} · ${tx('nuit du {date}', { date: cuToday().split('-').reverse().join('/') })}` : tx('lecture des séjours…'));
    return `<div class="hx-strip">
      <div class="hx-kpi"><div class="l">${tx('Occupation ce soir')}</div><div class="v">${ltr(occ)}</div><div class="d">${occNote}</div></div>
      <div class="hx-kpi"><div class="l">${tx('Libres · propres')}</div><div class="v">${free}</div><div class="d">${tx('prêtes à vendre')}</div></div>
      <div class="hx-kpi"><div class="l">${tx('À remettre à blanc')}</div><div class="v">${c.toClean}</div><div class="d">${c.toClean ? tx('voir Ménage') : tx('tout est propre ✓')}</div></div>
      <div class="hx-kpi"><div class="l">${tx('Tarif de base')}</div><div class="v">${cuState().baseRate == null ? '·' : ltr(fmt(cuState().baseRate) + ' <small>MAD</small>')}</div><div class="d">${tx('réglable dans Tarifs')}</div></div>
    </div>`;
  }
  let cuStripUnknown = false;
  function cuEvaluateStayExceptions(b, today) {
    const errs = [];
    if (!b || !b.hotel || b.status === 'cancelled' || b.status === 'no_show') return errs;
    const cin = b.hotel.checkIn, cout = b.hotel.checkOut;
    const guests = Array.isArray(b.guests) ? b.guests : [];
    const partySize = +b.partySize || 1;

    // Stale check-out (in-house guest past departure date)
    if (b.status === 'checked_in' && cout < today) {
      errs.push({
        code: 'stale_checkout',
        severity: 'danger',
        label: tx('Départ dépassé non clôturé'),
        detail: tx('Départ prévu le {date}', { date: cout }),
      });
    }

    // In-house missing guest manifest
    if (b.status === 'checked_in') {
      if (guests.length < partySize) {
        errs.push({
          code: 'missing_manifest',
          severity: 'warn',
          label: tx('Fiche incomplète ({n}/{total} pers.)', { n: guests.length, total: partySize }),
          detail: tx('Voyageurs physiques non enregistrés'),
        });
      }
      guests.forEach((g, idx) => {
        const num = idx + 1;
        if (!g.idDocNumber || !g.idDocType) {
          errs.push({
            code: 'missing_identity',
            severity: 'danger',
            label: tx('Pièce d’identité manquante (Voyageur {n})', { n: num }),
            detail: g.name || tx('Nom non renseigné'),
          });
        }
        if (!g.nationality) {
          errs.push({
            code: 'missing_nationality',
            severity: 'danger',
            label: tx('Nationalité manquante (Voyageur {n})', { n: num }),
            detail: g.name || tx('Nom non renseigné'),
          });
        }
        if (!g.residenceCountry) {
          errs.push({
            code: 'missing_residence',
            severity: 'warn',
            label: tx('Pays de résidence manquant (Voyageur {n})', { n: num }),
            detail: g.name || tx('Nom non renseigné'),
          });
        }
      });
    } else if ((b.status === 'confirmed' || b.status === 'requested') && cin <= today) {
      if (!guests.length) {
        errs.push({
          code: 'unconfirmed_arrival',
          severity: 'info',
          label: tx('Arrivée & fiche en attente'),
          detail: tx('Arrivée prévue le {date}', { date: cin }),
        });
      }
    }

    return errs;
  }

  function cuReceptionSelection() {
    const key = cuStayScope();
    if (!cuReceptionFilters.has(key)) cuReceptionFilters.set(key, { date: '', view: 'arrivals', q: '' });
    return cuReceptionFilters.get(key);
  }
  function cuReceptionBuckets(stays, day, today) {
    const buckets = { arrivals: [], departures: [], inhouse: [], attention: [] };
    stays.forEach((b) => {
      if (!b?.hotel || ['cancelled', 'no_show'].includes(b.status)) return;
      const h = b.hotel;
      if (h.checkIn === day) buckets.arrivals.push(b);
      if (h.checkOut === day) buckets.departures.push(b);
      // This is current presence, not a forecast inferred from booking dates.
      if (b.status === 'checked_in') buckets.inhouse.push(b);
      if ((b.status === 'checked_in' && h.checkOut < today) ||
          (['requested', 'confirmed'].includes(b.status) && h.checkIn < today)) buckets.attention.push(b);
    });
    return buckets;
  }
  function cuReceptionJournal(stays, today) {
    const filter = cuReceptionSelection(), day = filter.date || today;
    const buckets = cuReceptionBuckets(stays, day, today);
    const inhouse = cuInHouseSnapshots.get(cuStayScope());
    if (inhouse) {
      const current = (b) => inhouse.ids.has(b.id) || (+b.updatedAt || 0) > inhouse.startedAt;
      buckets.inhouse = buckets.inhouse.filter(current);
      buckets.attention = buckets.attention.filter((b) => b.status !== 'checked_in' || current(b));
    }
    const views = { arrivals: tx('Arrivées'), departures: tx('Départs'), inhouse: tx('En maison maintenant'), attention: tx('Retards à vérifier') };
    const labels = { requested: tx('Demandée'), confirmed: tx('Confirmée'), checked_in: tx('En maison'), completed: tx('Terminée') };
    const channels = { direct: tx('Direct'), booking: 'Booking.com', expedia: 'Expedia', airbnb: 'Airbnb', walkin: tx('Walk-in'), other: tx('Autre') };
    const normalized = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const q = normalized(filter.q);
    const rooms = Object.values(R());
    const rows = (buckets[filter.view] || buckets.arrivals).filter((b) => {
      const room = rooms.find((r) => r.id === b.resourceId);
      return normalized([b.customer?.name, b.code, b.hotel.externalRef, room?.n, channels[b.hotel.channel]].join(' ')).includes(q);
    }).sort((a, b) => String(a.customer?.name || '').localeCompare(String(b.customer?.name || ''), 'fr'));
    const load = cuStayLoads.get(cuStayScope());
    return `<section class="block hx-daily" aria-label="${tx('Journal de réception')}">
      <div class="hx-daily-head"><div><span class="hx-kicker">${tx('JOURNAL DE RÉCEPTION')}</span><h3>${views[filter.view] || views.arrivals} · ${rows.length}</h3><p>${tx('Dates de séjour à l’heure du Maroc. Ouvrez un dossier pour modifier ses détails.')}</p></div><div class="hx-commercial-tools"><button type="button" class="hx-btn ghost" data-action="hx-commercial">${tx('Clients, agences & sociétés')}</button>${cuHasGroupRecovery() ? `<button type="button" class="hx-btn ghost" data-action="hx-group-resume">${tx('Reprendre le dossier groupe')}</button>` : ''}<button type="button" class="hx-btn ghost" data-action="hx-group-new">+ ${tx('Réservation de groupe')}</button><button type="button" class="hx-btn atlas" data-action="hx-stay-new">+ ${tx('Réservation')}</button></div></div>
      <div class="hx-daily-controls">
        <label>${tx('Date des mouvements')}<input type="date" data-hx-daily-date value="${esc(day)}"></label>
        <label>${tx('Vue')}<select data-hx-daily-view>${Object.entries(views).map(([key, label]) => `<option value="${key}" ${filter.view === key ? 'selected' : ''}>${label} (${buckets[key].length})</option>`).join('')}</select></label>
        <label class="hx-daily-search">${tx('Rechercher')}<input type="search" data-hx-daily-search value="${esc(filter.q)}" placeholder="${tx('Client, chambre, référence')}"></label>
        <button class="hx-btn ghost" data-action="hx-daily-apply">${tx('Afficher')}</button>
        <button class="hx-btn ghost" data-action="hx-daily-refresh" ${load?.loading ? 'disabled' : ''}>${load?.loading ? tx('Actualisation…') : tx('Actualiser')}</button>
      </div>
      ${load?.error ? `<p class="hx-daily-warning" role="status">${esc(tx(load.error))}</p>` : ''}
      ${['inhouse', 'attention'].includes(filter.view) ? `<p class="hx-daily-note">${tx('Cette vue suit les statuts actuels, indépendamment de la date des mouvements choisie.')}</p>` : ''}
      <div class="hx-daily-list">${rows.map((b) => {
        const room = rooms.find((r) => r.id === b.resourceId);
        const who = b.customer?.name || tx('client');
        return `<article class="hx-daily-row"><div class="hx-daily-room">${room ? tx('Ch. {n}', { n: esc(room.n) }) : tx('Non attribuée')}</div><div class="hx-daily-guest"><b>${esc(b.customer?.name || tx('Client'))}</b><span>${esc(b.code || '')} · ${esc(channels[b.hotel.channel] || tx('Autre'))} ${b.hotel.externalRef ? '· ' + esc(b.hotel.externalRef) : ''}</span><span>${esc(cuDay(b.hotel.checkIn))}${hxTo()}${esc(cuDay(b.hotel.checkOut))} · ${esc(txn(b.partySize || 1, 'personne'))} · ${esc(b.hotel.roomTypeName || '')}</span>${b.note ? `<span class="hx-daily-note">${esc(b.note)}</span>` : ''}</div><span class="hx-daily-status">${esc(labels[b.status] || b.status)}</span>${b.status === 'confirmed' && b.hotel.checkIn <= today ? `<button class="hx-btn atlas" data-action="hx-stay-checkin" data-arg="${esc(b.id)}" aria-label="${esc(tx('Enregistrer l’arrivée de {name}', { name: who }))}">${tx('Check-in')}</button>` : ''}${b.status === 'checked_in' && b.hotel.checkOut <= today ? `<button class="hx-btn atlas" data-action="hx-stay-checkout" data-arg="${esc(b.id)}" aria-label="${esc(tx('Enregistrer le départ de {name}', { name: who }))}">${tx('Check-out')}</button>` : ''}${b.status === 'completed' ? `<button class="hx-btn ghost" data-action="hx-stay-reopen" data-arg="${esc(b.id)}" aria-label="${esc(tx('Rouvrir le dossier de {name} pour corriger sa facturation', { name: who }))}">${tx('Rouvrir le dossier')}</button>` : ''}${b.status === 'checked_in' ? `<button class="hx-btn ghost" data-action="hx-stay-undo-checkin" data-arg="${esc(b.id)}" aria-label="${esc(tx('Annuler l’arrivée enregistrée pour {name}', { name: who }))}">${tx('Annuler l’arrivée')}</button>` : ''}${(b.status === 'confirmed' || b.status === 'requested') && b.hotel.checkIn <= today ? `<button class="hx-btn ghost" data-action="hx-stay-noshow" data-arg="${esc(b.id)}" aria-label="${esc(tx('Marquer {name} comme non présenté', { name: who }))}">${tx('Non présenté')}</button>` : ''}<button class="hx-btn ghost" data-action="hx-stay-edit" data-arg="${esc(b.id)}" aria-label="${esc(tx('Ouvrir le dossier {ref}', { ref: b.code || b.customer?.name || tx('client') }))}">${tx('Ouvrir le dossier')}</button></article>`;
      }).join('') || `<p class="hx-empty">${tx('Aucun dossier dans cette vue. Vérifiez la date, les filtres et l’état de l’actualisation.')}</p>`}</div>
      <p class="hx-daily-note">${tx('Les walk-ins encaissés séparément restent accessibles dans le plan des chambres et les folios. Cette liste présente les dossiers de réservation.')}</p>
    </section>`;
  }
  async function cuRefreshReception() {
    const scope = cuStayScope();
    const today = new (globalThis.KiwiZoneLaw?.DateTimeFormat || Intl.DateTimeFormat)('en-CA', { timeZone: 'Africa/Casablanca', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const day = cuReceptionSelection().date || today;
    // An independent status read includes overdue in-house stays outside the selected day.
    const work = Promise.all([cuFetchStaysForWindow(day, day), cuFetchInHouseStays()]);
    if (openDrawer?.page === 'reception') rerender();
    await work;
    if (scope === cuStayScope() && openDrawer?.page === 'reception') rerender();
  }
  async function cuFetchInHouseStays() {
    const slug = window.KiwiStore?.slugFor?.(cuVenueId()) || '';
    if (!slug) return;
    const scope = cuStayScope(), cache = cuStayCache();
    const startedAt = Date.now();
    try {
      const res = await fetch('/api/hotel/stays?merchant=' + encodeURIComponent(slug) + '&status=checked_in', { cache: 'no-store' });
      if (!res.ok) throw new Error('unavailable');
      const data = await res.json();
      if (!Array.isArray(data.stays)) throw new Error('invalid-response');
      data.stays.forEach((s) => { if (s?.id && (+s.updatedAt || 0) >= (+cache.get(s.id)?.updatedAt || 0)) cache.set(s.id, s); });
      if (data.stays.length >= 1000) throw new Error('incomplete');
      const previous = cuInHouseSnapshots.get(scope);
      if (!previous || startedAt >= previous.startedAt) cuInHouseSnapshots.set(scope, { startedAt, ids: new Set(data.stays.map((s) => s.id)) });
    } catch (_) {
      const load = cuStayLoads.get(scope) || {};
      load.error = txk('Liste en maison non vérifiée. Actualisez avant de vous fier aux effectifs.');
      cuStayLoads.set(scope, load);
    }
  }
  function cuReceptionBody() {
    const allStaysMap = cuAllStays();
    const today = new (globalThis.KiwiZoneLaw?.DateTimeFormat || Intl.DateTimeFormat)('en-CA', { timeZone: 'Africa/Casablanca', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

    const activeStays = Array.from(allStaysMap.values()).filter((b) => b.hotel && b.status !== 'cancelled' && b.status !== 'no_show');

    const exceptionsList = [];
    activeStays.forEach((b) => {
      const errs = cuEvaluateStayExceptions(b, today);
      if (errs.length) exceptionsList.push({ booking: b, errs });
    });

    const criticalCount = exceptionsList.filter((x) => x.errs.some((e) => e.severity === 'danger')).length;
    const warningCount = exceptionsList.length - criticalCount;

    let auditCard = '';
    if (exceptionsList.length > 0) {
      const itemsHtml = exceptionsList.slice(0, 6).map(({ booking: b, errs }) => {
        const room = R()[b.resourceId] || Object.values(R()).find((r) => r.id === b.resourceId);
        const roomLabel = room ? tx('Ch. {n}', { n: room.n }) : (b.hotel.roomTypeName || tx('Chambre'));
        const badgesHtml = errs.map((e) => `<span class="hx-exc-badge ${e.severity}" title="${esc(e.detail)}">${esc(e.label)}</span>`).join('');
        return `<div class="hx-exc-row">
          <div>
            <div class="hx-exc-meta"><b>${esc(roomLabel)}</b> · ${esc(b.customer?.name || tx('Client'))} <span>(${cuDay(b.hotel.checkIn)}${hxTo()}${cuDay(b.hotel.checkOut)})</span></div>
            <div class="hx-exc-badges">${badgesHtml}</div>
          </div>
          <button class="hx-btn ghost hx-btn-sm" data-action="hx-stay-edit" data-arg="${esc(b.id)}">${tx('Compléter la fiche')}</button>
        </div>`;
      }).join('');

      auditCard = `<div class="block hx-audit ${criticalCount ? 'danger' : 'warn'}">
        <div class="hx-audit-head">
          <div>
            <span class="hx-kicker hx-audit-kicker ${criticalCount ? 'danger' : 'warn'}">${tx('CONTRÔLE RÉCEPTION · REVUE INTERNE')}</span>
            <h3 class="hx-audit-title">
              ${criticalCount ? tx('{n} à régulariser avant le départ', { n: txn(criticalCount, 'dossier') }) : tx('{n} à compléter', { n: txn(warningCount, 'dossier') })}
            </h3>
            <p class="hx-audit-sub">${tx('Cohérence des fiches voyageurs et des départs. Contrôle interne, sans valeur déclarative.')}</p>
          </div>
          <button class="hx-btn atlas hx-btn-sm" data-action="hx-monthly-closing">${tx('Contrôle mensuel')}</button>
        </div>
        <div class="hx-audit-list">
          ${itemsHtml}
        </div>
      </div>`;
    } else {
      auditCard = `<div class="block hx-audit ok">
        <div class="hx-audit-head">
          <div>
            <span class="hx-kicker hx-audit-kicker ok">${tx('CONTRÔLE RÉCEPTION · REVUE INTERNE')}</span>
            <div class="hx-audit-title">${activeStays.length > 0 ? tx('Dossiers en maison cohérents (0 anomalie bloquante)') : tx('Aucun séjour actif. Le contrôle mensuel reste disponible.')}</div>
          </div>
          <button class="hx-btn ghost hx-btn-sm" data-action="hx-monthly-closing">${tx('Contrôle mensuel')}</button>
        </div>
      </div>`;
    }

    return `<div class="hx-page">
      ${cuStrip()}
      ${auditCard}
      ${cuReceptionJournal(Array.from(allStaysMap.values()), today)}
    </div>`;
  }
  function cuTypes() {
    return Object.values(cuState().roomTypes || {}).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  }
  function cuTypeOptions(selected) {
    return cuTypes().map((t) => `<option value="${esc(t.id)}" ${t.id === selected ? 'selected' : ''}>${esc(t.name)}${t.rate == null ? '' : ' · ' + MAD(t.rate)}</option>`).join('');
  }
  function cuParseRoomNumbers(value) {
    const out = [];
    const seen = new Set();
    String(value || '').split(/[,;\s]+/).filter(Boolean).forEach((part) => {
      const range = part.match(/^(\d{1,4})-(\d{1,4})$/);
      if (range) {
        const a = +range[1], b = +range[2];
        if (a < 1 || b < a || b - a > 99) return;
        for (let n = a; n <= b; n++) if (!seen.has(n)) { seen.add(n); out.push(n); }
      } else if (/^\d{1,4}$/.test(part)) {
        const n = +part;
        if (n > 0 && !seen.has(n)) { seen.add(n); out.push(n); }
      }
    });
    return out.slice(0, 100);
  }
  function cuRoomBatchEditor(prefillFloor) {
    const types = cuTypes();
    const firstType = types[0]?.id || '';
    const floors = cuFloorRows();
    const selectedFloorId = floors.some((f) => f.id === prefillFloor) ? prefillFloor : floors[0]?.id || '';
    const m = K().modal({
      tag: tx('CONFIGURATION RAPIDE'), title: tx('Ajouter plusieurs chambres'),
      desc: tx('Une seule configuration pour tout un étage, une aile ou une catégorie.'), width: 680,
      body: `<div class="hx-batch-intro">
          <span class="hx-batch-mark">01</span>
          <div><b>${tx('Indiquez simplement les numéros.')}</b><span>${tx('Une plage, des numéros séparés, ou les deux.')}</span></div>
          <code dir="ltr">101–108, 110, 112</code>
        </div>
        <div class="hx-room-form hx-room-form-batch">
          <label class="hx-room-form-wide hx-room-number-field"><span>${tx('Numéros des chambres')}</span><input data-hx-room-numbers inputmode="numeric" autocomplete="off" dir="ltr" placeholder="101-108, 110, 112"><small>${tx('Kiwi créera chaque numéro sans doublon.')}</small></label>
          <label><span>${tx('Type de chambre')}</span><select data-hx-room-type-id>${cuTypeOptions(firstType)}</select><small>${tx('Même catégorie et tarif pour ce lot.')}</small></label>
          <label><span>${tx('Étage, aile ou section')}</span><select data-hx-room-floor-id>${floors.map((f) => `<option value="${esc(f.id)}" ${f.id === selectedFloorId ? 'selected' : ''}>${esc(f.name)}</option>`).join('')}</select><small>${tx('Gérez les noms et l’ordre depuis le plan.')}</small></label>
        </div>
        <div class="hx-batch-foot">
          <button class="hx-link-btn" type="button" data-action="hx-room-types">${tx('Gérer les types et tarifs')}</button>
          <button class="hx-btn atlas" type="button" data-action="hx-room-batch-save">${tx('Ajouter les chambres')}</button>
        </div>`,
    });
    m.el.querySelector('.kiwi-modal')?.classList.add('hx-hotel-modal', 'hx-batch-modal');
    openModal = { el: m.el, close: m.close };
  }
  function cuRoomEditor(n) {
    const room = cuState().rooms[+n];
    if (!room) return;
    const liveKey = cuRoomStatus(room).key;
    const locked = liveKey === 'occ' || liveKey === 'arrivee';
    const status = liveKey === 'sale' ? 'sale' : (room.status || 'libre');
    // Same floor only; already-linked rooms stay visible (flagged) so an old
    // cross-floor liaison can be reviewed and removed, never re-added.
    const linkedIds = new Set(room.connectingRoomIds || []);
    const connOptions = Object.values(cuState().rooms || {}).filter((r) => r.n !== room.n).sort((a, b) => a.n - b.n)
      .filter((o) => linkedIds.has(o.id) || cuFloorKey(o) === cuFloorKey(room))
      .map((o) => {
        const otherFloor = cuFloorKey(o) !== cuFloorKey(room);
        return `<option value="${esc(o.id)}" ${linkedIds.has(o.id) ? 'selected' : ''}>${tx('Ch. {n}', { n: o.n })} · ${esc(roomTypeOf(o.n).name)} (${esc(o.floor)})${otherFloor ? ' · ' + tx('autre étage') : ''}</option>`;
      }).join('');
    const m = K().modal({
      tag: tx('CHAMBRE {n}', { n: room.n }), title: tx('Modifier la chambre'),
      desc: tx('Changez uniquement ce qui distingue cette chambre.'), width: 560,
      body: `<div class="hx-room-form">
        <label><span>${tx('Numéro')}</span><input data-hx-room-number type="number" inputmode="numeric" min="1" max="9999" value="${room.n}"></label>
        <label><span>${tx('Type')}</span><select data-hx-room-type-id>${cuTypeOptions(room.typeId)}</select></label>
        <label><span>${tx('Étage / aile')}</span><select data-hx-room-floor-id>${cuFloorRows().map((f) => `<option value="${esc(f.id)}" ${f.id === room.floorId ? 'selected' : ''}>${esc(f.name)}</option>`).join('')}</select></label>
        <label><span>${tx('Vue')}</span><select data-hx-room-view>
          <option value="">${tx('Non spécifiée')}</option>
          ${cuAllViews().map((v) => `<option value="${esc(v)}" ${room.view === v ? 'selected' : ''}>${tx('Vue {v}', { v: esc(cuViewLabel(v)) })}</option>`).join('')}
        </select></label>
        <label><span>${tx('État')}</span><select data-hx-room-status ${locked ? 'disabled' : ''}>
          <option value="libre" ${status === 'libre' ? 'selected' : ''}>${tx('Libre · propre')}</option>
          <option value="sale" ${status === 'sale' ? 'selected' : ''}>${tx('Libre · à nettoyer')}</option>
          <option value="hs" ${status === 'hs' ? 'selected' : ''}>${tx('Hors-service')}</option>
          ${locked ? `<option value="${status}" selected>${status === 'occ' ? tx('Occupée') : status === 'depart' ? tx('Départ du jour') : tx('Arrivée attendue')}</option>` : ''}
        </select>${locked ? `<small>${tx('Le statut du séjour se gère depuis le folio.')}</small>` : ''}</label>
        <div class="hx-room-form-wide">
          <label><span>${tx('Caractéristiques & équipements')}</span>
            <div class="hx-char-checkboxes">
              ${cuAllCharacteristics().map((c) => `<label class="hx-char-label"><input type="checkbox" data-hx-room-char="${c.id}" ${(room.characteristics || []).includes(c.id) ? 'checked' : ''}> ${esc(cuCharLabel(c))}</label>`).join('')}
            </div>
          </label>
        </div>
        <div class="hx-room-form-wide">
          <label><span>${tx('Portes communicantes')} <small>· ${tx('liaison réciproque directe')}</small></span>
            <select data-hx-room-connecting multiple size="3">
              ${connOptions || `<option value="" disabled>${tx('Aucune autre chambre à cet étage')}</option>`}
            </select>
            <small>${tx('Seules les chambres du même étage peuvent être reliées. Maintenu automatiquement dans les deux sens.')}</small>
          </label>
        </div>
      </div>
      <div class="hx-room-form-actions">
        <button class="hx-btn warn" data-action="hx-room-delete-open" data-arg="${room.n}">${tx('Supprimer')}</button>
        <button class="hx-btn atlas" data-action="hx-room-save" data-arg="${room.n}">${tx('Enregistrer')}</button>
      </div>`,
    });
    m.el.querySelector('.kiwi-modal')?.classList.add('hx-hotel-modal');
    openModal = { el: m.el, close: m.close };
  }
  function cuTypesManager() {
    const st = cuState();
    const rows = cuTypes().map((t) => {
      const count = Object.values(st.rooms).filter((r) => r.typeId === t.id).length;
      return `<button class="hx-type-card" type="button" data-action="hx-room-type-edit" data-arg="${esc(t.id)}">
        <span class="hx-type-icon">${esc(t.name.slice(0, 1).toUpperCase())}</span>
        <span class="hx-type-copy"><b>${esc(t.name)}</b><small>${txn(count, 'chambre')}</small></span>
        <span class="hx-type-rate">${t.rate == null ? tx('Tarif général') : MAD(t.rate)}<small>${tx('par nuit')}</small></span>
        <span class="hx-type-arrow">›</span>
      </button>`;
    }).join('');
    const m = K().modal({
      tag: tx('CATÉGORIES'), title: tx('Types de chambres'),
      desc: tx('Vos noms et tarifs maison. Toute modification s’applique aux chambres de ce type.'), width: 620,
      body: `<div class="hx-type-summary"><span>${cuTypes().length}</span><div><b>${tx('Catégories actives')}</b><small>${tx('Un seul réglage met à jour toutes les chambres concernées.')}</small></div></div>
        <div class="hx-type-list">${rows}</div>
        <button class="hx-type-add" type="button" data-action="hx-room-type-new">+ ${tx('Créer un type de chambre')}</button>`,
    });
    m.el.querySelector('.kiwi-modal')?.classList.add('hx-hotel-modal', 'hx-types-modal');
    openModal = { el: m.el, close: m.close };
  }
  function cuPhotoEditorMarkup(photos) {
    return photos.length ? photos.map((p, i) => `<div class="hx-type-photo"><img src="${esc(p.url)}" alt="${esc(p.alt || '')}"><span>${i === 0 ? tx('PHOTO PRINCIPALE') : ltr((i + 1) + ' / ' + photos.length)}</span><div><button type="button" data-action="hx-type-photo-move" data-arg="${i}:-1" ${i === 0 ? 'disabled' : ''} aria-label="${tx('Déplacer avant')}">←</button><button type="button" data-action="hx-type-photo-move" data-arg="${i}:1" ${i === photos.length - 1 ? 'disabled' : ''} aria-label="${tx('Déplacer après')}">→</button><button type="button" data-action="hx-type-photo-remove" data-arg="${i}" aria-label="${tx('Retirer la photo')}">×</button></div></div>`).join('') : `<div class="hx-type-photo-empty"><b>${tx('Aucune photo')}</b><span>${tx('Le visuel Kiwi reste affiché tant que vous n’ajoutez rien.')}</span></div>`;
  }
  function cuRenderPhotoEditor(root) {
    const host = root?.querySelector('[data-hx-type-photos]');
    if (host) host.innerHTML = cuPhotoEditorMarkup(root.__hxPhotos || []);
    const add = root?.querySelector('[data-action="hx-type-photo-pick"]');
    if (add) add.disabled = (root.__hxPhotos || []).length >= 8;
  }
  function cuShrinkHotelPhoto(file) {
    if (!file || !/^image\/(jpeg|png|webp|avif)$/i.test(file.type || '') || file.size < 900 * 1024 || typeof createImageBitmap !== 'function') return Promise.resolve(file);
    return createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => createImageBitmap(file)).then((image) => {
      const scale = Math.min(1, 1800 / Math.max(image.width, image.height));
      const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(image.width * scale)); canvas.height = Math.max(1, Math.round(image.height * scale));
      const ctx = canvas.getContext('2d'); if (!ctx) return file;
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height); try { image.close(); } catch (_) {}
      return new Promise((resolve) => canvas.toBlob((blob) => {
        if (!blob || blob.size >= file.size) return resolve(file);
        const name = String(file.name || 'chambre').replace(/\.[a-z0-9]{1,6}$/i, '') + '.jpg';
        try { resolve(new File([blob], name, { type: 'image/jpeg', lastModified: Date.now() })); } catch (_) { resolve(blob); }
      }, 'image/jpeg', .84));
    }).catch(() => file);
  }
  async function cuUploadTypePhotos(root, files) {
    const status = root?.querySelector('[data-hx-type-photo-status]'), typeName = String(root?.querySelector('[data-hx-type-name]')?.value || 'Chambre').trim() || 'Chambre';
    const queue = Array.from(files || []).filter((f) => /^image\/(jpeg|png|webp|gif|avif)$/i.test(f.type || '')).slice(0, Math.max(0, 8 - (root.__hxPhotos || []).length));
    if (!queue.length) { if (status) status.textContent = tx('Choisissez une image JPG, PNG, WebP, GIF ou AVIF.'); return; }
    const uploader = window.KiwiPlatformOps?.uploads;
    if (!uploader?.upload) { if (status) status.textContent = tx('Le stockage photo n’est pas disponible sur cet appareil.'); return; }
    for (let i = 0; i < queue.length; i++) {
      if (status) status.textContent = tx('Préparation de la photo {i} / {n}…', { i: i + 1, n: queue.length });
      try {
        const ready = await cuShrinkHotelPhoto(queue[i]);
        const uploaded = await uploader.upload(ready, { merchant: window.KiwiStore?.slugFor?.(cuVenueId()) || '', scope: 'hotel-room', progress: (pct) => { if (status) status.textContent = tx('Envoi {i} / {n} · {pct} %', { i: i + 1, n: queue.length, pct }); } });
        const photo = cuSafePhoto({ url: uploaded.url, alt: typeName + ' · photo ' + ((root.__hxPhotos || []).length + 1), updatedAt: cuStamp() }, (root.__hxPhotos || []).length, typeName);
        if (photo) root.__hxPhotos.push(photo);
        cuRenderPhotoEditor(root);
      } catch (error) {
        const code = error?.code || error?.message;
        if (status) status.textContent = code === 'too-large' ? tx('Photo trop lourde même après compression.') : code === 'bad-type' ? tx('Format photo non accepté.') : tx('Envoi interrompu. Les autres photos restent intactes.');
        return;
      }
    }
    if (status) status.textContent = tx(queue.length > 1 ? '{n} ajoutées · enregistrez le type pour publier.' : '{n} ajoutée · enregistrez le type pour publier.', { n: txn(queue.length, 'photo') });
  }
  function cuTypeEditor(id) {
    const type = id ? cuState().roomTypes[id] : null;
    const amenities = (type?.amenities || []).join(', ');
    const m = K().modal({
      tag: type ? tx('TYPE DE CHAMBRE') : tx('NOUVEAU TYPE'),
      title: type ? tx('Modifier « {name} »', { name: esc(type.name) }) : tx('Créer un type'),
      desc: tx('Décrivez ce que le client verra sur votre lien de réservation.'), width: 680,
      body: `<div class="hx-room-form hx-type-form">
        <label class="hx-room-form-wide"><span>${tx('Nom affiché')}</span><input data-hx-type-name maxlength="60" value="${esc(type?.name || '')}" placeholder="${tx('Ex. Suite Atlas')}"></label>
        <label class="hx-room-form-wide"><span>${tx('Tarif par nuit')} <small>· MAD · ${tx('optionnel')}</small></span><input data-hx-type-rate type="number" inputmode="decimal" min="0" step="1" value="${type?.rate == null ? '' : type.rate}" placeholder="${tx('Utiliser le tarif général')}"></label>
        <div class="hx-room-form-wide"><span style="font-size:12px;font-weight:600;">${tx('Suppléments repas')} <small style="font-weight:400;">· ${tx('MAD par personne et par nuit · optionnel · servent aux voyageurs sans compte commercial')}</small></span>
          <div class="hx-room-form hx-type-form" style="margin-top:6px;">
            <label><span>${tx('Petit-déjeuner')}</span><input data-hx-type-board-bb type="number" inputmode="decimal" min="0" step="1" value="${type?.boardRates?.bb ?? ''}" placeholder="·"></label>
            <label><span>${tx('Demi-pension · déjeuner')}</span><input data-hx-type-board-hb_lunch type="number" inputmode="decimal" min="0" step="1" value="${type?.boardRates?.hb_lunch ?? ''}" placeholder="·"></label>
            <label><span>${tx('Demi-pension · dîner')}</span><input data-hx-type-board-hb_dinner type="number" inputmode="decimal" min="0" step="1" value="${type?.boardRates?.hb_dinner ?? ''}" placeholder="·"></label>
            <label><span>${tx('Pension complète')}</span><input data-hx-type-board-full_board type="number" inputmode="decimal" min="0" step="1" value="${type?.boardRates?.full_board ?? ''}" placeholder="·"></label>
          </div>
        </div>
        <label class="hx-room-form-wide"><span>${tx('Description publique')}</span><textarea data-hx-type-description maxlength="300" rows="3" placeholder="${tx('Une chambre calme et lumineuse, idéale pour…')}">${esc(type?.description || '')}</textarea></label>
        <label><span>${tx('Voyageurs maximum')}</span><input data-hx-type-guests type="number" inputmode="numeric" min="1" max="12" value="${type?.maxGuests || 2}"></label>
        <label><span>${tx('Couchage')}</span><input data-hx-type-beds maxlength="80" value="${esc(type?.beds || '')}" placeholder="${tx('1 grand lit')}"></label>
        <label><span>${tx('Surface')} <small>· m²</small></span><input data-hx-type-size type="number" inputmode="numeric" min="1" max="999" value="${type?.sizeM2 || ''}" placeholder="24"></label>
        <label><span>${tx('Vue')}</span><input data-hx-type-view maxlength="80" value="${esc(type?.view || '')}" placeholder="${tx('Patio, médina, montagne…')}"></label>
        <label class="hx-room-form-wide"><span>${tx('Équipements')} <small>· ${tx('séparés par des virgules')}</small></span><input data-hx-type-amenities maxlength="500" value="${esc(amenities)}" placeholder="${tx('Wi-Fi, climatisation, petit-déjeuner')}"></label>
        <section class="hx-type-photos hx-room-form-wide"><div class="hx-type-photos-head"><div><b>${tx('Galerie publique')}</b><span>${tx('8 photos maximum · la première devient la couverture')}</span></div><button class="hx-btn ghost" type="button" data-action="hx-type-photo-pick">+ ${tx('Ajouter des photos')}</button><input data-hx-type-photo-input type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" multiple hidden></div><div class="hx-type-photo-grid" data-hx-type-photos></div><p data-hx-type-photo-status></p></section>
        <label class="hx-room-form-wide"><span><input data-hx-type-public type="checkbox" ${type?.public === false ? '' : 'checked'}> ${tx('Visible sur le lien de réservation')}</span></label>
      </div>
      <div class="hx-room-form-actions">
        ${type ? `<button class="hx-btn warn" data-action="hx-room-type-delete" data-arg="${esc(type.id)}">${tx('Supprimer')}</button>` : '<span></span>'}
        <button class="hx-btn atlas" data-action="hx-room-type-save" data-arg="${esc(type?.id || 'new')}">${tx('Enregistrer')}</button>
      </div>`,
    });
    m.el.querySelector('.kiwi-modal')?.classList.add('hx-hotel-modal');
    const root = m.el.querySelector('.kiwi-modal');
    root.__hxPhotos = (type?.photos || []).map((p) => ({ ...p }));
    cuRenderPhotoEditor(root);
    root.querySelector('[data-hx-type-photo-input]')?.addEventListener('change', (e) => { cuUploadTypePhotos(root, e.target.files); e.target.value = ''; });
    openModal = { el: m.el, close: m.close };
  }
  function cuFloorRows() {
    return Object.values(cuState().floors || {}).sort((a, b) => (+a.order || 0) - (+b.order || 0) || a.name.localeCompare(b.name, 'fr'));
  }
  function cuFloorsManager() {
    const st = cuState();
    const rows = cuFloorRows().map((f, index, list) => {
      const count = Object.values(st.rooms).filter((r) => r.floorId === f.id).length;
      return `<div class="hx-floor-manager-row">
        <span class="hx-floor-manager-grip">⋮⋮</span>
        <span class="hx-floor-manager-copy"><b>${esc(f.name)}</b><small>${txn(count, 'chambre')}</small></span>
        <span class="hx-floor-manager-order">
          <button data-action="hx-floor-move" data-arg="${esc(f.id)}:-1" ${index === 0 ? 'disabled' : ''} aria-label="${tx('Monter')}">↑</button>
          <button data-action="hx-floor-move" data-arg="${esc(f.id)}:1" ${index === list.length - 1 ? 'disabled' : ''} aria-label="${tx('Descendre')}">↓</button>
        </span>
        <button class="hx-floor-manager-edit" data-action="hx-floor-edit" data-arg="${esc(f.id)}">${tx('Modifier')}</button>
      </div>`;
    }).join('');
    const m = K().modal({
      tag: tx('ORGANISATION'), title: tx('Étages, ailes & sections'),
      desc: tx('Renommez, réordonnez ou supprimez vos sections sans perdre les chambres.'), width: 620,
      body: `<div class="hx-floor-manager-list">${rows || `<p>${tx('Aucune section.')}</p>`}</div>
        <div style="display:flex;gap:10px;margin-top:12px;flex-wrap:wrap;">
          <button class="hx-type-add" type="button" data-action="hx-floor-new">+ ${trL({ fr: 'Créer une section', en: 'Create section', ar: 'إنشاء قسم' })}</button>
        </div>`,
    });
    m.el.querySelector('.kiwi-modal')?.classList.add('hx-hotel-modal', 'hx-floors-modal');
    openModal = { el: m.el, close: m.close };
  }
  function cuViewsAndCharsManager() {
    const st = cuState();
    const views = cuAllViews();
    const customs = Array.isArray(st.customCharacteristics) ? st.customCharacteristics : [];

    const m = K().modal({
      tag: tx('CONFIGURATION'),
      title: trL({ fr: 'Vues & caractéristiques', en: 'Views & amenities', ar: 'الإطلالات والمميزات' }),
      desc: trL({
        fr: 'Personnalisez les types de vues et les équipements proposés pour vos chambres.',
        en: 'Customize view types and amenities offered for your rooms.',
        ar: 'تخصيص أنواع الإطلالات والمميزات المتوفرة لغرفك.',
      }),
      width: 720,
      body: `<div class="hx-attribute-settings">
        <div class="hx-attribute-panel" role="group" aria-label="${trL({ fr: 'Types de vues', en: 'View types', ar: 'أنواع الإطلالات' })}">
          <div class="hx-attribute-head">
            <span class="hx-attribute-icon" aria-hidden="true">◌</span>
            <div><b>${trL({ fr: 'Types de vues', en: 'View types', ar: 'أنواع الإطلالات' })}</b><small>${trL({ fr: 'Décrivez ce que le voyageur voit depuis la chambre.', en: 'Describe what guests see from the room.', ar: 'صف ما يراه الضيف من الغرفة.' })}</small></div>
            <span class="hx-attribute-count">${views.length}</span>
          </div>
          <div class="hx-views-config-list">
            ${views.map((v) => `
              <span class="hx-view-config-chip">
                <span>${trL({ fr: 'Vue', en: 'View', ar: 'إطلالة' })} ${esc(cuViewLabel(v))}</span>
                <button type="button" data-action="hx-view-remove" data-arg="${esc(v)}" aria-label="${trL({ fr: 'Supprimer', en: 'Delete', ar: 'حذف' })}">×</button>
              </span>`).join('')}
          </div>
          <div class="hx-attribute-add">
            <label><span>${trL({ fr: 'Nouvelle vue', en: 'New view', ar: 'إطلالة جديدة' })}</span><input data-hx-view-input type="text" maxlength="40" placeholder="${trL({ fr: 'Ex. Piscine intérieure, Montagne…', en: 'e.g. Mountain, Courtyard…', ar: 'مثال: جبل، فناء…' })}"></label>
            <button class="hx-btn atlas" type="button" data-action="hx-view-add">${trL({ fr: '+ Ajouter une vue', en: '+ Add view', ar: '+ إضافة إطلالة' })}</button>
          </div>
        </div>
        <div class="hx-attribute-panel" role="group" aria-label="${trL({ fr: 'Équipements personnalisés', en: 'Custom amenities', ar: 'تجهيزات مخصصة' })}">
          <div class="hx-attribute-head">
            <span class="hx-attribute-icon" aria-hidden="true">◇</span>
            <div><b>${trL({ fr: 'Équipements personnalisés', en: 'Custom amenities', ar: 'تجهيزات مخصصة' })}</b><small>${trL({ fr: 'Ajoutez uniquement les équipements propres à votre établissement.', en: 'Add amenities specific to your property.', ar: 'أضف التجهيزات الخاصة بمنشأتك.' })}</small></div>
            <span class="hx-attribute-count">${customs.length}</span>
          </div>
          <div class="hx-attribute-list">
            ${customs.length ? customs.map((c) => `
              <div class="hx-config-char-row">
                <span><b>${esc(cuCharLabel(c))}</b></span>
                <button type="button" data-action="hx-char-remove" data-arg="${esc(c.id)}">${trL({ fr: 'Supprimer', en: 'Delete', ar: 'حذف' })}</button>
              </div>`).join('') : `<div class="hx-attribute-empty">${trL({ fr: 'Aucun équipement personnalisé. Les 8 équipements standards restent disponibles.', en: 'No custom amenities. The 8 standard amenities remain available.', ar: 'لا توجد تجهيزات مخصصة. التجهيزات الأساسية الثمانية تبقى متوفرة.' })}</div>`}
          </div>
          <div class="hx-attribute-add">
            <label><span>${trL({ fr: 'Nouvel équipement', en: 'New amenity', ar: 'تجهيز جديد' })}</span><input data-hx-char-input type="text" maxlength="50" placeholder="${trL({ fr: 'Ex. Jacuzzi privatif, Machine Nespresso…', en: 'e.g. Private hot tub, Espresso machine…', ar: 'مثال: جاكوزي خاص، آلة قهوة…' })}"></label>
            <button class="hx-btn atlas" type="button" data-action="hx-char-add">${trL({ fr: '+ Ajouter un équipement', en: '+ Add amenity', ar: '+ إضافة ميزة' })}</button>
          </div>
        </div>
      </div>
      <div class="hx-room-form-actions hx-attribute-footer">
        <button class="hx-btn ghost" data-action="hx-views-manage-close">${trL({ fr: 'Fermer', en: 'Close', ar: 'إغلاق' })}</button>
      </div>`,
    });
    m.el.querySelector('.kiwi-modal')?.classList.add('hx-hotel-modal', 'hx-attributes-modal');
    openModal = { el: m.el, close: m.close };
  }
  function cuUpdateFloorsManagerModal() {
    if (typeof document === 'undefined' || !document.querySelector) return;
    const listEl = document.querySelector('.hx-floors-modal .hx-floor-manager-list');
    if (!listEl) return;
    const st = cuState();
    const rows = cuFloorRows().map((f, index, list) => {
      const count = Object.values(st.rooms).filter((r) => r.floorId === f.id).length;
      return `<div class="hx-floor-manager-row">
        <span class="hx-floor-manager-grip">⋮⋮</span>
        <span class="hx-floor-manager-copy"><b>${esc(f.name)}</b><small>${txn(count, 'chambre')}</small></span>
        <span class="hx-floor-manager-order">
          <button data-action="hx-floor-move" data-arg="${esc(f.id)}:-1" ${index === 0 ? 'disabled' : ''} aria-label="${tx('Monter')}">↑</button>
          <button data-action="hx-floor-move" data-arg="${esc(f.id)}:1" ${index === list.length - 1 ? 'disabled' : ''} aria-label="${tx('Descendre')}">↓</button>
        </span>
        <button class="hx-floor-manager-edit" data-action="hx-floor-edit" data-arg="${esc(f.id)}">${tx('Modifier')}</button>
      </div>`;
    }).join('');
    listEl.innerHTML = rows || `<p>${tx('Aucune section.')}</p>`;
  }
  function cuRefreshFloorSelectors() {
    if (typeof document === 'undefined' || !document.querySelectorAll) return;
    const floors = cuFloorRows();
    document.querySelectorAll('select[data-hx-room-floor-id], select[data-hx-bulk-floor-id]').forEach((sel) => {
      const currentVal = sel.value;
      const isBulk = sel.hasAttribute('data-hx-bulk-floor-id');
      const prefix = isBulk ? `<option value="">${tx('Ne pas modifier')}</option>` : '';
      sel.innerHTML = prefix + floors.map((f) => `<option value="${esc(f.id)}" ${f.id === currentVal ? 'selected' : ''}>${esc(f.name)}</option>`).join('');
      if (currentVal && floors.some((f) => f.id === currentVal)) {
        sel.value = currentVal;
      }
    });
  }
  function cuFloorEditor(id) {
    const st = cuState();
    const floor = id ? st.floors[id] : null;
    const others = cuFloorRows().filter((f) => f.id !== id);
    const count = floor ? Object.values(st.rooms).filter((r) => r.floorId === id).length : 0;
    const m = K().modal({
      tag: floor ? tx('SECTION') : tx('NOUVELLE SECTION'), title: floor ? tx('Modifier « {name} »', { name: esc(floor.name) }) : tx('Créer une section'),
      desc: floor ? tx('{n} dans cette section.', { n: txn(count, 'chambre') }) : tx('Ex. 1er étage, Patio, Aile Atlas…'), width: 500,
      body: `<div class="hx-room-form"><label class="hx-room-form-wide"><span>${tx('Nom affiché')}</span><input data-hx-floor-name maxlength="60" value="${esc(floor?.name || '')}" placeholder="${tx('Ex. 1er étage')}"></label></div>
        <p class="hx-floor-error" data-hx-floor-error style="color:var(--danger,#b91c1c);font-size:12px;margin:8px 0 0;" hidden></p>
        ${floor && count && others.length ? `<label class="hx-floor-delete-target"><span>${tx('En cas de suppression, déplacer les chambres vers')}</span><select data-hx-floor-target>${others.map((f) => `<option value="${esc(f.id)}">${esc(f.name)}</option>`).join('')}</select></label>` : ''}
        <div class="hx-room-form-actions">
          ${floor ? `<button class="hx-btn warn" data-action="hx-floor-delete" data-arg="${esc(floor.id)}" ${count && !others.length ? `disabled title="${tx('Créez une autre section avant de supprimer celle-ci')}"` : ''}>${tx('Supprimer')}</button>` : '<span></span>'}
          <button class="hx-btn atlas" data-action="hx-floor-save" data-arg="${esc(floor?.id || 'new')}">${tx('Enregistrer')}</button>
        </div>`,
    });
    m.el.querySelector('.kiwi-modal')?.classList.add('hx-hotel-modal');
    openModal = { el: m.el, close: m.close };
  }
  function cuFloors() {
    const st = cuState();
    return cuFloorRows().map((f) => ({ id: f.id, lbl: f.name, rooms: Object.keys(st.rooms).map(Number).filter((n) => st.rooms[n].floorId === f.id).sort((a, b) => a - b) }));
  }
  /* « 2026-10-11 » est une clé, pas du texte pour un réceptionniste : on écrit
   * « dim. 11/10 », comme les autres pages. */
  function cuDay(ymd) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || ''));
    if (!m) return String(ymd || '');
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12));
    return HX_WEEKDAYS[hxLang()][d.getUTCDay()] + ' ' + m[3] + '/' + m[2];
  }
  const HX_WEEKDAYS = {
    fr: ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'],
    en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    ar: ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'],
  };
  function cuToday() {
    return new (globalThis.KiwiZoneLaw?.DateTimeFormat || Intl.DateTimeFormat)('en-CA', { timeZone: 'Africa/Casablanca', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  }
  /* Qui occupe réellement chaque chambre, d'après les séjours.
   *
   * Le document « chambres » ne porte que l'état ménage : personne ne le
   * repasse en « occ » quand un client arrive. Le plan affichait donc
   * « Libre · propre » sur une chambre habitée, et lui proposait même
   * « Vendre ce soir · walk-in » — revendre une chambre déjà occupée. La
   * présence vient des séjours ; le document ne décide plus que de la
   * propreté et du hors-service. */
  function cuRoomOccupancy() {
    const stays = cuAllStays();
    /* Le cache se périme tout seul : se fier au seul `rerender()` rendrait la
     * réponse fausse pour tout appel fait entre deux peintures. */
    let freshest = 0;
    stays.forEach((b) => { const u = +b?.updatedAt || 0; if (u > freshest) freshest = u; });
    const signature = cuStayScope() + ':' + stays.size + ':' + freshest;
    if (cuOccupancyMemo && cuOccupancyMemo.signature === signature) return cuOccupancyMemo.map;
    const today = cuToday();
    const map = new Map();
    const completed = new Map();
    stays.forEach((b) => {
      if (!b?.hotel || !b.resourceId) return;
      if (b.status === 'completed') {
        const stamp = +b.updatedAt || 0;
        if (stamp > (completed.get(b.resourceId) || 0)) completed.set(b.resourceId, stamp);
      }
      if (['cancelled', 'no_show', 'completed'].includes(b.status)) return;
      const cin = b.hotel.checkIn, cout = b.hotel.checkOut;
      if (!cin || !cout) return;
      if (b.status === 'checked_in' && cin <= today && today <= cout) {
        map.set(b.resourceId, { kind: cout === today ? 'depart' : 'occ', stay: b });
        return;
      }
      // Une arrivée attendue ne masque jamais un client déjà présent.
      if (b.status === 'confirmed' && cin === today && !map.has(b.resourceId)) {
        map.set(b.resourceId, { kind: 'arrivee', stay: b });
      }
    });
    cuOccupancyMemo = { signature, map, completed };
    return map;
  }
  function cuRoomLive(room) {
    // La maquette de démonstration porte déjà ses statuts en dur.
    if (!room || !room.id || !isCustomHotel()) return null;
    try { return cuRoomOccupancy().get(room.id) || null; } catch (_) { return null; }
  }
  function cuRoomStatus(room) {
    // Hors-service l'emporte : une chambre condamnée ne se vend pas, même
    // si un dossier la désigne encore.
    if (room.status === 'hs') return { key: 'hs', label: tx('Hors-service') };
    const live = cuRoomLive(room);
    if (live) {
      if (live.kind === 'depart') return { key: 'occ', label: tx('Départ aujourd’hui') };
      if (live.kind === 'occ') return { key: 'occ', label: tx('Occupée') };
    }
    // A completed stay is the authoritative checkout event. Until the room
    // document is saved *after* that event as clean, it belongs in the
    // housekeeping queue, even if its old manual status still says occupied.
    const lastCheckout = isCustomHotel() && room.id ? (cuOccupancyMemo?.completed?.get(room.id) || 0) : 0;
    if (lastCheckout > (+room.updatedAt || 0) || room.status === 'sale') return { key: 'sale', label: tx('À nettoyer') };
    if (live) return { key: 'arrivee', label: tx('Arrivée attendue') };
    if (room.status === 'occ') return { key: 'occ', label: tx('Occupée') };
    if (room.status === 'depart') return { key: 'occ', label: tx('Départ aujourd’hui') };
    if (room.status === 'arrivee') return { key: 'arrivee', label: tx('Arrivée attendue') };
    if (room.status === 'sale') return { key: 'sale', label: tx('À nettoyer') };
    return { key: 'libre', label: tx('Libre · propre') };
  }
  /* Les chambres vendues CETTE NUIT. « Occupation ce soir » comptait les
   * chambres dont l'état était « occupée », départs du jour compris : un client
   * qui part ce matin comptait pour ce soir, et une arrivée attendue ce soir
   * (déjà vendue) n'était pas comptée. Une nuit vendue, c'est un séjour qui
   * couvre la nuit d'aujourd'hui (arrivée <= aujourd'hui < départ), confirmé ou
   * en maison, comme la bande de l'Accueil (/api/hotel/performance) et la
   * Production mensuelle. Les ventes « walk-in » du plan n'ont pas de séjour :
   * leur chambre est marquée occupée dans le document des chambres, on la
   * compte une fois si aucun séjour ne la couvre déjà. */
  function cuStaysKnown() {
    const load = cuStayLoads.get(cuStayScope());
    return cuWarmState.at > 0 || !!(load && !load.loading && !load.error);
  }
  /* Un walk-in est un séjour comme un autre : il entre au registre
   * (/api/hotel/stays), d'où la bande de l'Accueil, la Production et le plan
   * tirent les nuitées. Avant, il ne vivait que dans le folio de la caisse et
   * /api/hotel/performance ne le voyait jamais. La référence est stable : un
   * envoi perdu se rejoue sans créer un second séjour. Échec ou délai : null,
   * la vente se fait quand même (le plan compte la chambre occupée). */
  async function cuRegisterWalkin(n, guest, clientRef) {
    const slug = cuMerchantSlug();
    const r = R()[n];
    if (!slug || !r || !r.id || !r.typeId || typeof fetch !== 'function') return null;
    const today = cuToday();
    const next = new Date(today + 'T12:00:00Z'); next.setUTCDate(next.getUTCDate() + 1);
    const body = { action: 'save', merchant: slug, clientRef: String(clientRef).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80),
      roomTypeId: r.typeId, resourceId: r.id, checkIn: today, checkOut: next.toISOString().slice(0, 10),
      partySize: 1, channel: 'walkin', status: 'checked_in', customer: { name: guest } };
    try {
      const ctl = typeof AbortController === 'function' ? new AbortController() : null;
      const timer = ctl ? setTimeout(() => ctl.abort(), 8000) : null;
      const res = await fetch('/api/hotel/stays', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctl ? ctl.signal : undefined });
      if (timer) clearTimeout(timer);
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.booking) return null;
      try { cuStayCache().set(data.booking.id, data.booking); } catch (_) {}
      cuStaysChanged();
      return data.booking;
    } catch (_) { return null; }
  }
  async function cuStayStatus(id, status, force = false) {
    const slug = cuMerchantSlug();
    if (!slug || !id) return false;
    try {
      const res = await fetch('/api/hotel/stays', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'status', merchant: slug, id, status, force }) });
      const data = await res.json().catch(() => ({}));
      if (cuMerchantSlug() !== slug) return false;
      if (res.status === 409 && data.error === 'stay-unpaid' && !force && confirm(tx('Il reste {amount} MAD à régler. Confirmer le départ avec ce solde impayé ?', { amount: cuDraftMoney(data.owedCents) }))) return cuStayStatus(id, status, true);
      if (res.ok && data.booking) { try { cuStayCache().set(data.booking.id, data.booking); } catch (_) {} cuStaysChanged(); return true; }
    } catch (_) {}
    return false;
  }
  /* Le règlement du walk-in a échoué après son inscription : le séjour est
     défait par le chemin tracé (en maison → confirmé → annulé), jamais effacé. */
  async function cuStayCancel(id) {
    const slug = cuMerchantSlug();
    if (!slug || !id) return false;
    await cuStayStatus(id, 'confirmed');
    try {
      const res = await fetch('/api/hotel/stays', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'cancel', merchant: slug, id }) });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.booking) { try { cuStayCache().set(data.booking.id, data.booking); } catch (_) {} cuStaysChanged(); return true; }
    } catch (_) {}
    return false;
  }
  function cuTonight() {
    const today = cuToday();
    const rooms = Object.values(R() || {}).filter((r) => r && r.id);
    const covered = new Set();
    let sold = 0;
    cuAllStays().forEach((b) => {
      const h = b && b.hotel;
      if (!h || h.dayUse === true || !['confirmed', 'checked_in'].includes(b.status)) return;
      if (h.checkIn <= today && today < h.checkOut) { sold++; if (b.resourceId) covered.add(b.resourceId); }
    });
    rooms.forEach((r) => { if (r.status === 'occ' && !covered.has(r.id)) sold++; });
    return { sold, total: rooms.length, known: cuStaysKnown() };
  }
  /* La bande « Accueil » et « Intelligence hôtel » lisent les mêmes séjours que
   * le plan, mais ne passent pas par lui : une réservation prise, un départ
   * encaissé doivent les atteindre sans recharger la page. */
  function cuStaysChanged() {
    try { window.dispatchEvent(new CustomEvent('kiwi-hotel-stays-changed')); } catch (_) {}
  }
  /* Ménage vu de l'Accueil : mêmes règles que le plan (cuRoomStatus), donc le
   * même nombre que « À nettoyer » sur le plan des chambres. */
  function cuHousekeeping() { return window.__kiwiHotelInternal.part('housekeeping').cuHousekeeping.apply(this, arguments); }
  /* « À nettoyer » dépend des départs terminés, qui ne sont dans le cache de
   * séjours qu'après une visite du plan ou de la réception. L'Accueil les
   * charge lui-même (60 jours en arrière, demain en avant), au plus une fois
   * par 30 s, puis prévient la bande. */
  const cuWarmState = { at: 0, loading: false };
  function cuWarmStays() {
    if (!isCustomHotel() || cuWarmState.loading || Date.now() - cuWarmState.at < 30000) return;
    cuWarmState.loading = true;
    const day = (n) => new (globalThis.KiwiZoneLaw?.DateTimeFormat || Intl.DateTimeFormat)('en-CA', { timeZone: 'Africa/Casablanca', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(Date.now() + n * 86400000));
    cuFetchStaysForWindow(day(-60), day(1)).finally(() => {
      cuWarmState.loading = false; cuWarmState.at = Date.now();
      try { window.dispatchEvent(new CustomEvent('kiwi-hotel-stays-loaded')); } catch (_) {}
    });
  }
  function cuResetRackFilter() {
    cuRackFilter.floor = 'all';
    cuRackFilter.floors.clear();
    cuRackFilter.categories.clear();
    cuRackFilter.status = 'all';
    cuRackFilter.hasView = false;
    cuRackFilter.views.clear();
    cuRackFilter.characteristics.clear();
    cuRackFilter.connectingOnly = false;
    cuRackFilter.minCapacity = 0;
    cuRackFilter.q = '';
  }
  function cuEnsureFilterVenue() {
    const v = cuStateId();
    if (cuCurrentFilterVenue !== v) {
      cuCurrentFilterVenue = v;
      cuResetRackFilter();
      cuSelectedRooms.clear();
      cuSelectionMode = false;
      cuBulkPlan = null;
      cuBulkStaged = null;
    }
  }
  function cuLinkConnectingRooms(st, roomA, roomB) {
    if (!roomA || !roomB || roomA.id === roomB.id) return;
    const now = cuStamp();
    if (!Array.isArray(roomA.connectingRoomIds)) roomA.connectingRoomIds = [];
    if (!Array.isArray(roomB.connectingRoomIds)) roomB.connectingRoomIds = [];
    if (!roomA.connectingRoomIds.includes(roomB.id)) roomA.connectingRoomIds.push(roomB.id);
    if (!roomB.connectingRoomIds.includes(roomA.id)) roomB.connectingRoomIds.push(roomA.id);
    roomA.connectingMeta = { ...(roomA.connectingMeta || {}) };
    roomB.connectingMeta = { ...(roomB.connectingMeta || {}) };
    roomA.connectingMeta[roomB.id] = { at: now, linked: true };
    roomB.connectingMeta[roomA.id] = { at: now, linked: true };
    roomA.updatedAt = now;
    roomB.updatedAt = now;
  }
  function cuUnlinkConnectingRooms(st, roomA, roomB) {
    if (!roomA || !roomB) return;
    const now = cuStamp();
    if (Array.isArray(roomA.connectingRoomIds)) {
      roomA.connectingRoomIds = roomA.connectingRoomIds.filter((id) => id !== roomB.id);
    }
    if (Array.isArray(roomB.connectingRoomIds)) {
      roomB.connectingRoomIds = roomB.connectingRoomIds.filter((id) => id !== roomA.id);
    }
    roomA.connectingMeta = { ...(roomA.connectingMeta || {}) };
    roomB.connectingMeta = { ...(roomB.connectingMeta || {}) };
    roomA.connectingMeta[roomB.id] = { at: now, linked: false };
    roomB.connectingMeta[roomA.id] = { at: now, linked: false };
    roomA.updatedAt = now;
    roomB.updatedAt = now;
  }
  function cuSetConnectingRooms(st, targetRoom, targetConnectingIds) {
    if (!targetRoom) return;
    const now = cuStamp();
    const targetId = String(targetRoom.id);
    const newSet = new Set((targetConnectingIds || []).map(String).filter((id) => id && id !== targetId));
    const currentSet = new Set((targetRoom.connectingRoomIds || []).map(String));
    const allRooms = Object.values(st.rooms || {});

    targetRoom.connectingMeta = { ...(targetRoom.connectingMeta || {}) };

    for (const cid of currentSet) {
      if (!newSet.has(cid)) {
        targetRoom.connectingMeta[cid] = { at: now, linked: false };
        const other = allRooms.find((r) => String(r.id) === cid);
        if (other) {
          if (Array.isArray(other.connectingRoomIds)) {
            other.connectingRoomIds = other.connectingRoomIds.filter((id) => String(id) !== targetId);
          }
          other.connectingMeta = { ...(other.connectingMeta || {}) };
          other.connectingMeta[targetId] = { at: now, linked: false };
          other.updatedAt = now;
        }
      }
    }
    for (const cid of newSet) {
      if (!currentSet.has(cid)) {
        targetRoom.connectingMeta[cid] = { at: now, linked: true };
        const other = allRooms.find((r) => String(r.id) === cid);
        if (other) {
          if (!Array.isArray(other.connectingRoomIds)) other.connectingRoomIds = [];
          if (!other.connectingRoomIds.map(String).includes(targetId)) other.connectingRoomIds.push(targetId);
          other.connectingMeta = { ...(other.connectingMeta || {}) };
          other.connectingMeta[targetId] = { at: now, linked: true };
          other.updatedAt = now;
        }
      }
    }
    targetRoom.connectingRoomIds = Array.from(newSet);
    targetRoom.updatedAt = now;
  }
  function cuHasActiveFilters() {
    return (
      (cuRackFilter.floor && cuRackFilter.floor !== 'all') ||
      cuRackFilter.floors.size > 0 ||
      cuRackFilter.categories.size > 0 ||
      cuRackFilter.status !== 'all' ||
      cuRackFilter.hasView ||
      cuRackFilter.views.size > 0 ||
      cuRackFilter.characteristics.size > 0 ||
      cuRackFilter.connectingOnly ||
      (cuRackFilter.minCapacity || 0) > 0 ||
      Boolean(cuRackFilter.q)
    );
  }
  function cuActiveFilterCount() {
    let cnt = 0;
    if (cuRackFilter.floor && cuRackFilter.floor !== 'all') cnt++;
    cnt += cuRackFilter.floors.size;
    cnt += cuRackFilter.categories.size;
    if (cuRackFilter.status !== 'all') cnt++;
    if (cuRackFilter.hasView) cnt++;
    cnt += cuRackFilter.views.size;
    cnt += cuRackFilter.characteristics.size;
    if (cuRackFilter.connectingOnly) cnt++;
    if (cuRackFilter.minCapacity > 0) cnt++;
    if (cuRackFilter.q) cnt++;
    return cnt;
  }
  function cuFloorMatchesFilter(floor) {
    if (cuRackFilter.floor && cuRackFilter.floor !== 'all') {
      if (floor.lbl !== cuRackFilter.floor && floor.id !== cuRackFilter.floor) return false;
    }
    if (cuRackFilter.floors.size > 0) {
      return cuRackFilter.floors.has(floor.id) || cuRackFilter.floors.has(floor.lbl);
    }
    return true;
  }
  function cuRoomMatchesFilter(r) {
    if (!r) return false;
    if (cuRackFilter.floor && cuRackFilter.floor !== 'all') {
      if (r.floor !== cuRackFilter.floor && r.floorId !== cuRackFilter.floor) return false;
    }
    if (cuRackFilter.floors.size > 0) {
      if (!cuRackFilter.floors.has(r.floorId) && !cuRackFilter.floors.has(r.floor)) return false;
    }
    if (cuRackFilter.categories.size > 0) {
      if (!cuRackFilter.categories.has(r.typeId)) return false;
    }
    if (cuRackFilter.status !== 'all') {
      if (cuRoomStatus(r).key !== cuRackFilter.status) return false;
    }
    if (cuRackFilter.hasView) {
      if (!r.view) return false;
    }
    if (cuRackFilter.views.size > 0) {
      if (!r.view || !cuRackFilter.views.has(r.view)) return false;
    }
    if (cuRackFilter.characteristics.size > 0) {
      const chars = Array.isArray(r.characteristics) ? r.characteristics : [];
      for (const c of cuRackFilter.characteristics) {
        if (!chars.includes(c)) return false;
      }
    }
    if (cuRackFilter.connectingOnly) {
      if (!Array.isArray(r.connectingRoomIds) || r.connectingRoomIds.length === 0) return false;
    }
    if ((cuRackFilter.minCapacity || 0) > 0) {
      const type = roomTypeOf(r.n);
      const cap = type?.maxGuests || 2;
      if (cap < cuRackFilter.minCapacity) return false;
    }
    if (cuRackFilter.q) {
      const q = cuRackFilter.q.toLocaleLowerCase('fr');
      const type = roomTypeOf(r.n);
      const chars = (r.characteristics || []).map((cid) => cuCharLabel(cid));
      const haystack = [
        r.n,
        type?.name,
        cuRoomLive(r)?.stay?.customer?.name || r.guest,
        r.meta,
        r.floor,
        r.view ? ('vue ' + r.view + ' ' + cuViewLabel(r.view)) : '',
        ...chars,
      ].map((x) => String(x || '').toLocaleLowerCase('fr'));
      if (!haystack.some((x) => x.includes(q))) return false;
    }
    return true;
  }
  function cuFilterChipsMarkup(matchingCount, totalCount) {
    if (!cuHasActiveFilters()) return '';
    const st = cuState();
    const chips = [];

    if (cuRackFilter.floor && cuRackFilter.floor !== 'all') {
      chips.push(`<span class="hx-filter-chip"><span>${tx('Section : {name}', { name: esc(cuRackFilter.floor) })}</span><button type="button" data-action="hx-filter-remove" data-arg="floor:${esc(cuRackFilter.floor)}" aria-label="${tx('Retirer ce filtre')}">×</button></span>`);
    }
    for (const fid of cuRackFilter.floors) {
      const name = st.floors[fid]?.name || fid;
      chips.push(`<span class="hx-filter-chip"><span>${tx('Section : {name}', { name: esc(name) })}</span><button type="button" data-action="hx-filter-remove" data-arg="floors:${esc(fid)}" aria-label="${tx('Retirer ce filtre')}">×</button></span>`);
    }
    for (const cid of cuRackFilter.categories) {
      const name = st.roomTypes[cid]?.name || cid;
      chips.push(`<span class="hx-filter-chip"><span>${tx('Type : {name}', { name: esc(name) })}</span><button type="button" data-action="hx-filter-remove" data-arg="categories:${esc(cid)}" aria-label="${tx('Retirer ce filtre')}">×</button></span>`);
    }
    if (cuRackFilter.status !== 'all') {
      const statusLabels = { libre: tx('Libre · propre'), occ: tx('Occupée / Départ'), arrivee: tx('Arrivée attendue'), sale: tx('À nettoyer'), hs: tx('Hors-service') };
      const lbl = statusLabels[cuRackFilter.status] || cuRackFilter.status;
      chips.push(`<span class="hx-filter-chip"><span>${tx('État : {s}', { s: esc(lbl) })}</span><button type="button" data-action="hx-filter-remove" data-arg="status:${esc(cuRackFilter.status)}" aria-label="${tx('Retirer ce filtre')}">×</button></span>`);
    }
    if (cuRackFilter.hasView) {
      chips.push(`<span class="hx-filter-chip"><span>${tx('Avec vue')}</span><button type="button" data-action="hx-filter-remove" data-arg="hasView" aria-label="${tx('Retirer ce filtre')}">×</button></span>`);
    }
    for (const v of cuRackFilter.views) {
      chips.push(`<span class="hx-filter-chip"><span>${tx('Vue {v}', { v: esc(cuViewLabel(v)) })}</span><button type="button" data-action="hx-filter-remove" data-arg="views:${esc(v)}" aria-label="${tx('Retirer ce filtre')}">×</button></span>`);
    }
    for (const c of cuRackFilter.characteristics) {
      const lbl = cuCharLabel(c);
      chips.push(`<span class="hx-filter-chip"><span>${esc(lbl)}</span><button type="button" data-action="hx-filter-remove" data-arg="characteristics:${esc(c)}" aria-label="${tx('Retirer ce filtre')}">×</button></span>`);
    }
    if (cuRackFilter.connectingOnly) {
      chips.push(`<span class="hx-filter-chip"><span>${tx('Communicantes')}</span><button type="button" data-action="hx-filter-remove" data-arg="connectingOnly" aria-label="${tx('Retirer ce filtre')}">×</button></span>`);
    }
    if (cuRackFilter.minCapacity > 0) chips.push(`<span class="hx-filter-chip"><span>≥ ${txn(cuRackFilter.minCapacity, 'voyageur')}</span><button type="button" data-action="hx-filter-remove" data-arg="minCapacity" aria-label="${tx('Retirer ce filtre')}">×</button></span>`);
    if (cuRackFilter.q) {
      chips.push(`<span class="hx-filter-chip"><span>${hxLang() === 'en' ? '“' + esc(cuRackFilter.q) + '”' : '« ' + esc(cuRackFilter.q) + ' »'}</span><button type="button" data-action="hx-filter-remove" data-arg="q" aria-label="${tx('Retirer ce filtre')}">×</button></span>`);
    }

    return `<div class="hx-filter-chips-wrap">
      <div class="hx-filter-chips">${chips.join('')}</div>
      <button type="button" class="hx-filter-reset-btn" data-action="hx-room-filter-reset">${tx('Effacer les filtres')}</button>
      <span class="hx-room-matching-count">${tx(matchingCount > 1 ? '{n} chambres affichées sur {total}' : '{n} chambre affichée sur {total}', { n: matchingCount, total: totalCount })}</span>
    </div>`;
  }
  function cuRackBody() {
    cuEnsureFilterVenue();
    const pendingBulk = cuPendingBulk();
    const all = Object.values(R());
    const counts = {
      all: all.length,
      libre: all.filter((r) => cuRoomStatus(r).key === 'libre').length,
      occ: all.filter((r) => cuRoomStatus(r).key === 'occ').length,
      arrivee: all.filter((r) => cuRoomStatus(r).key === 'arrivee').length,
      sale: all.filter((r) => cuRoomStatus(r).key === 'sale').length,
      hs: all.filter((r) => cuRoomStatus(r).key === 'hs').length,
    };
    const compactProperty = all.length <= 20;
    const floorRows = cuFloors();

    const floorTabs = [`<button class="${(!cuRackFilter.floor || cuRackFilter.floor === 'all') && cuRackFilter.floors.size === 0 ? 'on' : ''}" data-action="hx-room-floor" data-arg="all">${tx('Tous les étages')} <b>${counts.all}</b></button>`]
      .concat(floorRows.map((f) => `<button class="${(cuRackFilter.floor === f.lbl || cuRackFilter.floors.has(f.id) || cuRackFilter.floors.has(f.lbl)) ? 'on' : ''}" data-action="hx-room-floor" data-arg="${esc(f.lbl)}">${esc(f.lbl)} <b>${f.rooms.length}</b></button>`)).join('');

    let matchingTotal = 0;
    const renderedSections = [];

    floorRows.forEach((f) => {
      if (!cuFloorMatchesFilter(f)) return;

      const matchedRooms = f.rooms.map((n) => R()[n]).filter((r) => cuRoomMatchesFilter(r));
      matchingTotal += matchedRooms.length;

      if (f.rooms.length === 0) {
        renderedSections.push(`<section class="hx-floor-section hx-floor-empty-section" data-hx-floor-section>
          <div class="hx-floor-head">
            <div><b>${esc(f.lbl)}</b><span>${tx('0 chambre')}</span></div>
            <div class="hx-floor-head-actions">
              <button data-action="hx-floor-edit" data-arg="${esc(f.id)}">${tx('Gérer')}</button>
              <button data-action="hx-room-add-floor" data-arg="${esc(f.id)}">+ ${tx('Ajouter des chambres')}</button>
            </div>
          </div>
          <div class="hx-room-empty-section-hint">${tx('Cette section ne contient encore aucune chambre.')}</div>
        </section>`);
        return;
      }

      if (matchedRooms.length === 0) {
        if (cuRackFilter.floor !== 'all' || cuRackFilter.floors.size > 0) {
          renderedSections.push(`<section class="hx-floor-section" data-hx-floor-section>
            <div class="hx-floor-head">
              <div><b>${esc(f.lbl)}</b><span>${tx('0 affichée')}</span></div>
              <div class="hx-floor-head-actions">
                <button data-action="hx-floor-edit" data-arg="${esc(f.id)}">${tx('Gérer')}</button>
                <button data-action="hx-room-add-floor" data-arg="${esc(f.id)}">+ ${tx('Ajouter ici')}</button>
              </div>
            </div>
            <div class="hx-room-empty-section-hint">${tx('Aucune chambre ne correspond aux filtres dans cette section.')}</div>
          </section>`);
        }
        return;
      }

      const roomCards = matchedRooms.map((r) => {
        const status = cuRoomStatus(r);
        const type = roomTypeOf(r.n);
        const today = new (globalThis.KiwiZoneLaw?.DateTimeFormat || Intl.DateTimeFormat)('en-CA', { timeZone: 'Africa/Casablanca', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
        const roomStay = cuRoomLive(r)?.stay || null;
        const roomErrs = roomStay ? cuEvaluateStayExceptions(roomStay, today) : [];
        const exChip = roomErrs.length ? `<span class="hx-exc-chip" title="${esc(roomErrs.map((e) => e.label).join(' · '))}">${tx('Incomplet')}</span>` : '';
        const isSelected = cuSelectedRooms.has(String(r.id));

        const viewName = r.view ? tx('Vue {v}', { v: esc(cuViewLabel(r.view)) }) : '';
        const viewBadge = r.view ? `<span class="hx-room-view-badge" title="${viewName}">${viewName}</span>` : '';
        const connBadge = (r.connectingRoomIds && r.connectingRoomIds.length) ? `<span class="hx-room-conn-badge" title="${tx('Portes communicantes ({n})', { n: r.connectingRoomIds.length })}">⇌</span>` : '';

        const selectCb = cuSelectionMode ? `<label class="hx-room-select-cb"><input type="checkbox" data-action="hx-room-check" data-arg="${r.n}" ${isSelected ? 'checked' : ''} aria-label="${tx('Sélectionner la chambre {n}', { n: r.n })}"></label>` : '';

        return `<div class="hx-room st-${status.key} ${isSelected ? 'selected' : ''} ${cuSelectionMode ? 'selection-mode' : ''}" role="button" tabindex="0" aria-label="${tx('Chambre {n}', { n: r.n })}" data-action="hx-room" data-arg="${r.n}" data-hx-room-card>
          ${selectCb}
          ${cuSelectionMode ? '' : `<button class="hx-room-edit" type="button" data-action="hx-room-edit" data-arg="${r.n}" aria-label="${tx('Modifier la chambre {n}', { n: r.n })}" title="${tx('Modifier')}">✎</button>`}
          <div class="hx-room-top"><span class="no">${r.n}</span><span class="hx-room-state ${status.key}">${esc(status.label)}</span>${exChip}${connBadge}</div>
          <div class="ty" style="display:flex;align-items:center;justify-content:space-between;gap:6px;"><span>${esc(type.name)}</span>${viewBadge}</div>
          <div class="hx-room-bottom"><span class="gu">${esc(roomStay?.customer?.name || (status.key === 'sale' ? tx('Remise à blanc à faire') : r.guest || (status.key === 'libre' ? tx('Prête à vendre') : tx(r.meta) || status.label)))}</span><span class="hx-room-price">${type.base == null ? '·' : ltr(fmt(type.base) + '<small> MAD</small>')}</span></div>
        </div>`;
      }).join('');

      renderedSections.push(`<section class="hx-floor-section" data-hx-floor-section>
        <div class="hx-floor-head">
          <div><b>${esc(f.lbl)}</b><span>${tx(matchedRooms.length === 1 ? '{n} affichée' : '{n} affichées', { n: matchedRooms.length })}</span></div>
          <div class="hx-floor-head-actions">
            <button data-action="hx-floor-edit" data-arg="${esc(f.id)}">${tx('Gérer')}</button>
            <button data-action="hx-room-add-floor" data-arg="${esc(f.id)}">+ ${tx('Ajouter ici')}</button>
          </div>
        </div>
        <div class="hx-rack">${roomCards}</div>
      </section>`);
    });

    const floorSections = renderedSections.join('');

    if (!totalRooms()) return `<div class="hx-page hx-room-workspace">
      <div class="hx-room-empty">
        <div class="hx-room-empty-art"><span>101</span><span>102</span><span>103</span></div>
        <div class="hx-room-empty-copy"><span class="hx-eyebrow">${tx('CONFIGURATION EN 2 MINUTES')}</span><h3>${tx('Construisez votre hôtel par étage.')}</h3>
          <p>${tx('Créez vos types une fois, puis ajoutez 10, 50 ou 100 chambres avec les mêmes réglages.')}</p>
          <div class="hx-room-empty-actions"><button class="hx-btn atlas" data-action="hx-room-add">${tx('Ajouter plusieurs chambres')}</button><button class="hx-btn ghost" data-action="hx-room-types">${tx('Configurer les types')}</button></div>
          <div class="hx-room-empty-notes"><span>✓ ${tx('Numéros par plage')}</span><span>✓ ${tx('Tarifs par type')}</span><span>✓ ${tx('Connecté au ménage')}</span></div>
        </div>
      </div>
    </div>`;

    const noMatch = !floorSections ? `<div class="hx-room-no-match"><b>${tx('Aucune chambre ne correspond.')}</b><span>${tx('Changez l’étage, le statut, les caractéristiques ou la recherche.')}</span><button class="hx-link-btn" data-action="hx-room-filter-reset">${tx('Réinitialiser les filtres')}</button></div>` : '';

    const kpis = [
      ['all', '', tx('Total'), tx('inventaire')], ['libre', 'ready', tx('Prêtes'), tx('à vendre')],
      ['occ', 'occupied', tx('Occupées'), tx('en maison')], ['arrivee', 'arrival', tx('Arrivées'), tx('attendues')],
      ['sale', 'dirty', tx('À nettoyer'), tx('ménage')], ['hs', 'offline', tx('Hors-service'), tx('maintenance')],
    ].filter(([key]) => !compactProperty || ['all', 'libre', 'occ', 'sale'].includes(key) || counts[key] > 0);

    const filterCount = cuActiveFilterCount();
    const chipsHtml = cuFilterChipsMarkup(matchingTotal, all.length);

    const selectedList = cuSelectedNumbers();
    const visibleSelected = selectedList.filter((n) => cuRoomMatchesFilter(R()[n])).length;
    const hiddenSelected = selectedList.length - visibleSelected;

    let bulkBar = '';
    if (cuSelectionMode || selectedList.length > 0) {
      bulkBar = `<div class="hx-room-bulk-bar" role="region" aria-label="${tx('Sélection groupée')}">
        <div class="hx-room-bulk-info">
          <b>${tx(selectedList.length > 1 ? '{n} chambres sélectionnées' : '{n} chambre sélectionnée', { n: selectedList.length, c: txn(selectedList.length, 'chambre') })}</b>
          ${hiddenSelected > 0 ? `<small>(${tx(hiddenSelected > 1 ? '{n} masquées par les filtres' : '{n} masquée par les filtres', { n: hiddenSelected })})</small>` : ''}
        </div>
        <div class="hx-room-bulk-actions">
          <button class="hx-btn ghost" data-action="hx-room-select-filtered">${tx('Sélectionner les résultats filtrés')}</button>
          <button class="hx-btn ghost" data-action="hx-room-select-none" ${selectedList.length === 0 ? 'disabled' : ''}>${tx('Tout désélectionner')}</button>
          <button class="hx-btn atlas" data-action="hx-room-bulk-edit-open" ${selectedList.length === 0 ? 'disabled' : ''}>${tx('Modifier')}</button>
          <button class="hx-btn ghost" data-action="hx-room-select-cancel">${tx('Annuler')}</button>
        </div>
      </div>`;
    }

    return `<div class="hx-page hx-room-workspace ${compactProperty ? 'hx-room-compact-property' : ''}">
      <div class="hx-room-section-tabs" role="tablist" aria-label="${tx('Espaces hôtel')}">
        <button class="on" role="tab" aria-selected="true" data-action="nav-chambres"><span>${tx('Plan')}</span><small>${txn(counts.all, 'chambre')}</small></button>
        <button role="tab" aria-selected="false" data-action="nav-menage"><span>${tx('Ménage')}</span><small>${tx('{n} à nettoyer', { n: counts.sale })}</small></button>
        <button role="tab" aria-selected="false" data-action="nav-tarifs"><span>${tx('Tarifs')}</span><small>${tx('par catégorie')}</small></button>
      </div>
      <div class="hx-room-kpis" style="--hx-kpi-count:${kpis.length}">${kpis.map(([key, cls, label, note]) => `<button class="${cls} ${cuRackFilter.status === key ? 'on' : ''}" data-action="hx-room-status" data-arg="${key}"><span>${label}</span><b>${counts[key]}</b><small>${note}</small></button>`).join('')}</div>
      <div class="hx-room-toolbar">
        ${compactProperty ? `<div class="hx-room-compact-hint">${tx('Touchez une chambre pour la vendre ou ouvrir son folio.')}</div>` : `<label class="hx-room-search"><span>⌕</span><input data-hx-room-search value="${esc(cuRackFilter.q)}" placeholder="${tx('Rechercher une chambre, un client, vue…')}"><button data-action="hx-room-search">${tx('Rechercher')}</button></label>`}
        <div class="hx-room-toolbar-actions">
          <button class="hx-btn ghost" data-action="hx-room-filters-open">${tx('Filtres')} ${filterCount ? `<b>(${filterCount})</b>` : ''}</button>
          <button class="hx-btn ${cuSelectionMode ? 'atlas' : 'ghost'}" data-action="hx-room-select-toggle">${cuSelectionMode ? tx('Quitter la sélection') : tx('Sélectionner')}</button>
          <button class="hx-btn ghost" data-action="hx-floors">${tx('Gérer les sections')}</button>
          <button class="hx-btn ghost" data-action="hx-views-manage-open">${tx('Gérer les vues & caractéristiques')}</button>
          <button class="hx-btn ghost" data-action="hx-room-types">${tx('Gérer les catégories')}</button>
          <button class="hx-btn atlas" data-action="hx-room-add">+ ${tx('Ajouter des chambres')}</button>
        </div>
      </div>
      ${chipsHtml}
      ${pendingBulk ? `<div class="hx-room-pending" role="status"><span>${trL({fr:'Une modification groupée attend une confirmation.',en:'A bulk change is awaiting confirmation.',ar:'تعديل جماعي بانتظار التأكيد.'})}</span> <button class="hx-btn ghost" data-action="hx-bulk-resume">${trL({fr:'Vérifier / reprendre',en:'Check / resume',ar:'تحقق / استئناف'})}</button></div>` : ''}
      ${floorRows.length > 1 ? `<div class="hx-floor-tabs">${floorTabs}</div>` : ''}
      ${bulkBar}
      ${floorSections}${noMatch}
    </div>`;
  }
  function cuFiltersModal() {
    const st = cuState();
    const floors = cuFloorRows();
    const types = cuTypes();
    const views = cuAllViews();

    const m = K().modal({
      tag: tx('FILTRES'),
      title: tx('Filtrer le plan des chambres'),
      desc: trL({fr:'Combinez les critères : plusieurs étages ou vues, et tous les équipements cochés.',en:'Combine criteria: any selected floor or view, and all selected amenities.',ar:'اجمع المعايير: أي طابق أو إطلالة محددة، وجميع الميزات المحددة.'}),
      width: 580,
      body: `<div class="hx-room-form">
        <fieldset class="hx-filter-group hx-room-form-wide">
          <legend>${tx('Sections & étages')}</legend>
          <div class="hx-filter-checkbox-grid">
            ${floors.map((f) => `<label class="hx-filter-check-label"><input type="checkbox" data-hx-filter-floor="${esc(f.id)}" ${cuRackFilter.floors.has(f.id) || cuRackFilter.floor === f.lbl ? 'checked' : ''}> ${esc(f.name)}</label>`).join('')}
          </div>
        </fieldset>
        <fieldset class="hx-filter-group hx-room-form-wide">
          <legend>${tx('Catégories & types')}</legend>
          <div class="hx-filter-checkbox-grid">
            ${types.map((t) => `<label class="hx-filter-check-label"><input type="checkbox" data-hx-filter-cat="${esc(t.id)}" ${cuRackFilter.categories.has(t.id) ? 'checked' : ''}> ${esc(t.name)}</label>`).join('')}
          </div>
        </fieldset>
        <fieldset class="hx-filter-group hx-room-form-wide">
          <legend>${tx('Vues')}</legend>
          <div style="margin-bottom:8px;">
            <label class="hx-filter-check-label"><input type="checkbox" data-hx-filter-hasview ${cuRackFilter.hasView ? 'checked' : ''}> <b>${tx('Toutes les chambres avec vue')}</b></label>
          </div>
          <div class="hx-filter-checkbox-grid">
            ${views.map((v) => `<label class="hx-filter-check-label"><input type="checkbox" data-hx-filter-view="${esc(v)}" ${cuRackFilter.views.has(v) ? 'checked' : ''}> ${tx('Vue {v}', { v: esc(cuViewLabel(v)) })}</label>`).join('')}
          </div>
        </fieldset>
        <fieldset class="hx-filter-group hx-room-form-wide">
          <legend>${tx('Caractéristiques & équipements (tous requis)')}</legend>
          <div class="hx-filter-checkbox-grid">
            ${cuAllCharacteristics().map((c) => `<label class="hx-filter-check-label"><input type="checkbox" data-hx-filter-char="${esc(c.id)}" ${cuRackFilter.characteristics.has(c.id) ? 'checked' : ''}> ${esc(cuCharLabel(c))}</label>`).join('')}
          </div>
        </fieldset>
        <fieldset class="hx-filter-group hx-room-form-wide">
          <legend>${tx('Agencement & portes')}</legend>
          <label class="hx-filter-check-label"><input type="checkbox" data-hx-filter-connecting ${cuRackFilter.connectingOnly ? 'checked' : ''}> <b>${tx('Uniquement chambres communicantes')}</b></label>
        </fieldset>
      </div>
      <label class="hx-room-form-field">${trL({fr:'Capacité minimale',en:'Minimum capacity',ar:'الحد الأدنى للسعة'})}<input type="number" min="0" max="12" step="1" data-hx-filter-capacity value="${cuRackFilter.minCapacity || 0}"></label>
      <div class="hx-room-form-actions">
        <button class="hx-btn ghost" data-action="hx-filter-modal-reset">${tx('Effacer tout')}</button>
        <button class="hx-btn atlas" data-action="hx-filter-modal-apply">${tx('Appliquer les filtres')}</button>
      </div>`,
    });
    m.el.querySelector('.kiwi-modal')?.classList.add('hx-hotel-modal');
    openModal = { el: m.el, close: m.close };
  }
  let cuBulkStaged = null;
  function cuBulkEditModal(draft) {
    const selectedNumbers = cuSelectedNumbers();
    if (selectedNumbers.length > 200) {
      toast(trL({fr:'Sélectionnez au maximum 200 chambres par modification.',en:'Select up to 200 rooms per bulk change.',ar:'حدد 200 غرفة كحد أقصى لكل تعديل جماعي.'}), {type:'warn'});
      return;
    }
    if (!selectedNumbers.length) {
      K().toast(tx('Aucune chambre sélectionnée'), { type: 'warn' });
      return;
    }
    draft = draft || cuBulkStaged || {};
    const st = cuState();
    const floors = cuFloorRows();
    const types = cuTypes();
    const views = cuAllViews();
    const characteristics = cuAllCharacteristics();

    const m = K().modal({
      tag: tx('MODIFICATION EN BLOC'),
      title: tx('Modifier {n} chambres', { n: selectedNumbers.length, c: txn(selectedNumbers.length, 'chambre') }),
      desc: tx('Seuls les champs avec une modification sélectionnée seront mis à jour.'),
      width: 580,
      body: `<div class="hx-room-form">
        <label><span>${tx('Section / Étage')}</span>
          <select data-hx-bulk-floor-id>
            <option value="">${tx('Ne pas modifier')}</option>
            ${floors.map((f) => `<option value="${esc(f.id)}" ${draft.floorId === f.id ? 'selected' : ''}>${esc(f.name)}</option>`).join('')}
          </select>
        </label>
        <label><span>${tx('Catégorie / Type')}</span>
          <select data-hx-bulk-type-id>
            <option value="">${tx('Ne pas modifier')}</option>
            ${types.map((t) => `<option value="${esc(t.id)}" ${draft.typeId === t.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}
          </select>
        </label>
        <label><span>${tx('Vue')}</span>
          <select data-hx-bulk-view>
            <option value="">${tx('Ne pas modifier')}</option>
            <option value="__CLEAR__" ${draft.view === '' ? 'selected' : ''}>${tx('Retirer la vue')}</option>
            ${views.map((v) => `<option value="${esc(v)}" ${draft.view === v ? 'selected' : ''}>${tx('Vue {v}', { v: esc(cuViewLabel(v)) })}</option>`).join('')}
          </select>
        </label>
        <label><span>${tx('Action sur les équipements')}</span>
          <select data-hx-bulk-char-mode>
            <option value="none" ${(!draft.charMode || draft.charMode === 'none') ? 'selected' : ''}>${tx('Ne pas modifier')}</option>
            <option value="add" ${draft.charMode === 'add' ? 'selected' : ''}>${tx('Ajouter les équipements cochés')}</option>
            <option value="remove" ${draft.charMode === 'remove' ? 'selected' : ''}>${tx('Retirer les équipements cochés')}</option>
            <option value="replace" ${draft.charMode === 'replace' ? 'selected' : ''}>${tx('Remplacer par les équipements cochés')}</option>
          </select>
        </label>
        <div class="hx-room-form-wide">
          <label><span>${tx('Équipements concernés')}</span>
            <div class="hx-char-checkboxes">
              ${characteristics.map((c) => `<label class="hx-char-label"><input type="checkbox" data-hx-bulk-char="${c.id}" ${(draft.characteristics || []).includes(c.id) ? 'checked' : ''}> ${esc(cuCharLabel(c))}</label>`).join('')}
            </div>
          </label>
        </div>
        <p style="font-size:11.5px;color:var(--n-500);margin:8px 0 0;" class="hx-room-form-wide">
          ${tx('Note : Les portes communicantes se configurent chambre par chambre pour garantir la réciprocité physique des accès.')}
        </p>
      </div>
      <div class="hx-room-form-actions">
        <button class="hx-btn ghost" data-action="hx-bulk-cancel">${tx('Annuler')}</button>
        <button class="hx-btn atlas" data-action="hx-bulk-review">${tx('Vérifier avant d’appliquer…')}</button>
      </div>`,
    });
    m.el.querySelector('.kiwi-modal')?.classList.add('hx-hotel-modal');
    openModal = { el: m.el, close: m.close };
  }
  function cuBulkReviewModal(plan) {
    plan = plan || cuBulkPlan;
    const selectedNumbers = (plan && plan.targets) ? plan.targets.map((t) => t.n) : cuSelectedNumbers();
    const changes = (plan && plan.changes) ? plan.changes : (cuBulkStaged || {});
    const st = cuState();
    const summaryItems = [];

    if (changes.floorId) {
      summaryItems.push(`<li>${tx('Déplacer vers la section {name}', { name: `<b>${esc(st.floors[changes.floorId]?.name || changes.floorId)}</b>` })}</li>`);
    }
    if (changes.typeId) {
      summaryItems.push(`<li>${tx('Changer de type vers {name}', { name: `<b>${esc(st.roomTypes[changes.typeId]?.name || changes.typeId)}</b>` })}</li>`);
    }
    if (changes.view != null) {
      summaryItems.push(changes.view === '' ? `<li>${tx('Retirer la vue')}</li>` : `<li>${tx('Définir la vue à {v}', { v: `<b>${tx('Vue {v}', { v: esc(cuViewLabel(changes.view)) })}</b>` })}</li>`);
    }
    if (changes.charMode && changes.charMode !== 'none') {
      const labels = (changes.characteristics || []).map((cid) => cuCharLabel(cid)).join(', ');
      const modeLabel = changes.charMode === 'add' ? tx('Ajouter') : changes.charMode === 'remove' ? tx('Retirer') : tx('Remplacer par');
      summaryItems.push(`<li>${tx('Équipements :')} <b>${modeLabel}</b> ${labels ? `(${esc(labels)})` : `(${tx('aucun')})`}</li>`);
    }

    const m = K().modal({
      tag: tx('CONFIRMATION'),
      title: tx('Confirmer la modification de {n} chambres', { n: selectedNumbers.length, c: txn(selectedNumbers.length, 'chambre') }),
      desc: tx('Vérifiez attentivement les modifications avant enregistrement.'),
      width: 540,
      body: `<div style="display:flex;flex-direction:column;gap:14px;font-size:13px;color:var(--ink);">
        <div style="padding:12px 14px;background:var(--n-50,#f7f8f7);border-radius:10px;">
          <b>${tx('{n} chambres concernées :', { n: selectedNumbers.length, c: txn(selectedNumbers.length, 'chambre') })}</b>
          <p style="margin:4px 0 0;color:var(--n-600);font-family:var(--mono);font-size:12px;line-height:1.5;">
            ${selectedNumbers.map((n) => tx('Ch. {n}', { n })).join(', ')}
          </p>
        </div>
        <div>
          <b>${tx('Modifications qui seront appliquées :')}</b>
          <ul style="margin:6px 0 0 18px;padding:0;line-height:1.6;">
            ${summaryItems.join('')}
          </ul>
        </div>
        <p style="margin:0;font-size:11.5px;color:var(--n-500);line-height:1.5;padding:10px 12px;background:var(--surface,#fff);border:1px solid var(--n-200);border-radius:8px;">
          ${tx('Cette modification corrige l’organisation des chambres. Elle ne déplace aucun client et ne modifie aucun folio, séjour ou tarif existant.')}
        </p>
      </div>
      <div class="hx-room-form-actions">
        <p data-hx-bulk-error role="alert" hidden></p>
        <button class="hx-btn ghost" data-action="hx-bulk-back" ${plan?.submitted ? 'disabled' : ''}>${tx('Retour')}</button>
        <button class="hx-btn atlas" data-action="hx-bulk-confirm" ${plan?.needsReview ? 'disabled' : ''}>${tx('Confirmer et appliquer')}</button>
      </div>`,
    });
    m.el.querySelector('.kiwi-modal')?.classList.add('hx-hotel-modal');
    openModal = { el: m.el, close: m.close };
  }
  function cuMenageBody() { return window.__kiwiHotelInternal.part('housekeeping').cuMenageBody.apply(this, arguments); }
  /* ═══ Performance réelle d'un hôtel (occupation, ADR, RevPAR) ═══
   * « Tarifs & occupation » promettait « ADR, RevPAR et tarification IA
   * s'activent ici » avec « suggestions IA » et « occupation prévisionnelle sur
   * 12 mois » : aucune de ces trois choses n'existe. Ce qui existe, et qui est
   * vrai, c'est le registre des séjours : /api/hotel/performance en tire
   * l'occupation, l'ADR et le RevPAR (mêmes définitions que la bande de
   * l'Accueil, voir functions/api/hotel/_performance.js). */
  const cuPerfByScope = new Map();
  const cuPerfWindows = () => {
    const day = (n) => new (globalThis.KiwiZoneLaw?.DateTimeFormat || Intl.DateTimeFormat)('en-CA', { timeZone: 'Africa/Casablanca', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(Date.now() + n * 86400000));
    return { past: { from: day(-30), to: day(-1) }, ahead: { from: day(0), to: day(29) } };
  };
  function cuPerfState() { return window.__kiwiHotelInternal.part('rates').cuPerfState.apply(this, arguments); }
  async function cuLoadPerformance(force) {
    const slug = cuMerchantSlug(), st = cuPerfState();
    if (!slug || st.loading || (!force && Date.now() - st.at < 30000)) return;
    st.loading = true;
    const w = cuPerfWindows();
    const read = async (win) => {
      const res = await fetch('/api/hotel/performance?' + new URLSearchParams({ merchant: slug, from: win.from, to: win.to }), { cache: 'no-store' });
      const b = await res.json().catch(() => ({}));
      if (!res.ok || !b.ok) throw new Error(b.error || 'unavailable');
      return b;
    };
    try { const [past, ahead] = await Promise.all([read(w.past), read(w.ahead)]); st.past = past; st.ahead = ahead; st.error = ''; }
    catch (e) { st.error = e.message || 'unavailable'; }
    finally {
      st.loading = false; st.at = Date.now();
      if (openDrawer?.page === 'tarifs') rerender();
    }
  }
  function cuPerformanceBlock() { return window.__kiwiHotelInternal.part('rates').cuPerformanceBlock.apply(this, arguments); }
  function cuTarifsBody() { return window.__kiwiHotelInternal.part('rates').cuTarifsBody.apply(this, arguments); }
  function cuFoliosBody() {
    cuWarmStays();
    const fl = Object.values(F());
    /* Les séjours en maison : leur note est le dossier (nuits, formule repas,
     * consommations postées sur la chambre depuis une caisse). La page ne
     * listait que les « folios » du document des chambres, c'est-à-dire les
     * walk-in : « Folios ouverts · 0 » avec trois clients en maison, et un texte
     * qui promettait qu'un check-in ouvre la note et que la taxe de séjour s'y
     * range ligne par ligne, ce que rien ne fait. */
    const rooms = new Map(Object.values(R() || {}).map((r) => [r.id, r]));
    const inHouse = Array.from(cuAllStays().values())
      .filter((b) => b?.hotel && b.status === 'checked_in')
      .sort((x, y) => String(x.hotel.checkOut).localeCompare(String(y.hotel.checkOut)));
    const stayRows = inHouse.map((b) => {
      const room = rooms.get(b.resourceId);
      const nights = b.hotel.dayUse ? 0 : Math.max(1, Math.round((Date.parse(b.hotel.checkOut + 'T12:00:00Z') - Date.parse(b.hotel.checkIn + 'T12:00:00Z')) / 86400000));
      return `
      <div class="hx-arr">
        <span class="tm">${room ? tx('Ch. {n}', { n: esc(room.n) }) : tx('Sans chambre')}</span>
        <div class="who"><b>${esc(b.customer?.name || tx('Voyageur'))}</b><div class="sub">${esc(cuDay(b.hotel.checkIn))}${hxTo()}${esc(cuDay(b.hotel.checkOut))} · ${b.hotel.dayUse ? tx('day-use') : txn(nights, 'nuit')} · ${txn(b.partySize || 1, 'personne')}</div></div>
        <span style="font-family:var(--mono);font-weight:600;">${MAD(+b.hotel.total || 0)}</span>
        <button class="hx-btn ghost" data-action="hx-dossier" data-arg="${esc(b.id)}">${tx('Ouvrir le dossier')}</button>
      </div>`;
    }).join('');
    const rows = fl.map((f) => `
      <div class="hx-arr">
        <span class="tm">${tx('Ch. {n}', { n: f.room })}</span>
        <div class="who"><b>${esc(f.guest)}</b><div class="sub">${tx('walk-in')} · ${txn(f.nights, 'nuit')} · ${txn(f.pax, 'personne')} · ${txn(f.lines.length, 'ligne')}</div></div>
        <span style="font-family:var(--mono);font-weight:600;">${MAD(folioTotal(f))}</span>
        <button class="hx-btn ghost" data-action="hx-folio" data-arg="${f.room}">${tx('Ouvrir')}</button>
      </div>`).join('');
    const known = cuStaysKnown();
    cuStripUnknown = !known;
    const total = inHouse.length + fl.length;
    return `<div class="hx-page">
      <div class="hx-h"><span class="t">${tx('Notes en cours')} · ${known ? total : '·'}</span><span class="s">${tx('séjours en maison et ventes walk-in, une note par séjour')}</span></div>
      ${inHouse.length ? `<div class="block" style="padding:8px 14px;"><div class="hx-h" style="margin:6px 0;"><span class="t" style="font-size:13px;">${tx('Séjours en maison')} · ${inHouse.length}</span><span class="s">${tx('le montant est celui du séjour (logement et formule) ; les consommations postées depuis une caisse s’ajoutent dans le dossier')}</span></div><div class="hx-list">${stayRows}</div></div>` : ''}
      ${fl.length ? `<div class="block" style="padding:8px 14px;${inHouse.length ? 'margin-top:14px;' : ''}"><div class="hx-h" style="margin:6px 0;"><span class="t" style="font-size:13px;">${tx('Ventes walk-in')} · ${fl.length}</span></div><div class="hx-list">${rows}</div></div>` : ''}
      ${total ? '' : `<div class="block" style="padding:8px 14px;">${cuStarter(
          known ? tx('Aucune note en cours.') : tx('Lecture des séjours…'),
          tx('Un séjour passe en maison au check-in, depuis la Réception. Son dossier regroupe les nuits, la formule repas et les consommations postées sur la chambre depuis une caisse.'),
          [tx('Check-in et check-out depuis la Réception'), tx('Consommations de la caisse postées sur la chambre'), tx('Note détaillée imprimable depuis le dossier')],
          `<button class="hx-btn atlas" data-action="nav-reception">${tx('Ouvrir la Réception')}</button>`
        )}</div>`}
    </div>`;
  }
  function cuSejoursBody() {
    if (cuStayView === 'availability') return cuSejoursAvailabilityBody();
    const st = cuState();
    const rooms = Object.values(st.rooms || {}).sort((a, b) => a.n - b.n);
    const allStaysMap = cuAllStays();
    const active = { requested: 1, confirmed: 1, checked_in: 1 };
    const channels = { direct: tx('Direct'), booking: 'Booking.com', airbnb: 'Airbnb', expedia: 'Expedia', walkin: tx('Walk-in'), other: tx('Autre OTA') };
    const today = new (globalThis.KiwiZoneLaw?.DateTimeFormat || Intl.DateTimeFormat)('en-CA', { timeZone: 'Africa/Casablanca', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const add = (ymd, n) => { const d = new Date(ymd + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
    const distance = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 86400000);
    const start = add(today, cuTapeOffset);
    const end = add(start, 14);
    const dates = Array.from({ length: 14 }, (_, i) => add(start, i));
    const real = Array.from(allStaysMap.values()).filter((b) => b.hotel && b.hotel.checkIn && b.hotel.checkOut && b.status !== 'cancelled' && b.status !== 'no_show');

    const matched = new Set(real.map((b) => b.resourceId));
    const walkins = Object.values(st.folios || {}).filter((f) => f && !matched.has(st.rooms?.[f.room]?.id)).map((f) => {
      const room = st.rooms?.[f.room], stamp = +f.updatedAt || Date.now();
      const cin = new (globalThis.KiwiZoneLaw?.DateTimeFormat || Intl.DateTimeFormat)('en-CA', { timeZone: 'Africa/Casablanca', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(stamp));
      return room ? { id: 'folio:' + room.id, resourceId: room.id, customer: { name: f.guest || room.guest || tx('Walk-in') }, status: 'checked_in', hotel: { checkIn: cin, checkOut: add(cin, +f.nights || 1), channel: 'walkin', roomTypeName: roomTypeOf(room.n).name } } : null;
    }).filter(Boolean);
    const stays = real.concat(walkins);
    const hourFraction = (value, fallback) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value || '') ? (Number(value.slice(0,2)) + Number(value.slice(3))/60)/24 : fallback/24;
    const barsFor = (room) => stays.filter((b) => b.resourceId === room.id && b.hotel.checkIn < end && b.hotel.checkOut >= start).map((b) => {
      const from = Math.max(0, distance(start, b.hotel.checkIn) + hourFraction(b.hotel.arrivalTime,15));
      const to = Math.min(14, distance(start, b.hotel.checkOut) + hourFraction(b.hotel.departureTime,11));
      const channel = channels[b.hotel.channel] ? b.hotel.channel : (b.source === 'public' ? 'direct' : 'other');
      const left = from / 14 * 100, width = Math.max(.1, (to - from) / 14 * 100);
      const caption=(b.hotel.dayUse?tx('Day-use')+' · '+b.hotel.arrivalTime+'–'+b.hotel.departureTime:channels[channel]);
      return `<button class="hx-cu-stay src-${channel} status-${esc(b.status)} ${b.hotel.conflict ? 'has-conflict' : ''}" style="left:${left}%;width:calc(${width}% - 1px)" data-action="hx-stay-edit" data-arg="${esc(b.id)}" title="${esc((b.hotel.conflict ? tx('CONFLIT À RÉSOUDRE') + ' · ' : '') + (b.customer?.name || '') + ' · ' + caption + ' · ' + cuDay(b.hotel.checkIn) + hxTo() + cuDay(b.hotel.checkOut))}"><b>${esc(b.customer?.name || tx('Séjour'))}</b><span>${b.hotel.conflict ? '⚠ ' + tx('CONFLIT') : esc(caption)}</span></button>`;
    }).join('');
    const dateHead = dates.map((d) => { const dt = new Date(d + 'T12:00:00Z'); return `<div class="${d === today ? 'today' : ''}"><b>${HX_WEEKDAYS[hxLang()][dt.getUTCDay()].replace('.', '')}</b><span>${dt.getUTCDate()}</span></div>`; }).join('');
    const rows = rooms.map((room) => `<div class="hx-cu-tape-row"><div class="hx-cu-room"><b>${room.n}</b><span>${esc(roomTypeOf(room.n).name)}</span></div><div class="hx-cu-days">${dates.map((d) => `<i class="${d === today ? 'today' : ''}"></i>`).join('')}${barsFor(room)}</div></div>`).join('');
    const occupancy = dates.map((d) => {
      const count = rooms.filter((r) => stays.some((b) => b.resourceId === r.id && active[b.status] && b.hotel.checkIn <= d && b.hotel.checkOut > d)).length;
      const pct = rooms.length ? Math.round(count / rooms.length * 100) : 0;
      return `<div class="${d === today ? 'today' : ''}" title="${tx('{n} / {total} chambres', { n: count, total: rooms.length })}"><b>${pct}%</b><span>${count}</span></div>`;
    }).join('');
    return `<div class="hx-page">
      ${cuStrip()}
      <div class="hx-cu-tape block">
        <div class="hx-cu-tape-head"><div><span class="hx-kicker">${tx('DISPONIBILITÉ UNIFIÉE')}</span><h3>${tx('Chambres × 14 jours')}</h3><p>${tx('Direct, saisie manuelle et OTA bloquent tous la même chambre.')}</p></div><div class="hx-cu-tape-actions"><button type="button" class="hx-btn ghost" data-action="hx-tape-prev" aria-label="${tx('14 jours précédents')}">←</button><button type="button" class="hx-btn ghost" data-action="hx-tape-today">${tx('Aujourd’hui')}</button><button type="button" class="hx-btn ghost" data-action="hx-tape-next" aria-label="${tx('14 jours suivants')}">→</button><button type="button" class="hx-btn ghost" data-action="hx-dispo">${tx('Disponibilités')}</button>${cuHasGroupRecovery() ? `<button type="button" class="hx-btn ghost" data-action="hx-group-resume">${tx('Reprendre le dossier groupe')}</button>` : ''}<button type="button" class="hx-btn ghost" data-action="hx-group-new">+ ${tx('Réservation de groupe')}</button><button type="button" class="hx-btn atlas" data-action="hx-stay-new">+ ${tx('Réservation')}</button></div></div>
        <div class="hx-cu-legend">${Object.keys(channels).map((c) => `<span class="src-${c}"><i></i>${channels[c]}</span>`).join('')}</div>
        ${rooms.length ? `<div class="hx-cu-tape-scroll"><div class="hx-cu-tape-grid"><div class="hx-cu-date-row"><div class="hx-cu-room"><span>${tx('CHAMBRE')}</span></div><div class="hx-cu-date-days">${dateHead}</div></div>${rows}<div class="hx-cu-occupancy"><div class="hx-cu-room"><b>${tx('Occupation')}</b><span>${tx('vendues')}</span></div><div>${occupancy}</div></div></div></div>` : `<div class="hx-cu-tape-empty"><b>${tx('Ajoutez d’abord vos chambres')}</b><p>${tx('Le tape chart attribue chaque séjour à une chambre réelle.')}</p><button class="hx-btn atlas" data-action="hx-room-add">${tx('Configurer les chambres')}</button></div>`}
      </div>
    </div>`;
  }

  /* Availability is a first-class reception view, not a modal hidden behind
   * the tape chart.  Keep the old room-by-room tape available as a sibling
   * view so reception can switch without losing context. */
  function cuSejoursAvailabilityBody() {
    const today = new (globalThis.KiwiZoneLaw?.DateTimeFormat || Intl.DateTimeFormat)('en-CA', { timeZone: 'Africa/Casablanca', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    if (!cuDispoMonth) cuDispoMonth = today.slice(0, 7);
    const days = cuDispoMonthDays(cuDispoMonth);
    return `<div class="hx-page">
      ${cuStrip()}
      <div class="hx-cu-tape block hx-cu-availability-page">
        <div class="hx-cu-tape-head"><div><span class="hx-kicker">${tx('PLANNING PRÉVISIONNEL')}</span><h3>${tx('Disponibilités par jour')}</h3><p>${tx('Occupées et libres pour chaque date, avec le détail par catégorie de chambre.')}</p></div><div class="hx-cu-tape-actions"><button type="button" class="hx-btn ghost" data-action="hx-dispo-back">${tx('← Planning par chambre')}</button><button type="button" class="hx-btn atlas" data-action="hx-stay-new">+ ${tx('Réservation')}</button></div></div>
        <div data-hx-dispo-page-body>${cuDispoBody(cuDispoMonth, days)}</div>
      </div>
    </div>`;
  }

  /* Ticket #0008 · Disponibilités : chambres libres et occupées par jour, par
   * catégorie, comme le planning prévisionnel de l'ancien système. 100 %
   * client : mêmes registre chambres et séjours déjà chargés que le tape,
   * aucun endpoint. Nuit de départ exclue, annulés/no-show exclus. */
  let cuDispoMonth = '', cuDispoCat = 'all';
  const cuDispoAddMonth = (ym, n) => { const [y, m] = String(ym).split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); return d.toISOString().slice(0, 7); };
  const cuDispoMonthDays = (ym) => { const [y, m] = String(ym).split('-').map(Number); const n = new Date(Date.UTC(y, m, 0)).getUTCDate(); const out = []; for (let i = 1; i <= n; i++) out.push(ym + '-' + String(i).padStart(2, '0')); return out; };
  const cuDispoAddDays = (ymd, n) => { const d = new Date(ymd + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  function cuDispoBody(ym, days) {
    const st = cuState();
    const today = new (globalThis.KiwiZoneLaw?.DateTimeFormat || Intl.DateTimeFormat)('en-CA', { timeZone: 'Africa/Casablanca', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const rooms = Object.values(st.rooms || {});
    const byId = new Map(rooms.map((r) => [r.id, r]));
    const sellable = rooms.filter((r) => r.status !== 'hs');
    const cats = new Map();
    for (const r of sellable) {
      const key = r.typeId || roomTypeOf(r.n).name;
      if (!cats.has(key)) cats.set(key, { name: roomTypeOf(r.n).name, rooms: [] });
      cats.get(key).rooms.push(r);
    }
    const visibleCats = [...cats.values()].filter((c) => cuDispoCat === 'all' || c.name === cuDispoCat);
    const occupying = ['requested', 'confirmed', 'checked_in', 'completed'];
    const occ = new Map();
    let unassigned = 0;
    for (const b of cuAllStays().values()) {
      if (!b || !b.hotel || !b.hotel.checkIn || !b.hotel.checkOut || !occupying.includes(b.status)) continue;
      if (b.hotel.checkOut <= days[0] || b.hotel.checkIn > days[days.length - 1]) continue;
      const room = b.resourceId ? byId.get(b.resourceId) : null;
      if (!room || room.status === 'hs') { if (!room && b.status !== 'completed') unassigned++; continue; }
      for (const d of days) {
        if (b.hotel.checkIn <= d && b.hotel.checkOut > d) {
          const key = d + '|' + room.id;
          occ.set(key, true);
        }
      }
    }
    const occIn = (catRooms, d) => catRooms.filter((r) => occ.has(d + '|' + r.id)).length;
    const head = days.map((d) => { const dt = new Date(d + 'T12:00:00Z'); return `<th class="${d === today ? 'today' : ''}"><b>${new (globalThis.KiwiZoneLaw?.DateTimeFormat || Intl.DateTimeFormat)(hxLocale(), { weekday: 'narrow', timeZone: 'UTC' }).format(dt)}</b><span>${dt.getUTCDate()}</span></th>`; }).join('');
    const catRows = visibleCats.map((c) => `<tr><th scope="row">${esc(c.name)}<small>${c.rooms.length}</small></th>${days.map((d) => `<td class="${d === today ? 'today' : ''}" title="${tx('{n} occupée(s) sur {total}', { n: occIn(c.rooms, d), total: c.rooms.length })}">${occIn(c.rooms, d) || ''}</td>`).join('')}</tr>`).join('');
    const totals = days.map((d) => {
      const o = visibleCats.reduce((s, c) => s + occIn(c.rooms, d), 0);
      const s = visibleCats.reduce((sum, c) => sum + c.rooms.length, 0);
      return { o, f: Math.max(0, s - o), s };
    });
    const monthLabel = new (globalThis.KiwiZoneLaw?.DateTimeFormat || Intl.DateTimeFormat)(hxLocale(), { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(days[0] + 'T12:00:00Z'));
    const loadErr = tx((cuStayLoads.get(cuStayScope()) || {}).error || '');
    const sellableCount = visibleCats.reduce((s, c) => s + c.rooms.length, 0);
    return `<div class="hx-dispo-bar"><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
        <button type="button" class="hx-btn ghost" data-action="hx-dispo-prev" aria-label="${tx('Mois précédent')}">${hxLang() === 'ar' ? '→' : '←'}</button>
        <strong style="min-width:140px;text-align:center;">${esc(monthLabel)}</strong>
        <button type="button" class="hx-btn ghost" data-action="hx-dispo-next" aria-label="${tx('Mois suivant')}">${hxLang() === 'ar' ? '←' : '→'}</button>
        <button type="button" class="hx-btn ghost" data-action="hx-dispo-today">${tx('Ce mois')}</button>
        <select data-hx-dispo-cat data-hx-dispo-page-select aria-label="${tx('Catégorie')}">
          <option value="all">${tx('Toutes catégories')}</option>
          ${[...cats.values()].map((c) => `<option value="${esc(c.name)}" ${cuDispoCat === c.name ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
        </select>
        <button type="button" class="hx-btn ghost" data-action="hx-dispo-refresh">${tx('Actualiser')}</button>
      </div><small>${tx('{n} chambres vendables', { n: sellableCount, c: txn(sellableCount, 'chambre') })}${unassigned ? ' · ' + tx('{n} séjour(s) sans chambre attribuée', { n: unassigned, c: txn(unassigned, 'sejour') }) : ''}</small></div>
      ${loadErr ? `<div class="hx-billing-notice" role="alert">${esc(loadErr)}</div>` : ''}
      ${visibleCats.length ? `<div class="hx-dispo-scroll"><table class="hx-dispo-table"><thead><tr><th scope="col">${tx('Catégorie')}</th>${head}</tr></thead><tbody>
        ${catRows}
        <tr class="hx-dispo-total"><th scope="row">${tx('Occupées')}</th>${totals.map((t, i) => `<td class="${days[i] === today ? 'today' : ''}">${t.o || ''}</td>`).join('')}</tr>
        <tr class="hx-dispo-total hx-dispo-free"><th scope="row">${tx('Libres')}</th>${totals.map((t, i) => `<td class="${days[i] === today ? 'today' : ''}">${t.f}</td>`).join('')}</tr>
      </tbody></table></div>` : `<p>${tx('Aucune chambre vendable. Ajoutez vos chambres puis revenez.')}</p>`}`;
  }
  async function cuDispoPaint(host, refetch) {
    if (!host || !host.isConnected) return;
    const days = cuDispoMonthDays(cuDispoMonth);
    if (refetch) {
      host.innerHTML = `<p role="status">${tx('Chargement des disponibilités…')}</p>`;
      await cuFetchStaysForWindow(days[0], cuDispoAddDays(days[days.length - 1], 1));
      if (!host.isConnected) return;
    }
    host.innerHTML = cuDispoBody(cuDispoMonth, days);
    host.querySelector('[data-hx-dispo-cat]')?.addEventListener('change', (e) => {
      cuDispoCat = String(e.target.value || 'all');
      cuDispoPaint(host, false);
    });
  }
  async function cuDispoOpen() {
    const today = new (globalThis.KiwiZoneLaw?.DateTimeFormat || Intl.DateTimeFormat)('en-CA', { timeZone: 'Africa/Casablanca', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    cuDispoMonth = today.slice(0, 7);
    cuDispoCat = 'all';
    const m = K().modal({ tag: tx('DISPONIBILITÉS'), title: tx('Chambres libres et occupées par jour'), desc: tx('Par catégorie, avec totaux Libres et Occupées pour chaque jour du mois.'), width: 1080,
      body: `<div data-hx-dispo-body role="status">${tx('Chargement des disponibilités…')}</div>` });
    m.el.querySelector('.kiwi-modal')?.classList.add('hx-hotel-modal');
    openModal = { el: m.el, close: m.close };
    await cuDispoPaint(m.el.querySelector('[data-hx-dispo-body]'), true);
  }

  function cuLang() {
    try {
      return (window.KiwiI18n && window.KiwiI18n.getLang && window.KiwiI18n.getLang()) || document.documentElement?.lang || 'fr';
    } catch (_) { return 'fr'; }
  }

  const cuNationalities = [
    { code: "MA", demonym: {"fr":"Marocaine","en":"Moroccan","ar":"مغربية"}, name: {"fr":"Maroc","en":"Morocco","ar":"المغرب"}, aliases: ["maroc","morocco","moroccan"] },
    { code: "FR", demonym: {"fr":"Française","en":"French","ar":"فرنسية"}, name: {"fr":"France","en":"France","ar":"فرنسا"}, aliases: ["france","french","francais"] },
    { code: "ES", demonym: {"fr":"Espagnole","en":"Spanish","ar":"إسبانية"}, name: {"fr":"Espagne","en":"Spain","ar":"إسبانيا"}, aliases: ["espagne","spain","spanish","espana"] },
    { code: "DZ", demonym: {"fr":"Algérienne","en":"Algerian","ar":"جزائرية"}, name: {"fr":"Algérie","en":"Algeria","ar":"الجزائر"}, aliases: ["algerie","algeria"] },
    { code: "TN", demonym: {"fr":"Tunisienne","en":"Tunisian","ar":"تونسية"}, name: {"fr":"Tunisie","en":"Tunisia","ar":"تونس"}, aliases: ["tunisie","tunisia"] },
    { code: "BE", demonym: {"fr":"Belge","en":"Belgian","ar":"بلجيكية"}, name: {"fr":"Belgique","en":"Belgium","ar":"بلجيكا"}, aliases: ["belgique","belgium"] },
    { code: "CH", demonym: {"fr":"Suisse","en":"Swiss","ar":"سويسرية"}, name: {"fr":"Suisse","en":"Switzerland","ar":"سويسرا"}, aliases: ["suisse","switzerland"] },
    { code: "DE", demonym: {"fr":"Allemande","en":"German","ar":"ألمانية"}, name: {"fr":"Allemagne","en":"Germany","ar":"ألمانيا"}, aliases: ["allemagne","germany","deutschland"] },
    { code: "IT", demonym: {"fr":"Italienne","en":"Italian","ar":"إيطالية"}, name: {"fr":"Italie","en":"Italy","ar":"إيطاليا"}, aliases: ["italie","italy","italia"] },
    { code: "GB", demonym: {"fr":"Britannique","en":"British","ar":"بريطانية"}, name: {"fr":"Royaume-Uni","en":"United Kingdom","ar":"المملكة المتحدة"}, aliases: ["royaume-uni","united kingdom","uk","great britain","england","angleterre","ecosse","scotland","wales","pays de galles"] },
    { code: "US", demonym: {"fr":"Américaine","en":"American","ar":"أمريكية"}, name: {"fr":"États-Unis","en":"United States","ar":"الولايات المتحدة"}, aliases: ["etats-unis","usa","united states","america"] },
    { code: "CA", demonym: {"fr":"Canadienne","en":"Canadian","ar":"كندية"}, name: {"fr":"Canada","en":"Canada","ar":"كندا"}, aliases: ["canada","canadian"] },
    { code: "PT", demonym: {"fr":"Portugaise","en":"Portuguese","ar":"برتغالية"}, name: {"fr":"Portugal","en":"Portugal","ar":"البرتغال"}, aliases: ["portugal"] },
    { code: "NL", demonym: {"fr":"Néerlandaise","en":"Dutch","ar":"هولندية"}, name: {"fr":"Pays-Bas","en":"Netherlands","ar":"هولندا"}, aliases: ["pays-bas","netherlands","hollande","holland"] },
    { code: "SN", demonym: {"fr":"Sénégalaise","en":"Senegalese","ar":"سنغالية"}, name: {"fr":"Sénégal","en":"Senegal","ar":"السنغال"}, aliases: ["senegal"] },
    { code: "CI", demonym: {"fr":"Ivoirienne","en":"Ivorian","ar":"إيفوارية"}, name: {"fr":"Côte d'Ivoire","en":"Ivory Coast","ar":"ساحل العاج"}, aliases: ["cote d'ivoire","ivory coast"] },
    { code: "AE", demonym: {"fr":"Émirienne","en":"Emirati","ar":"إماراتية"}, name: {"fr":"Émirats arabes unis","en":"United Arab Emirates","ar":"الإمارات"}, aliases: ["emirats","uae","united arab emirates","dubai"] },
    { code: "SA", demonym: {"fr":"Saoudienne","en":"Saudi","ar":"سعودية"}, name: {"fr":"Arabie saoudite","en":"Saudi Arabia","ar":"السعودية"}, aliases: ["arabie saoudite","saudi arabia","saudi"] },
    { code: "QA", demonym: {"fr":"Qatarienne","en":"Qatari","ar":"قطرية"}, name: {"fr":"Qatar","en":"Qatar","ar":"قطر"}, aliases: ["qatar"] },
    { code: "KW", demonym: {"fr":"Koweïtienne","en":"Kuwaiti","ar":"كويتية"}, name: {"fr":"Koweït","en":"Kuwait","ar":"الكويت"}, aliases: ["koweit","kuwait"] },
    { code: "EG", demonym: {"fr":"Égyptienne","en":"Egyptian","ar":"مصرية"}, name: {"fr":"Égypte","en":"Egypt","ar":"مصر"}, aliases: ["egypte","egypt"] },
    { code: "TR", demonym: {"fr":"Turque","en":"Turkish","ar":"تركية"}, name: {"fr":"Turquie","en":"Turkey","ar":"تركيا"}, aliases: ["turquie","turkey","turkiye"] },
    { code: "MR", demonym: {"fr":"Mauritanienne","en":"Mauritanian","ar":"موريتانية"}, name: {"fr":"Mauritanie","en":"Mauritania","ar":"موريتانيا"}, aliases: ["mauritanie","mauritania"] },
    { code: "ML", demonym: {"fr":"Malienne","en":"Malian","ar":"مالية"}, name: {"fr":"Mali","en":"Mali","ar":"مالي"}, aliases: ["mali"] },
    { code: "GN", demonym: {"fr":"Guinéenne","en":"Guinean","ar":"غينية"}, name: {"fr":"Guinée","en":"Guinea","ar":"غينيا"}, aliases: ["guinee","guinea"] },
    { code: "GA", demonym: {"fr":"Gabonaise","en":"Gabonese","ar":"غابونية"}, name: {"fr":"Gabon","en":"Gabon","ar":"الغابون"}, aliases: ["gabon"] },
    { code: "CM", demonym: {"fr":"Camerounaise","en":"Cameroonian","ar":"كاميرونية"}, name: {"fr":"Cameroun","en":"Cameroon","ar":"الكاميرون"}, aliases: ["cameroun","cameroon"] },
    { code: "CG", demonym: {"fr":"Congolaise","en":"Congolese","ar":"كونغولية"}, name: {"fr":"Congo","en":"Congo","ar":"الكونغو"}, aliases: ["congo"] },
    { code: "CD", demonym: {"fr":"Congolaise (RDC)","en":"Congolese (DRC)","ar":"كونغولية ديمقراطية"}, name: {"fr":"RD Congo","en":"DR Congo","ar":"جمهورية الكونغو الديمقراطية"}, aliases: ["rdc","drc"] },
    { code: "NG", demonym: {"fr":"Nigériane","en":"Nigerian","ar":"نيجيرية"}, name: {"fr":"Nigeria","en":"Nigeria","ar":"نيجيريا"}, aliases: ["nigeria"] },
    { code: "ZA", demonym: {"fr":"Sud-Africaine","en":"South African","ar":"جنوب أفريقية"}, name: {"fr":"Afrique du Sud","en":"South Africa","ar":"جنوب أفريقيا"}, aliases: ["afrique du sud","south africa"] },
    { code: "RU", demonym: {"fr":"Russe","en":"Russian","ar":"روسية"}, name: {"fr":"Russie","en":"Russia","ar":"روسيا"}, aliases: ["russie","russia"] },
    { code: "UA", demonym: {"fr":"Ukrainienne","en":"Ukrainian","ar":"أوكرانية"}, name: {"fr":"Ukraine","en":"Ukraine","ar":"أوكرانيا"}, aliases: ["ukraine"] },
    { code: "PL", demonym: {"fr":"Polonaise","en":"Polish","ar":"بولندية"}, name: {"fr":"Pologne","en":"Poland","ar":"بولندا"}, aliases: ["pologne","poland"] },
    { code: "SE", demonym: {"fr":"Suédoise","en":"Swedish","ar":"سويدية"}, name: {"fr":"Suède","en":"Sweden","ar":"السويد"}, aliases: ["suede","sweden"] },
    { code: "NO", demonym: {"fr":"Norvégienne","en":"Norwegian","ar":"نرويجية"}, name: {"fr":"Norvège","en":"Norway","ar":"النرويج"}, aliases: ["norvege","norway"] },
    { code: "DK", demonym: {"fr":"Danoise","en":"Danish","ar":"دنماركية"}, name: {"fr":"Danemark","en":"Denmark","ar":"الدنمارك"}, aliases: ["danemark","denmark"] },
    { code: "FI", demonym: {"fr":"Finlandaise","en":"Finnish","ar":"فنلندية"}, name: {"fr":"Finlande","en":"Finland","ar":"فنلندا"}, aliases: ["finlande","finland"] },
    { code: "AT", demonym: {"fr":"Autrichienne","en":"Austrian","ar":"نمساوية"}, name: {"fr":"Autriche","en":"Austria","ar":"النمسا"}, aliases: ["autriche","austria"] },
    { code: "IE", demonym: {"fr":"Irlandaise","en":"Irish","ar":"أيرلندية"}, name: {"fr":"Irlande","en":"Ireland","ar":"أيرلندا"}, aliases: ["irlande","ireland"] },
    { code: "GR", demonym: {"fr":"Grecque","en":"Greek","ar":"يونانية"}, name: {"fr":"Grèce","en":"Greece","ar":"اليونان"}, aliases: ["grece","greece"] },
    { code: "RO", demonym: {"fr":"Roumaine","en":"Romanian","ar":"رومانية"}, name: {"fr":"Roumanie","en":"Romania","ar":"رومانيا"}, aliases: ["roumanie","romania"] },
    { code: "HU", demonym: {"fr":"Hongroise","en":"Hungarian","ar":"مجرية"}, name: {"fr":"Hongrie","en":"Hungary","ar":"المجر"}, aliases: ["hongrie","hungary"] },
    { code: "CZ", demonym: {"fr":"Tchèque","en":"Czech","ar":"تشيكية"}, name: {"fr":"République tchèque","en":"Czech Republic","ar":"التشيك"}, aliases: ["tcheque","czech"] },
    { code: "CN", demonym: {"fr":"Chinoise","en":"Chinese","ar":"صينية"}, name: {"fr":"Chine","en":"China","ar":"الصين"}, aliases: ["chine","china"] },
    { code: "JP", demonym: {"fr":"Japonaise","en":"Japanese","ar":"يابانية"}, name: {"fr":"Japon","en":"Japan","ar":"اليابان"}, aliases: ["japon","japan"] },
    { code: "KR", demonym: {"fr":"Sud-Coréenne","en":"South Korean","ar":"كورية جنوبية"}, name: {"fr":"Corée du Sud","en":"South Korea","ar":"كوريا الجنوبية"}, aliases: ["coree du sud","korea"] },
    { code: "IN", demonym: {"fr":"Indienne","en":"Indian","ar":"هندية"}, name: {"fr":"Inde","en":"India","ar":"الهند"}, aliases: ["inde","india"] },
    { code: "PK", demonym: {"fr":"Pakistanaise","en":"Pakistani","ar":"باكستانية"}, name: {"fr":"Pakistan","en":"Pakistan","ar":"باكستان"}, aliases: ["pakistan"] },
    { code: "BR", demonym: {"fr":"Brésilienne","en":"Brazilian","ar":"برازيلية"}, name: {"fr":"Brésil","en":"Brazil","ar":"البرازيل"}, aliases: ["bresil","brazil"] },
    { code: "AR", demonym: {"fr":"Argentine","en":"Argentine","ar":"أرجنتينية"}, name: {"fr":"Argentine","en":"Argentina","ar":"الأرجنتين"}, aliases: ["argentine","argentina"] },
    { code: "MX", demonym: {"fr":"Mexicaine","en":"Mexican","ar":"مكسيكية"}, name: {"fr":"Mexique","en":"Mexico","ar":"المكسيك"}, aliases: ["mexique","mexico"] },
    { code: "CL", demonym: {"fr":"Chilienne","en":"Chilean","ar":"تشيلية"}, name: {"fr":"Chili","en":"Chile","ar":"تشيلي"}, aliases: ["chili","chile"] },
    { code: "CO", demonym: {"fr":"Colombienne","en":"Colombian","ar":"كولومبية"}, name: {"fr":"Colombie","en":"Colombia","ar":"كولومبيا"}, aliases: ["colombie","colombia"] },
    { code: "AU", demonym: {"fr":"Australienne","en":"Australian","ar":"أسترالية"}, name: {"fr":"Australie","en":"Australia","ar":"أستراليا"}, aliases: ["australie","australia"] },
    { code: "NZ", demonym: {"fr":"Néo-Zélandaise","en":"New Zealander","ar":"نيوزيلندية"}, name: {"fr":"Nouvelle-Zélande","en":"New Zealand","ar":"نيوزيلندا"}, aliases: ["nouvelle-zelande","new zealand"] },
    { code: "LB", demonym: {"fr":"Libanaise","en":"Lebanese","ar":"لبنانية"}, name: {"fr":"Liban","en":"Lebanon","ar":"لبنان"}, aliases: ["liban","lebanon"] },
    { code: "JO", demonym: {"fr":"Jordanienne","en":"Jordanian","ar":"أردنية"}, name: {"fr":"Jordanie","en":"Jordan","ar":"الأردن"}, aliases: ["jordanie","jordan"] },
    { code: "IQ", demonym: {"fr":"Irakienne","en":"Iraqi","ar":"عراقية"}, name: {"fr":"Irak","en":"Iraq","ar":"العراق"}, aliases: ["irak","iraq"] },
    { code: "SY", demonym: {"fr":"Syrienne","en":"Syrian","ar":"سورية"}, name: {"fr":"Syrie","en":"Syria","ar":"سوريا"}, aliases: ["syrie","syria"] },
    { code: "YE", demonym: {"fr":"Yéménite","en":"Yemeni","ar":"يمنية"}, name: {"fr":"Yémen","en":"Yemen","ar":"اليمن"}, aliases: ["yemen"] },
    { code: "OM", demonym: {"fr":"Omanaise","en":"Omani","ar":"عمانية"}, name: {"fr":"Oman","en":"Oman","ar":"عمان"}, aliases: ["oman"] },
    { code: "BH", demonym: {"fr":"Bahreïnienne","en":"Bahraini","ar":"بحرينية"}, name: {"fr":"Bahreïn","en":"Bahrain","ar":"البحرين"}, aliases: ["bahrein","bahrain"] },
    { code: "LY", demonym: {"fr":"Libyenne","en":"Libyan","ar":"ليبية"}, name: {"fr":"Libye","en":"Libya","ar":"ليبيا"}, aliases: ["libye","libya"] },
    { code: "SD", demonym: {"fr":"Soudanaise","en":"Sudanese","ar":"سودانية"}, name: {"fr":"Soudan","en":"Sudan","ar":"السودان"}, aliases: ["soudan","sudan"] },
    { code: "NE", demonym: {"fr":"Nigérienne","en":"Nigerien","ar":"نيجرية"}, name: {"fr":"Niger","en":"Niger","ar":"النيجر"}, aliases: ["niger"] },
    { code: "TD", demonym: {"fr":"Tchadienne","en":"Chadian","ar":"تشادية"}, name: {"fr":"Tchad","en":"Chad","ar":"تشاد"}, aliases: ["tchad","chad"] },
    { code: "BF", demonym: {"fr":"Burkinabè","en":"Burkinabe","ar":"بوركينية"}, name: {"fr":"Burkina Faso","en":"Burkina Faso","ar":"بوركينا فاسو"}, aliases: ["burkina"] },
    { code: "BJ", demonym: {"fr":"Béninoise","en":"Beninese","ar":"بنينية"}, name: {"fr":"Bénin","en":"Benin","ar":"بنين"}, aliases: ["benin"] },
    { code: "TG", demonym: {"fr":"Togolaise","en":"Togolese","ar":"توغولية"}, name: {"fr":"Togo","en":"Togo","ar":"توغو"}, aliases: ["togo"] },
    { code: "GH", demonym: {"fr":"Ghanéenne","en":"Ghanaian","ar":"غانية"}, name: {"fr":"Ghana","en":"Ghana","ar":"غانا"}, aliases: ["ghana"] },
    { code: "LU", demonym: {"fr":"Luxembourgeoise","en":"Luxembourgish","ar":"لوكسمبورغية"}, name: {"fr":"Luxembourg","en":"Luxembourg","ar":"لوكسمبورغ"}, aliases: ["luxembourg"] },
    { code: "MC", demonym: {"fr":"Monégasque","en":"Monegasque","ar":"موناكية"}, name: {"fr":"Monaco","en":"Monaco","ar":"موناكو"}, aliases: ["monaco","monegasque"] },
    { code: "AD", demonym: {"fr":"Andorrane","en":"Andorran","ar":"أندورية"}, name: {"fr":"Andorre","en":"Andorra","ar":"أندورا"}, aliases: ["andorre","andorra"] },
    { code: "SM", demonym: {"fr":"Saint-Marinaise","en":"Sammarinese","ar":"سان مارينية"}, name: {"fr":"Saint-Marin","en":"San Marino","ar":"سان مارينو"}, aliases: ["saint-marin","san marino"] },
    { code: "IS", demonym: {"fr":"Islandaise","en":"Icelandic","ar":"آيسلندية"}, name: {"fr":"Islande","en":"Iceland","ar":"آيسلندا"}, aliases: ["islande","iceland"] },
    { code: "MT", demonym: {"fr":"Maltaise","en":"Maltese","ar":"مالطية"}, name: {"fr":"Malte","en":"Malta","ar":"مالطا"}, aliases: ["malte","malta"] },
    { code: "CY", demonym: {"fr":"Chypriote","en":"Cypriot","ar":"قبرصية"}, name: {"fr":"Chypre","en":"Cyprus","ar":"قبرص"}, aliases: ["chypre","cyprus"] },
    { code: "RS", demonym: {"fr":"Serbe","en":"Serbian","ar":"صربية"}, name: {"fr":"Serbie","en":"Serbia","ar":"صربيا"}, aliases: ["serbie","serbia"] },
    { code: "HR", demonym: {"fr":"Croate","en":"Croatian","ar":"كرواتية"}, name: {"fr":"Croatie","en":"Croatia","ar":"كرواتيا"}, aliases: ["croatie","croatia"] },
    { code: "SI", demonym: {"fr":"Slovène","en":"Slovenian","ar":"سلوفينية"}, name: {"fr":"Slovénie","en":"Slovenia","ar":"سلوفينيا"}, aliases: ["slovenie","slovenia"] },
    { code: "BA", demonym: {"fr":"Bosnienne","en":"Bosnian","ar":"بوسنية"}, name: {"fr":"Bosnie-Herzégovine","en":"Bosnia and Herzegovina","ar":"البوسنة والهرسك"}, aliases: ["bosnie","bosnia"] },
    { code: "ME", demonym: {"fr":"Monténégrine","en":"Montenegrin","ar":"مونتينيغرية"}, name: {"fr":"Monténégro","en":"Montenegro","ar":"الجبل الأسود"}, aliases: ["montenegro"] },
    { code: "MK", demonym: {"fr":"Macédonienne","en":"Macedonian","ar":"مقدونية"}, name: {"fr":"Macédoine du Nord","en":"North Macedonia","ar":"مقدونيا الشمالية"}, aliases: ["macedoine","macedonia"] },
    { code: "AL", demonym: {"fr":"Albanaise","en":"Albanian","ar":"ألبانية"}, name: {"fr":"Albanie","en":"Albania","ar":"ألبانيا"}, aliases: ["albanie","albania"] },
    { code: "BG", demonym: {"fr":"Bulgare","en":"Bulgarian","ar":"بلغارية"}, name: {"fr":"Bulgarie","en":"Bulgaria","ar":"بلغاريا"}, aliases: ["bulgarie","bulgaria"] },
    { code: "SK", demonym: {"fr":"Slovaque","en":"Slovak","ar":"سلوفاكية"}, name: {"fr":"Slovaquie","en":"Slovakia","ar":"سلوفاكيا"}, aliases: ["slovaquie","slovakia"] },
    { code: "EE", demonym: {"fr":"Estonienne","en":"Estonian","ar":"إستونية"}, name: {"fr":"Estonie","en":"Estonia","ar":"إستونيا"}, aliases: ["estonie","estonia"] },
    { code: "LV", demonym: {"fr":"Lettone","en":"Latvian","ar":"لاتفية"}, name: {"fr":"Lettonie","en":"Latvia","ar":"لاتفيا"}, aliases: ["lettonie","latvia"] },
    { code: "LT", demonym: {"fr":"Lituanienne","en":"Lithuanian","ar":"ليتوانية"}, name: {"fr":"Lituanie","en":"Lithuania","ar":"ليتوانيا"}, aliases: ["lituanie","lithuania"] },
    { code: "BY", demonym: {"fr":"Biélorusse","en":"Belarusian","ar":"بيلاروسية"}, name: {"fr":"Biélorussie","en":"Belarus","ar":"بيلاروسيا"}, aliases: ["bielorussie","belarus"] },
    { code: "MD", demonym: {"fr":"Moldave","en":"Moldovan","ar":"مولدوفية"}, name: {"fr":"Moldavie","en":"Moldova","ar":"مولدوفا"}, aliases: ["moldavie","moldova"] },
    { code: "GE", demonym: {"fr":"Géorgienne","en":"Georgian","ar":"جورجية"}, name: {"fr":"Géorgie","en":"Georgia","ar":"جورجيا"}, aliases: ["georgie","georgia"] },
    { code: "AM", demonym: {"fr":"Arménienne","en":"Armenian","ar":"أرمينية"}, name: {"fr":"Arménie","en":"Armenia","ar":"أرمينيا"}, aliases: ["armenie","armenia"] },
    { code: "AZ", demonym: {"fr":"Azerbaïdjanaise","en":"Azerbaijani","ar":"أذربيجانية"}, name: {"fr":"Azerbaïdjan","en":"Azerbaijan","ar":"أذربيجان"}, aliases: ["azerbaidjan","azerbaijan"] },
    { code: "KZ", demonym: {"fr":"Kazakhe","en":"Kazakhstani","ar":"كازاخستانية"}, name: {"fr":"Kazakhstan","en":"Kazakhstan","ar":"كازاخستان"}, aliases: ["kazakhstan"] },
    { code: "UZ", demonym: {"fr":"Ouzbèke","en":"Uzbek","ar":"أوزبكستانية"}, name: {"fr":"Ouzbékistan","en":"Uzbekistan","ar":"أوزبكستان"}, aliases: ["ouzbekistan","uzbekistan"] },
    { code: "TM", demonym: {"fr":"Turkmène","en":"Turkmen","ar":"تركمانستانية"}, name: {"fr":"Turkménistan","en":"Turkmenistan","ar":"تركمانستان"}, aliases: ["turkmenistan"] },
    { code: "KG", demonym: {"fr":"Kirghize","en":"Kyrgyzstani","ar":"قيرغيزستانية"}, name: {"fr":"Kirghizistan","en":"Kyrgyzstan","ar":"قيرغيزستان"}, aliases: ["kirghizistan","kyrgyzstan"] },
    { code: "TJ", demonym: {"fr":"Tadjike","en":"Tajikistani","ar":"طاجيكستانية"}, name: {"fr":"Tadjikistan","en":"Tajikistan","ar":"طاجيكستان"}, aliases: ["tadjikistan","tajikistan"] },
    { code: "IL", demonym: {"fr":"Israélienne","en":"Israeli","ar":"إسرائيلية"}, name: {"fr":"Israël","en":"Israel","ar":"إسرائيل"}, aliases: ["israel"] },
    { code: "PS", demonym: {"fr":"Palestinienne","en":"Palestinian","ar":"فلسطينية"}, name: {"fr":"Palestine","en":"Palestine","ar":"فلسطين"}, aliases: ["palestine"] },
    { code: "IR", demonym: {"fr":"Iranienne","en":"Iranian","ar":"إيرانية"}, name: {"fr":"Iran","en":"Iran","ar":"إيران"}, aliases: ["iran"] },
    { code: "AF", demonym: {"fr":"Afghane","en":"Afghan","ar":"أفغانية"}, name: {"fr":"Afghanistan","en":"Afghanistan","ar":"أفغانستان"}, aliases: ["afghanistan"] },
    { code: "BD", demonym: {"fr":"Bangladaise","en":"Bangladeshi","ar":"بنغلاديشية"}, name: {"fr":"Bangladesh","en":"Bangladesh","ar":"بنغلاديش"}, aliases: ["bangladesh"] },
    { code: "LK", demonym: {"fr":"Sri-Lankaise","en":"Sri Lankan","ar":"سريلانكية"}, name: {"fr":"Sri Lanka","en":"Sri Lanka","ar":"سريلانكا"}, aliases: ["sri lanka"] },
    { code: "NP", demonym: {"fr":"Népalaise","en":"Nepali","ar":"نيبالية"}, name: {"fr":"Népal","en":"Nepal","ar":"نيبال"}, aliases: ["nepal"] },
    { code: "MM", demonym: {"fr":"Birmane","en":"Burmese","ar":"ميانمارية"}, name: {"fr":"Birmanie","en":"Myanmar","ar":"ميانمار"}, aliases: ["birmanie","myanmar","burma"] },
    { code: "TH", demonym: {"fr":"Thaïlandaise","en":"Thai","ar":"تايلاندية"}, name: {"fr":"Thaïlande","en":"Thailand","ar":"تايلاند"}, aliases: ["thailande","thailand","siam"] },
    { code: "VN", demonym: {"fr":"Vietnamienne","en":"Vietnamese","ar":"فيتنامية"}, name: {"fr":"Vietnam","en":"Vietnam","ar":"فيتنام"}, aliases: ["vietnam"] },
    { code: "KH", demonym: {"fr":"Cambodgienne","en":"Cambodian","ar":"كمبودية"}, name: {"fr":"Cambodge","en":"Cambodia","ar":"كمبوديا"}, aliases: ["cambodge","cambodia"] },
    { code: "LA", demonym: {"fr":"Laotienne","en":"Lao","ar":"لاوسية"}, name: {"fr":"Laos","en":"Laos","ar":"لاوس"}, aliases: ["laos"] },
    { code: "MY", demonym: {"fr":"Malaisienne","en":"Malaysian","ar":"ماليزية"}, name: {"fr":"Malaisie","en":"Malaysia","ar":"ماليزيا"}, aliases: ["malaisie","malaysia"] },
    { code: "SG", demonym: {"fr":"Singapourienne","en":"Singaporean","ar":"سنغافورية"}, name: {"fr":"Singapour","en":"Singapore","ar":"سنغافورة"}, aliases: ["singapour","singapore"] },
    { code: "ID", demonym: {"fr":"Indonésienne","en":"Indonesian","ar":"إندونيسية"}, name: {"fr":"Indonésie","en":"Indonesia","ar":"إندونيسيا"}, aliases: ["indonesie","indonesia"] },
    { code: "PH", demonym: {"fr":"Philippine","en":"Filipino","ar":"فلبينية"}, name: {"fr":"Philippines","en":"Philippines","ar":"الفلبين"}, aliases: ["philippines","filipino"] },
    { code: "PE", demonym: {"fr":"Péruvienne","en":"Peruvian","ar":"بيروفية"}, name: {"fr":"Pérou","en":"Peru","ar":"بيرو"}, aliases: ["perou","peru"] },
    { code: "VE", demonym: {"fr":"Vénézuélienne","en":"Venezuelan","ar":"فنزويلية"}, name: {"fr":"Venezuela","en":"Venezuela","ar":"فنزويلا"}, aliases: ["venezuela"] },
    { code: "EC", demonym: {"fr":"Équatorienne","en":"Ecuadorian","ar":"إكوادورية"}, name: {"fr":"Équateur","en":"Ecuador","ar":"الإكوادور"}, aliases: ["equateur","ecuador"] },
    { code: "BO", demonym: {"fr":"Bolivienne","en":"Bolivian","ar":"بوليفية"}, name: {"fr":"Bolivie","en":"Bolivia","ar":"بوليفيا"}, aliases: ["bolivie","bolivia"] },
    { code: "PY", demonym: {"fr":"Paraguayenne","en":"Paraguayan","ar":"باراغوايانية"}, name: {"fr":"Paraguay","en":"Paraguay","ar":"باراغواي"}, aliases: ["paraguay"] },
    { code: "UY", demonym: {"fr":"Uruguayenne","en":"Uruguayan","ar":"أوروغوايانية"}, name: {"fr":"Uruguay","en":"Uruguay","ar":"أوروغواي"}, aliases: ["uruguay"] },
    { code: "CR", demonym: {"fr":"Costaricienne","en":"Costa Rican","ar":"كوستاريكية"}, name: {"fr":"Costa Rica","en":"Costa Rica","ar":"كوستاريكا"}, aliases: ["costa rica"] },
    { code: "PA", demonym: {"fr":"Panaméenne","en":"Panamanian","ar":"بنمية"}, name: {"fr":"Panama","en":"Panama","ar":"بنما"}, aliases: ["panama"] },
    { code: "CU", demonym: {"fr":"Cubaine","en":"Cuban","ar":"كوبية"}, name: {"fr":"Cuba","en":"Cuba","ar":"كوبا"}, aliases: ["cuba"] },
    { code: "DO", demonym: {"fr":"Dominicaine","en":"Dominican","ar":"دومينيكانية"}, name: {"fr":"République dominicaine","en":"Dominican Republic","ar":"جمهورية الدومينيكان"}, aliases: ["republique dominicaine","dominican republic"] },
    { code: "HT", demonym: {"fr":"Haïtienne","en":"Haitian","ar":"هايتية"}, name: {"fr":"Haïti","en":"Haiti","ar":"هايتي"}, aliases: ["haiti"] },
    { code: "JM", demonym: {"fr":"Jamaïcaine","en":"Jamaican","ar":"جامايكية"}, name: {"fr":"Jamaïque","en":"Jamaica","ar":"جامايكا"}, aliases: ["jamaique","jamaica"] },
    { code: "TT", demonym: {"fr":"Trinidadienne","en":"Trinidadian","ar":"ترينيدادية"}, name: {"fr":"Trinité-et-Tobago","en":"Trinidad and Tobago","ar":"ترينيداد وتوباغو"}, aliases: ["trinite-et-tobago","trinidad"] },
    { code: "KE", demonym: {"fr":"Kényane","en":"Kenyan","ar":"كينية"}, name: {"fr":"Kenya","en":"Kenya","ar":"كينيا"}, aliases: ["kenya"] },
    { code: "TZ", demonym: {"fr":"Tanzanienne","en":"Tanzanian","ar":"تنزانية"}, name: {"fr":"Tanzanie","en":"Tanzania","ar":"تنزانيا"}, aliases: ["tanzanie","tanzania"] },
    { code: "UG", demonym: {"fr":"Ougandaise","en":"Ugandan","ar":"أوغندية"}, name: {"fr":"Ouganda","en":"Uganda","ar":"أوغندا"}, aliases: ["ouganda","uganda"] },
    { code: "RW", demonym: {"fr":"Rwandaise","en":"Rwandan","ar":"رواندية"}, name: {"fr":"Rwanda","en":"Rwanda","ar":"رواندا"}, aliases: ["rwanda"] },
    { code: "ET", demonym: {"fr":"Éthiopienne","en":"Ethiopian","ar":"إثيوبية"}, name: {"fr":"Éthiopie","en":"Ethiopia","ar":"إثيوبيا"}, aliases: ["ethiopie","ethiopia"] },
    { code: "SO", demonym: {"fr":"Somalienne","en":"Somali","ar":"صومالية"}, name: {"fr":"Somalie","en":"Somalia","ar":"الصومال"}, aliases: ["somalie","somalia"] },
    { code: "DJ", demonym: {"fr":"Djiboutienne","en":"Djiboutian","ar":"جيبوتية"}, name: {"fr":"Djibouti","en":"Djibouti","ar":"جيبوتي"}, aliases: ["djibouti"] },
    { code: "KM", demonym: {"fr":"Comorienne","en":"Comorian","ar":"قمريّة"}, name: {"fr":"Comores","en":"Comoros","ar":"جزر القمر"}, aliases: ["comores","comoros"] },
    { code: "MG", demonym: {"fr":"Malgache","en":"Malagasy","ar":"مدغشقرية"}, name: {"fr":"Madagascar","en":"Madagascar","ar":"مدغشقر"}, aliases: ["madagascar","malgache"] },
    { code: "MU", demonym: {"fr":"Mauricienne","en":"Mauritian","ar":"موريشيوسية"}, name: {"fr":"Maurice","en":"Mauritius","ar":"موريشيوس"}, aliases: ["maurice","mauritius"] },
    { code: "SC", demonym: {"fr":"Seychelloise","en":"Seychellois","ar":"سيشيلية"}, name: {"fr":"Seychelles","en":"Seychelles","ar":"سيشل"}, aliases: ["seychelles"] },
    { code: "NA", demonym: {"fr":"Namibienne","en":"Namibian","ar":"ناميبية"}, name: {"fr":"Namibie","en":"Namibia","ar":"ناميبيا"}, aliases: ["namibie","namibia"] },
    { code: "BW", demonym: {"fr":"Botswanaise","en":"Motswana","ar":"بوتسوانية"}, name: {"fr":"Botswana","en":"Botswana","ar":"بوتسوانا"}, aliases: ["botswana"] },
    { code: "ZM", demonym: {"fr":"Zambienne","en":"Zambian","ar":"زامبية"}, name: {"fr":"Zambie","en":"Zambia","ar":"زامبيا"}, aliases: ["zambie","zambia"] },
    { code: "ZW", demonym: {"fr":"Zimbabwéenne","en":"Zimbabwean","ar":"زيمبابوية"}, name: {"fr":"Zimbabwe","en":"Zimbabwe","ar":"زيمبابوي"}, aliases: ["zimbabwe"] },
    { code: "AO", demonym: {"fr":"Angolaise","en":"Angolan","ar":"أنغولية"}, name: {"fr":"Angola","en":"Angola","ar":"أنغولا"}, aliases: ["angola"] },
    { code: "MZ", demonym: {"fr":"Mozambicaine","en":"Mozambican","ar":"موزمبيقية"}, name: {"fr":"Mozambique","en":"Mozambique","ar":"موزمبيق"}, aliases: ["mozambique"] },
    { code: "MV", demonym: {"fr":"Maldivienne","en":"Maldivian","ar":"مالديفية"}, name: {"fr":"Maldives","en":"Maldives","ar":"المالديف"}, aliases: ["maldives","maldivian","maldivienne"] },
    { code: "BN", demonym: {"fr":"Brunéienne","en":"Bruneian","ar":"بروناوية"}, name: {"fr":"Brunei","en":"Brunei","ar":"بروناي"}, aliases: ["brunei","bruneian"] },
    { code: "BT", demonym: {"fr":"Bhoutanaise","en":"Bhutanese","ar":"بوتانية"}, name: {"fr":"Bhoutan","en":"Bhutan","ar":"بوتان"}, aliases: ["bhoutan","bhutan"] },
    { code: "MN", demonym: {"fr":"Mongole","en":"Mongolian","ar":"منغولية"}, name: {"fr":"Mongolie","en":"Mongolia","ar":"منغوليا"}, aliases: ["mongolie","mongolia"] },
    { code: "BS", demonym: {"fr":"Bahaméenne","en":"Bahamian","ar":"باهامية"}, name: {"fr":"Bahamas","en":"Bahamas","ar":"جزر البهاما"}, aliases: ["bahamas","bahamian"] },
    { code: "BB", demonym: {"fr":"Barbadienne","en":"Barbadian","ar":"باربادوسية"}, name: {"fr":"Barbade","en":"Barbados","ar":"باربادوس"}, aliases: ["barbade","barbados"] },
    { code: "BZ", demonym: {"fr":"Bélizienne","en":"Belizean","ar":"بليزية"}, name: {"fr":"Belize","en":"Belize","ar":"بليز"}, aliases: ["belize"] },
    { code: "GY", demonym: {"fr":"Guyanienne","en":"Guyanese","ar":"غيانية"}, name: {"fr":"Guyana","en":"Guyana","ar":"غيانا"}, aliases: ["guyana"] },
    { code: "SR", demonym: {"fr":"Surinamaise","en":"Surinamese","ar":"سورينامية"}, name: {"fr":"Suriname","en":"Suriname","ar":"سورينام"}, aliases: ["suriname"] },
    { code: "FJ", demonym: {"fr":"Fidjienne","en":"Fijian","ar":"فيجية"}, name: {"fr":"Fidji","en":"Fiji","ar":"فيجي"}, aliases: ["fidji","fiji"] },
    { code: "PG", demonym: {"fr":"Papouasienne","en":"Papua New Guinean","ar":"بابوا غينيا الجديدة"}, name: {"fr":"Papouasie-Nouvelle-Guinée","en":"Papua New Guinea","ar":"بابوا غينيا الجديدة"}, aliases: ["papouasie","papua"] },
    { code: "VU", demonym: {"fr":"Vanuatuane","en":"Ni-Vanuatu","ar":"فانواتية"}, name: {"fr":"Vanuatu","en":"Vanuatu","ar":"فانواتو"}, aliases: ["vanuatu"] },
    { code: "WS", demonym: {"fr":"Samoane","en":"Samoan","ar":"ساموية"}, name: {"fr":"Samoa","en":"Samoa","ar":"ساموا"}, aliases: ["samoa"] },
    { code: "TO", demonym: {"fr":"Tongienne","en":"Tongan","ar":"تونغية"}, name: {"fr":"Tonga","en":"Tonga","ar":"تونغا"}, aliases: ["tonga"] },
    { code: "SB", demonym: {"fr":"Salomonienne","en":"Solomon Islander","ar":"جزر سليمان"}, name: {"fr":"Îles Salomon","en":"Solomon Islands","ar":"جزر سليمان"}, aliases: ["salomon","solomon"] },
    { code: "FM", demonym: {"fr":"Micronésienne","en":"Micronesian","ar":"ميكرونيزية"}, name: {"fr":"Micronésie","en":"Micronesia","ar":"ولايات ميكرونيسيا المتحدة"}, aliases: ["micronesie","micronesia"] },
    { code: "PW", demonym: {"fr":"Palaosienne","en":"Palauan","ar":"بالاوية"}, name: {"fr":"Palaos","en":"Palau","ar":"بالاو"}, aliases: ["palaos","palau"] },
    { code: "MH", demonym: {"fr":"Marshallaise","en":"Marshallese","ar":"مارشالية"}, name: {"fr":"Îles Marshall","en":"Marshall Islands","ar":"جزر مارشال"}, aliases: ["marshall"] },
    { code: "KI", demonym: {"fr":"Kiribatienne","en":"I-Kiribati","ar":"كيريباتية"}, name: {"fr":"Kiribati","en":"Kiribati","ar":"كيريباتي"}, aliases: ["kiribati"] },
    { code: "NR", demonym: {"fr":"Nauruane","en":"Nauruan","ar":"ناورونية"}, name: {"fr":"Nauru","en":"Nauru","ar":"ناورو"}, aliases: ["nauru"] },
    { code: "TV", demonym: {"fr":"Tuvaluane","en":"Tuvaluan","ar":"توفالوية"}, name: {"fr":"Tuvalu","en":"Tuvalu","ar":"توفالو"}, aliases: ["tuvalu"] },
    { code: "CV", demonym: {"fr":"Cap-Verdienne","en":"Cape Verdean","ar":"رأس أخضرية"}, name: {"fr":"Cap-Vert","en":"Cape Verde","ar":"الرأس الأخضر"}, aliases: ["cap-vert","cape verde"] },
    { code: "ST", demonym: {"fr":"Santoméenne","en":"São Toméan","ar":"ساو تومية"}, name: {"fr":"Sao Tomé-et-Principe","en":"Sao Tome and Principe","ar":"ساو تومي وبرينسيب"}, aliases: ["sao tome","sao tome-et-principe"] },
    { code: "GQ", demonym: {"fr":"Équato-Guinéenne","en":"Equatorial Guinean","ar":"غينية استوائية"}, name: {"fr":"Guinée équatoriale","en":"Equatorial Guinea","ar":"غينيا الاستوائية"}, aliases: ["guinee equatoriale","equatorial guinea"] },
    { code: "GW", demonym: {"fr":"Bissau-Guinéenne","en":"Bissau-Guinean","ar":"غينيا بيساو"}, name: {"fr":"Guinée-Bissau","en":"Guinea-Bissau","ar":"غينيا بيساو"}, aliases: ["guinee-bissau","guinea-bissau"] },
    { code: "SL", demonym: {"fr":"Sierra-Léonaise","en":"Sierra Leonean","ar":"سيراليونية"}, name: {"fr":"Sierra Leone","en":"Sierra Leone","ar":"سيراليون"}, aliases: ["sierra leone"] },
    { code: "LR", demonym: {"fr":"Libérienne","en":"Liberian","ar":"ليبيرية"}, name: {"fr":"Liberia","en":"Liberia","ar":"ليبيريا"}, aliases: ["liberia"] },
    { code: "CF", demonym: {"fr":"Centrafricaine","en":"Central African","ar":"وسط أفريقية"}, name: {"fr":"République centrafricaine","en":"Central African Republic","ar":"جمهورية أفريقيا الوسطى"}, aliases: ["centrafrique","central african republic"] },
    { code: "SS", demonym: {"fr":"Sud-Soudanaise","en":"South Sudanese","ar":"جنوب سودانية"}, name: {"fr":"Soudan du Sud","en":"South Sudan","ar":"جنوب السودان"}, aliases: ["soudan du sud","south sudan"] },
    { code: "ER", demonym: {"fr":"Érythréenne","en":"Eritrean","ar":"إريترية"}, name: {"fr":"Érythrée","en":"Eritrea","ar":"إريتريا"}, aliases: ["erythree","eritrea"] },
    { code: "BI", demonym: {"fr":"Burundaise","en":"Burundian","ar":"بوروندية"}, name: {"fr":"Burundi","en":"Burundi","ar":"بوروندي"}, aliases: ["burundi"] },
    { code: "MW", demonym: {"fr":"Malawienne","en":"Malawian","ar":"مالاوية"}, name: {"fr":"Malawi","en":"Malawi","ar":"مالاوي"}, aliases: ["malawi"] },
    { code: "LS", demonym: {"fr":"Lésothienne","en":"Basotho","ar":"ليسوتوية"}, name: {"fr":"Lesotho","en":"Lesotho","ar":"ليسوتو"}, aliases: ["lesotho"] },
    { code: "SZ", demonym: {"fr":"Swazie","en":"Swazi","ar":"سوازية"}, name: {"fr":"Eswatini","en":"Eswatini","ar":"إسواتيني"}, aliases: ["eswatini","swaziland"] },
    { code: "LI", demonym: {"fr":"Liechtensteinoise","en":"Liechtensteiner","ar":"ليختنشتاينية"}, name: {"fr":"Liechtenstein","en":"Liechtenstein","ar":"ليختنشتاين"}, aliases: ["liechtenstein"] },
    { code: "VA", demonym: {"fr":"Vaticane","en":"Vatican","ar":"فاتيكانية"}, name: {"fr":"Vatican","en":"Vatican City","ar":"الفاتيكان"}, aliases: ["vatican"] },
    { code: "AG", demonym: {"fr":"Antiguaise","en":"Antiguan","ar":"أنتيغوية"}, name: {"fr":"Antigua-et-Barbuda","en":"Antigua and Barbuda","ar":"أنتيغوا وبربودا"}, aliases: ["antigua"] },
    { code: "DM", demonym: {"fr":"Dominiquaise","en":"Dominican","ar":"دومينيكية"}, name: {"fr":"Dominique","en":"Dominica","ar":"دومينيكا"}, aliases: ["dominique","dominica"] },
    { code: "GD", demonym: {"fr":"Grenadienne","en":"Grenadian","ar":"غرينادية"}, name: {"fr":"Grenade","en":"Grenada","ar":"غرينادا"}, aliases: ["grenade","grenada"] },
    { code: "KN", demonym: {"fr":"Kittitienne","en":"Kittitian","ar":"سانت كيتسية"}, name: {"fr":"Saint-Christophe-et-Niévès","en":"Saint Kitts and Nevis","ar":"سانت كيتس ونيفيس"}, aliases: ["saint-kitts","st kitts"] },
    { code: "LC", demonym: {"fr":"Sainte-Lucienne","en":"Saint Lucian","ar":"سانت لوسية"}, name: {"fr":"Sainte-Lucie","en":"Saint Lucia","ar":"سانت لوسيا"}, aliases: ["sainte-lucie","st lucia"] },
    { code: "VC", demonym: {"fr":"Vincentienne","en":"Vincentian","ar":"سانت فنسنتية"}, name: {"fr":"Saint-Vincent-et-les-Grenadines","en":"Saint Vincent and the Grenadines","ar":"سانت فنسنت والغرينادين"}, aliases: ["saint-vincent","st vincent"] },
    { code: "TL", demonym: {"fr":"Est-Timoraise","en":"East Timorese","ar":"تيمورية شرقية"}, name: {"fr":"Timor oriental","en":"East Timor","ar":"تيمور الشرقية"}, aliases: ["timor","timor-leste","east timor"] },
    { code: "KP", demonym: {"fr":"Nord-Coréenne","en":"North Korean","ar":"كورية شمالية"}, name: {"fr":"Corée du Nord","en":"North Korea","ar":"كوريا الشمالية"}, aliases: ["coree du nord","north korea"] },
    { code: "HK", demonym: {"fr":"Hongkongaise","en":"Hong Konger","ar":"هونغ كونغية"}, name: {"fr":"Hong Kong","en":"Hong Kong","ar":"هونغ كونغ"}, aliases: ["hong kong","hong-kong"] },
    { code: "MO", demonym: {"fr":"Macaïenne","en":"Macanese","ar":"ماكاوية"}, name: {"fr":"Macao","en":"Macau","ar":"ماكاو"}, aliases: ["macao","macau"] },
    { code: "TW", demonym: {"fr":"Taïwanaise","en":"Taiwanese","ar":"تايوانية"}, name: {"fr":"Taïwan","en":"Taiwan","ar":"تايوان"}, aliases: ["taiwan","taipei"] },
    { code: "PR", demonym: {"fr":"Portoricaine","en":"Puerto Rican","ar":"بورتوريكية"}, name: {"fr":"Porto Rico","en":"Puerto Rico","ar":"بورتوريكو"}, aliases: ["puerto rico","porto rico"] },
    { code: "GF", demonym: {"fr":"Guyanaise","en":"French Guianese","ar":"غويانية فرنسية"}, name: {"fr":"Guyane française","en":"French Guiana","ar":"غويانا الفرنسية"}, aliases: ["guyane","guyane francaise"] },
    { code: "GP", demonym: {"fr":"Guadeloupéenne","en":"Guadeloupean","ar":"غوادلوبية"}, name: {"fr":"Guadeloupe","en":"Guadeloupe","ar":"غوادلوب"}, aliases: ["guadeloupe"] },
    { code: "MQ", demonym: {"fr":"Martiniquaise","en":"Martinican","ar":"مارتينيكية"}, name: {"fr":"Martinique","en":"Martinique","ar":"مارتينيك"}, aliases: ["martinique"] },
    { code: "RE", demonym: {"fr":"Réunionnaise","en":"Reunionese","ar":"ريونيونية"}, name: {"fr":"La Réunion","en":"Reunion","ar":"لا ريونيون"}, aliases: ["reunion","la reunion"] },
    { code: "YT", demonym: {"fr":"Mahoraise","en":"Mahoran","ar":"مايوتية"}, name: {"fr":"Mayotte","en":"Mayotte","ar":"مايوت"}, aliases: ["mayotte"] },
    { code: "NC", demonym: {"fr":"Néo-Calédonienne","en":"New Caledonian","ar":"كاليدونية جديدة"}, name: {"fr":"Nouvelle-Calédonie","en":"New Caledonia","ar":"كاليدونيا الجديدة"}, aliases: ["nouvelle-caledonie","new caledonia"] },
    { code: "PF", demonym: {"fr":"Polynésienne","en":"French Polynesian","ar":"بولينيزية فرنسية"}, name: {"fr":"Polynésie française","en":"French Polynesia","ar":"بولينيزيا الفرنسية"}, aliases: ["polynesie","tahiti"] },
    { code: "GL", demonym: {"fr":"Groenlandaise","en":"Greenlandic","ar":"غرينلاندية"}, name: {"fr":"Groenland","en":"Greenland","ar":"غرينلاند"}, aliases: ["groenland","greenland"] },
    { code: "FO", demonym: {"fr":"Féroïenne","en":"Faroese","ar":"فاروية"}, name: {"fr":"Îles Féroé","en":"Faroe Islands","ar":"جزر فارو"}, aliases: ["feroe","faroe"] },
    { code: "GI", demonym: {"fr":"Gibraltarienne","en":"Gibraltarian","ar":"جبل طارقية"}, name: {"fr":"Gibraltar","en":"Gibraltar","ar":"جبل طارق"}, aliases: ["gibraltar"] },
    { code: "BM", demonym: {"fr":"Bermudienne","en":"Bermudian","ar":"برمودية"}, name: {"fr":"Bermudes","en":"Bermuda","ar":"برمودا"}, aliases: ["bermudes","bermuda"] },
    { code: "KY", demonym: {"fr":"Caïmanaise","en":"Caymanian","ar":"كايمانية"}, name: {"fr":"Îles Caïmans","en":"Cayman Islands","ar":"جزر كايمان"}, aliases: ["caimans","cayman"] },
    { code: "AW", demonym: {"fr":"Arubaise","en":"Aruban","ar":"أروبية"}, name: {"fr":"Aruba","en":"Aruba","ar":"أروبا"}, aliases: ["aruba"] },
    { code: "CW", demonym: {"fr":"Curaçaoane","en":"Curacaoan","ar":"كوراساوية"}, name: {"fr":"Curaçao","en":"Curacao","ar":"كوراساو"}, aliases: ["curacao"] },
    { code: "IM", demonym: {"fr":"Mannoise","en":"Manx","ar":"مانكسية"}, name: {"fr":"Île de Man","en":"Isle of Man","ar":"جزيرة مان"}, aliases: ["man","isle of man","ile de man"] },
    { code: "JE", demonym: {"fr":"Jersiaise","en":"Channel Islander","ar":"جيرزية"}, name: {"fr":"Jersey","en":"Jersey","ar":"جيرزي"}, aliases: ["jersey"] },
    { code: "GG", demonym: {"fr":"Guernesiaise","en":"Channel Islander","ar":"غيرنزية"}, name: {"fr":"Guernesey","en":"Guernsey","ar":"غيرنزي"}, aliases: ["guernesey","guernsey"] },
    { code: "SX", demonym: {"fr":"Saint-Martinoise","en":"Sint Maarten","ar":"سانت مارتينية"}, name: {"fr":"Saint-Martin (Pays-Bas)","en":"Sint Maarten","ar":"سينت مارتن"}, aliases: ["sint maarten","saint-martin"] },
    { code: "MF", demonym: {"fr":"Saint-Martinoise","en":"Saint-Martinoise","ar":"سانت مارتينية"}, name: {"fr":"Saint-Martin (France)","en":"Saint Martin","ar":"سانت مارتن الفرنسية"}, aliases: ["saint martin","saint-martin"] },
    { code: "BL", demonym: {"fr":"Barthéloméenne","en":"Barthélemois","ar":"بارثيلمية"}, name: {"fr":"Saint-Barthélemy","en":"Saint Barthélemy","ar":"سان بارتيلمي"}, aliases: ["saint-barthelemy","st barts"] },
    { code: "PM", demonym: {"fr":"Saint-Pierraise","en":"Saint-Pierrais","ar":"سان بييرية"}, name: {"fr":"Saint-Pierre-et-Miquelon","en":"Saint Pierre and Miquelon","ar":"سان بيير وميكلون"}, aliases: ["saint-pierre","saint-pierre-et-miquelon"] },
    { code: "WF", demonym: {"fr":"Wallisienne","en":"Wallisian","ar":"واليسية"}, name: {"fr":"Wallis-et-Futuna","en":"Wallis and Futuna","ar":"واليس وفوتونا"}, aliases: ["wallis","wallis-et-futuna"] },
    { code: "TC", demonym: {"fr":"Turquoise","en":"Turks and Caicos Islander","ar":"تيركسية وكايكوسية"}, name: {"fr":"Îles Turques-et-Caïques","en":"Turks and Caicos Islands","ar":"جزر توركس وكايكوس"}, aliases: ["turks and caicos","turques-et-caiques"] },
    { code: "MS", demonym: {"fr":"Montserratienne","en":"Montserratian","ar":"مونتسيراتية"}, name: {"fr":"Montserrat","en":"Montserrat","ar":"مونتسرات"}, aliases: ["montserrat"] },
    { code: "AI", demonym: {"fr":"Anguillane","en":"Anguillan","ar":"أنغويلية"}, name: {"fr":"Anguilla","en":"Anguilla","ar":"أنغويلا"}, aliases: ["anguilla"] },
    { code: "VG", demonym: {"fr":"Vierge britannique","en":"British Virgin Islander","ar":"جزر العذراء البريطانية"}, name: {"fr":"Îles Vierges britanniques","en":"British Virgin Islands","ar":"جزر العذراء البريطانية"}, aliases: ["bvi","virgin islands","vierges britanniques"] },
    { code: "VI", demonym: {"fr":"Vierge des États-Unis","en":"U.S. Virgin Islander","ar":"جزر العذراء الأمريكية"}, name: {"fr":"Îles Vierges des États-Unis","en":"U.S. Virgin Islands","ar":"جزر العذراء الأمريكية"}, aliases: ["usvi","vierges americaines"] },
    { code: "FK", demonym: {"fr":"Falklandaise","en":"Falkland Islander","ar":"فوكلاندية"}, name: {"fr":"Îles Malouines","en":"Falkland Islands","ar":"جزر فوكلاند"}, aliases: ["falkland","malouines"] },
    { code: "SH", demonym: {"fr":"Sainte-Hélène","en":"Saint Helenian","ar":"سانت هيلانية"}, name: {"fr":"Sainte-Hélène","en":"Saint Helena","ar":"سانت هيلانة"}, aliases: ["saint helena","sainte-helene"] },
    { code: "NU", demonym: {"fr":"Niouéenne","en":"Niuean","ar":"نيوية"}, name: {"fr":"Niue","en":"Niue","ar":"نييوي"}, aliases: ["niue"] },
    { code: "CK", demonym: {"fr":"Cookienne","en":"Cook Islander","ar":"جزر كوك"}, name: {"fr":"Îles Cook","en":"Cook Islands","ar":"جزر كوك"}, aliases: ["cook islands","iles cook"] },
    { code: "TK", demonym: {"fr":"Tokelauane","en":"Tokelauan","ar":"توكلوية"}, name: {"fr":"Tokelau","en":"Tokelau","ar":"توكيلاو"}, aliases: ["tokelau"] },
    { code: "AS", demonym: {"fr":"Samoane américaine","en":"American Samoan","ar":"ساموية أمريكية"}, name: {"fr":"Samoa américaines","en":"American Samoa","ar":"ساموا الأمريكية"}, aliases: ["american samoa","samoa americaines"] },
    { code: "GU", demonym: {"fr":"Guamanienne","en":"Guamanian","ar":"غوامية"}, name: {"fr":"Guam","en":"Guam","ar":"غوام"}, aliases: ["guam"] },
    { code: "MP", demonym: {"fr":"Mariannaise","en":"Northern Mariana Islander","ar":"ماريانية شمالية"}, name: {"fr":"Îles Mariannes du Nord","en":"Northern Mariana Islands","ar":"جزر ماريانا الشمالية"}, aliases: ["mariannes","mariana"] },
    { code: "EH", demonym: {"fr":"Sahraouie","en":"Sahrawi","ar":"صحراوية"}, name: {"fr":"Sahara occidental","en":"Western Sahara","ar":"الصحراء الغربية"}, aliases: ["sahara occidental","western sahara"] },
    { code: "BQ", demonym: {"fr":"Caribéenne néerlandaise","en":"Dutch Caribbean","ar":"كاريبية هولندية"}, name: {"fr":"Pays-Bas caribéens","en":"Caribbean Netherlands","ar":"الجزر الكاريبية الهولندية"}, aliases: ["bonaire","saba","saint-eustache"] },
  ];

  function cuNormalizeText(s) {
    return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  }

  function cuMatchNationality(val, opts = {}) {
    if (!val) return null;
    const raw = String(val).trim();
    if (!raw) return null;
    const upper = raw.toUpperCase();
    const byCode = cuNationalities.find((n) => n.code === upper);
    if (byCode) return byCode.code;

    const needle = cuNormalizeText(raw);
    if (!needle) return null;

    const exact = cuNationalities.filter((n) => {
      if (n.code.toLowerCase() === needle) return true;
      if (cuNormalizeText(n.demonym.fr) === needle) return true;
      if (cuNormalizeText(n.demonym.en) === needle) return true;
      if (cuNormalizeText(n.demonym.ar) === needle) return true;
      if (cuNormalizeText(n.name.fr) === needle) return true;
      if (cuNormalizeText(n.name.en) === needle) return true;
      if (cuNormalizeText(n.name.ar) === needle) return true;
      return (n.aliases || []).some((a) => cuNormalizeText(a) === needle);
    });
    if (exact.length === 1) return exact[0].code;
    if (exact.length > 1) return null;

    if (opts && opts.allowPrefix) {
      const prefixMatches = cuNationalities.filter((n) => {
        if (n.demonym.fr && cuNormalizeText(n.demonym.fr).startsWith(needle)) return true;
        if (n.demonym.en && cuNormalizeText(n.demonym.en).startsWith(needle)) return true;
        if (n.name.fr && cuNormalizeText(n.name.fr).startsWith(needle)) return true;
        if (n.name.en && cuNormalizeText(n.name.en).startsWith(needle)) return true;
        return (n.aliases || []).some((a) => cuNormalizeText(a).startsWith(needle));
      });
      if (prefixMatches.length === 1) return prefixMatches[0].code;
    }

    return null;
  }

  function cuNationalityLabel(code, l) {
    if (!code) return '';
    const lang = l || cuLang() || 'fr';
    const item = cuNationalities.find((n) => n.code === code.toUpperCase());
    if (!item) return code;
    return item.demonym[lang] || item.demonym.fr || item.demonym.en || item.name[lang] || item.name.fr || code;
  }

  function cuNationalitySelectorHtml(g, idx, prefix = '', disabled = false) {
    const raw = g?.nationality || '';
    const matched = cuMatchNationality(raw);
    const isLegacyUnmatched = !!raw && !matched;
    const canonicalCode = matched || (isLegacyUnmatched ? raw : '');
    const displayLabel = matched ? cuNationalityLabel(matched) : (isLegacyUnmatched ? raw : '');
    const uid = 'nat_' + (prefix || 'gst_') + idx + '_' + Math.random().toString(36).slice(2, 8);
    const inputId = uid + '_inp';
    const menuId = uid + '_menu';

    return `
      <div class="hx-nat-combobox" data-hx-nat-box id="${uid}">
        <input type="hidden" data-hx-guest-nationality value="${esc(canonicalCode)}">
        <div class="hx-nat-input-wrap">
          <input type="text" id="${inputId}" class="hx-nat-search" data-hx-nat-search autocomplete="off" placeholder="${tx('Rechercher une nationalité…')}" value="${esc(displayLabel)}" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="${menuId}" aria-haspopup="listbox" ${disabled ? 'disabled' : ''}>
          <button type="button" class="hx-nat-clear" data-hx-nat-clear aria-label="${tx('Effacer la sélection')}" ${displayLabel && !disabled ? '' : 'hidden'}>&times;</button>
        </div>
        <div id="${menuId}" class="hx-nat-menu" data-hx-nat-menu role="listbox" aria-label="${tx('Nationalités')}" hidden></div>
        ${isLegacyUnmatched ? `
          <div class="hx-nat-legacy-alert" data-hx-nat-legacy role="status">
            <span class="hx-badge-legacy">${tx('Valeur existante à vérifier : « {v} »', { v: esc(raw) })}</span>
            ${!disabled ? `<button type="button" class="hx-link-btn" data-hx-nat-clear-legacy>${tx('Corriger')}</button>` : ''}
          </div>
        ` : ''}
      </div>
    `;
  }

  function cuWireNationalitySelectors(container) {
    if (!container) return;
    const boxes = container.querySelectorAll('[data-hx-nat-box]');
    boxes.forEach((box) => {
      if (box.__hxWired) return;
      box.__hxWired = true;
      const hidden = box.querySelector('[data-hx-guest-nationality]');
      const search = box.querySelector('[data-hx-nat-search]');
      const clear = box.querySelector('[data-hx-nat-clear]');
      const menu = box.querySelector('[data-hx-nat-menu]');
      const legacy = box.querySelector('[data-hx-nat-legacy]');
      const legacyBtn = box.querySelector('[data-hx-nat-clear-legacy]');
      const menuId = menu?.id || ('hx_nat_menu_' + Math.random().toString(36).slice(2, 8));
      if (menu && !menu.id) menu.id = menuId;

      let activeIndex = -1;

      const updateActiveDescendant = (items) => {
        items.forEach((it, i) => {
          const isAct = i === activeIndex;
          it.classList.toggle('is-selected', isAct);
          it.setAttribute('aria-selected', isAct ? 'true' : 'false');
          if (isAct) {
            search.setAttribute('aria-activedescendant', it.id);
            it.scrollIntoView({ block: 'nearest' });
          }
        });
        if (activeIndex < 0) {
          search.removeAttribute('aria-activedescendant');
        }
      };

      const renderMenu = (items) => {
        if (!items.length) {
          menu.innerHTML = `<div class="hx-nat-empty" role="none">${tx('Aucune nationalité correspondante')}</div>`;
          menu.hidden = false;
          search.setAttribute('aria-expanded', 'true');
          activeIndex = -1;
          search.removeAttribute('aria-activedescendant');
          return;
        }
        const lang = cuLang();
        menu.innerHTML = items.slice(0, 40).map((n, idx) => `
          <div class="hx-nat-item" role="option" id="${menuId}_opt_${idx}" data-idx="${idx}" data-code="${esc(n.code)}" aria-selected="false" tabindex="-1">
            <div class="hx-nat-item-main">
              <span class="hx-nat-item-code">${esc(n.code)}</span>
              <span class="hx-nat-item-label">${esc(n.demonym[lang] || n.demonym.fr || n.code)}</span>
            </div>
            <span class="hx-nat-item-name">${esc(n.name[lang] || n.name.fr || n.code)}</span>
          </div>
        `).join('');
        menu.hidden = false;
        search.setAttribute('aria-expanded', 'true');
        activeIndex = -1;
        search.removeAttribute('aria-activedescendant');
      };

      const filterList = (query) => {
        const q = cuNormalizeText(query);
        if (!q) return cuNationalities;
        return cuNationalities.filter((n) => {
          if (n.code.toLowerCase().includes(q)) return true;
          if (cuNormalizeText(n.demonym.fr).includes(q)) return true;
          if (cuNormalizeText(n.demonym.en).includes(q)) return true;
          if (cuNormalizeText(n.demonym.ar).includes(q)) return true;
          if (cuNormalizeText(n.name.fr).includes(q)) return true;
          if (cuNormalizeText(n.name.en).includes(q)) return true;
          if (cuNormalizeText(n.name.ar).includes(q)) return true;
          return (n.aliases || []).some((a) => cuNormalizeText(a).includes(q));
        });
      };

      const selectCode = (code) => {
        const item = cuNationalities.find((n) => n.code === code);
        if (!item) return;
        hidden.value = item.code;
        search.value = cuNationalityLabel(item.code);
        search.classList.remove('is-invalid');
        clear.hidden = false;
        menu.hidden = true;
        search.setAttribute('aria-expanded', 'false');
        search.removeAttribute('aria-activedescendant');
        activeIndex = -1;
        if (legacy) legacy.remove();
        search.dispatchEvent(new Event('change', { bubbles: true }));
      };

      search.addEventListener('input', () => {
        const q = search.value.trim();
        clear.hidden = !q;
        search.classList.remove('is-invalid');
        // Immediately decouple canonical hidden input when user edits search text
        // to prevent silent submission of prior country:
        if (hidden.value) {
          const currentLabel = cuNationalityLabel(hidden.value);
          if (cuNormalizeText(currentLabel) !== cuNormalizeText(q)) {
            hidden.value = '';
          }
        }
        search.removeAttribute('aria-activedescendant');
        renderMenu(filterList(q));
      });

      search.addEventListener('focus', () => {
        renderMenu(filterList(search.value));
      });

      search.addEventListener('keydown', (e) => {
        const items = menu.querySelectorAll('.hx-nat-item');
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          if (menu.hidden) { renderMenu(filterList(search.value)); return; }
          activeIndex = Math.min(activeIndex + 1, items.length - 1);
          updateActiveDescendant(items);
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          if (menu.hidden) return;
          activeIndex = Math.max(activeIndex - 1, 0);
          updateActiveDescendant(items);
        } else if (e.key === 'Enter') {
          if (!menu.hidden && activeIndex >= 0 && items[activeIndex]) {
            e.preventDefault();
            selectCode(items[activeIndex].dataset.code);
          }
        } else if (e.key === 'Tab') {
          if (!menu.hidden && activeIndex >= 0 && items[activeIndex]) {
            selectCode(items[activeIndex].dataset.code);
          } else {
            menu.hidden = true;
            search.setAttribute('aria-expanded', 'false');
            search.removeAttribute('aria-activedescendant');
          }
        } else if (e.key === 'Escape') {
          menu.hidden = true;
          search.setAttribute('aria-expanded', 'false');
          search.removeAttribute('aria-activedescendant');
          activeIndex = -1;
        }
      });

      menu.addEventListener('mousedown', (e) => {
        const item = e.target.closest('.hx-nat-item');
        if (item && item.dataset.code) {
          e.preventDefault();
          selectCode(item.dataset.code);
        }
      });

      clear.addEventListener('click', (e) => {
        e.preventDefault();
        hidden.value = '';
        search.value = '';
        search.classList.remove('is-invalid');
        clear.hidden = true;
        menu.hidden = true;
        search.setAttribute('aria-expanded', 'false');
        search.removeAttribute('aria-activedescendant');
        activeIndex = -1;
        if (legacy) legacy.remove();
        search.focus();
        search.dispatchEvent(new Event('change', { bubbles: true }));
      });

      if (legacyBtn) {
        legacyBtn.addEventListener('click', (e) => {
          e.preventDefault();
          hidden.value = '';
          search.value = '';
          search.classList.remove('is-invalid');
          clear.hidden = true;
          legacy.remove();
          search.focus();
          renderMenu(cuNationalities);
          search.dispatchEvent(new Event('change', { bubbles: true }));
        });
      }

      document.addEventListener('click', (e) => {
        if (!box.contains(e.target)) {
          menu.hidden = true;
          search.setAttribute('aria-expanded', 'false');
          search.removeAttribute('aria-activedescendant');
          activeIndex = -1;
          const currentCode = hidden.value;
          if (currentCode) {
            const matched = cuMatchNationality(currentCode);
            if (matched) {
              search.value = cuNationalityLabel(matched);
              search.classList.remove('is-invalid');
            }
          } else {
            const txt = search.value.trim();
            if (txt) {
              const matched = cuMatchNationality(txt);
              if (matched) {
                selectCode(matched);
              } else {
                search.classList.add('is-invalid');
              }
            } else {
              search.value = '';
              clear.hidden = true;
              search.classList.remove('is-invalid');
            }
          }
        }
      });
    });
  }

  function cuStayEditor(booking, linked = null) {
    const st = cuState(), types = cuTypes(), rooms = Object.values(st.rooms || {}).sort((a, b) => a.n - b.n);
    if (!types.length || !rooms.length) { toast(tx('Configurez vos chambres d’abord'), { type: 'warn' }); return; }
    const statusLabels = { requested: tx('Demandée'), confirmed: tx('Confirmée'), checked_in: tx('Client arrivé'), completed: tx('Terminée'), cancelled: tx('Annulée'), no_show: tx('No-show') };
    const nextStatuses = {
      requested: ['requested', 'confirmed', 'no_show'],
      confirmed: ['confirmed', 'checked_in', 'no_show'],
      checked_in: ['checked_in', 'completed'],
      completed: ['completed'], cancelled: ['cancelled'], no_show: ['no_show'],
    };
    const currentStatus = booking?.status || 'confirmed';
    const statusChoices = booking ? (nextStatuses[currentStatus] || [currentStatus]) : ['requested', 'confirmed', 'checked_in'];
    const today = new (globalThis.KiwiZoneLaw?.DateTimeFormat || Intl.DateTimeFormat)('en-CA', { timeZone: 'Africa/Casablanca', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const add = (ymd, n) => { const d = new Date(ymd + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
    const typeId = booking?.serviceId || types[0].id;
    const existingGuests = Array.isArray(booking?.guests) && booking.guests.length ? booking.guests : (
      booking?.customer?.name ? [{ name: booking.customer.name, sex: '', nationality: '', residenceCountry: '', birthDate: '', idDocType: '', idDocNumber: '', minorsUnder18: 0 }] : [{ name: '', sex: '', nationality: '', residenceCountry: '', birthDate: '', idDocType: '', idDocNumber: '', minorsUnder18: 0 }]
    );
    const guestRowHtml = (g, idx) => `
      <div class="hx-guest-item" data-hx-guest-row data-hx-guest-id="${esc(g.id || ('gst_' + crypto.randomUUID().slice(0, 12)))}">
        <div class="hx-guest-head">
          <span>${tx('VOYAGEUR {n}', { n: idx + 1 })}</span>
          ${idx > 0 ? `<button type="button" class="hx-link-btn hx-guest-remove" data-action="hx-remove-guest-row">${tx('Retirer')}</button>` : ''}
        </div>
        <div class="hx-guest-grid">
          <label><span>${tx('Nom complet')}</span><input data-hx-guest-name placeholder="${tx('Nom et prénom')}" value="${esc(g.name || '')}"></label>
          <label><span>${tx('Sexe')}</span><select data-hx-guest-sex>
            <option value="">${tx('Indéterminé')}</option>
            <option value="M" ${g.sex === 'M' ? 'selected' : ''}>${tx('Masculin (M)')}</option>
            <option value="F" ${g.sex === 'F' ? 'selected' : ''}>${tx('Féminin (F)')}</option>
          </select></label>
          <label><span>${tx('Nationalité')}</span>${cuNationalitySelectorHtml(g, idx)}</label>
          <label><span>${tx('Date de naissance')}</span><input data-hx-guest-birth inputmode="numeric" autocomplete="off" maxlength="10" dir="ltr" placeholder="${tx('JJ/MM/AAAA')}" value="${esc(cuBirthDisplay(g.birthDate))}"></label>
          <label><span>${tx('Mineurs accompagnants')}</span><input type="number" min="0" max="10" step="1" data-hx-guest-minors value="${esc(g.minorsUnder18 || 0)}"></label>
          <label><span>${tx('Pays de résidence')}</span><input data-hx-guest-residence placeholder="${tx('Ex. Maroc, France')}" value="${esc(g.residenceCountry || '')}"></label>
          <label><span>${tx('Type de pièce')}</span><select data-hx-guest-id-type>
            <option value="">${tx('Sélectionner')}</option>
            <option value="CNIE" ${g.idDocType === 'CNIE' ? 'selected' : ''}>${tx('CNIE (Maroc)')}</option>
            <option value="passeport" ${g.idDocType === 'passeport' ? 'selected' : ''}>${tx('Passeport')}</option>
            <option value="carte_sejour" ${g.idDocType === 'carte_sejour' ? 'selected' : ''}>${tx('Carte de séjour')}</option>
            <option value="autre" ${g.idDocType === 'autre' ? 'selected' : ''}>${tx('Autre pièce')}</option>
          </select></label>
          <label><span>${tx('N° de document')}</span><input data-hx-guest-id-num dir="ltr" placeholder="${tx('Ex. AB123456')}" value="${esc(g.idDocNumber || '')}"></label>
        </div>
      </div>
    `;
    const m = K().modal({ tag: booking ? booking.code || tx('SÉJOUR') : tx('NOUVEAU SÉJOUR'), title: booking ? tx('Modifier la réservation') : tx('Ajouter une réservation'), desc: tx('La chambre est contrôlée et bloquée côté serveur avant confirmation.'), width: 720,
      body: `<form class="hx-stay-form" data-hx-stay-form>
        ${linked ? `<p class="hx-commercial-stay">${tx('Nouvelle chambre du dossier {code}. Sa disponibilité, ses voyageurs et son annulation restent indépendants.', { code: esc(linked.code) })}</p>` : ''}
        ${booking ? `<div class="hx-room-form-actions"><button type="button" class="hx-btn ghost" data-action="hx-dossier" data-arg="${esc(booking.id)}">${tx('Chambres & facturation du dossier')}</button></div>` : ''}
        <div class="hx-room-form hx-type-form">
          <label class="hx-room-form-wide"><span>${tx('Nom du client')}</span><input name="name" maxlength="100" required value="${esc(booking?.customer?.name || '')}" placeholder="${tx('Nom et prénom')}"></label>
          <label><span>${tx('Arrivée')}</span><input name="checkIn" type="date" required value="${esc(booking?.hotel?.checkIn || today)}"></label>
          <label><span>${tx('Départ')}</span><input name="checkOut" type="date" required value="${esc(booking?.hotel?.checkOut || add(today, 1))}"></label>
          <label class="hx-room-form-wide"><span>${tx('Type de séjour')}</span><select name="stayMode" ${booking ? 'disabled' : ''}><option value="overnight">${tx('Avec nuitée')}</option><option value="day_use" ${booking?.hotel?.dayUse ? 'selected' : ''}>${tx('Day-use · sans nuitée')}</option></select></label>
          <label data-hx-day-use hidden><span>${tx('Heure d’arrivée')}</span><input name="arrivalTime" type="time" value="${esc(booking?.hotel?.arrivalTime || '09:00')}"></label>
          <label data-hx-day-use hidden><span>${tx('Heure de départ')}</span><input name="departureTime" type="time" value="${esc(booking?.hotel?.departureTime || '18:00')}"></label>
          <label data-hx-day-use hidden><span>${tx('Forfait day-use TTC · MAD')}</span><input name="dayUsePrice" inputmode="decimal" placeholder="${tx('Montant convenu')}" value="${booking?.hotel?.dayUse ? (booking.hotel.total || 0).toFixed(2) : ''}"></label>
          <label><span>${tx('Catégorie')}</span><select name="roomTypeId">${types.map((t) => `<option value="${esc(t.id)}" ${t.id === typeId ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></label>
          <label><span>${tx('Chambre')}</span><select name="resourceId"><option value="">${tx('Attribution automatique')}</option>${rooms.map((r) => `<option value="${esc(r.id)}" data-type="${esc(r.typeId)}" ${r.id === booking?.resourceId ? 'selected' : ''}>${tx('Ch. {n}', { n: r.n })} · ${esc(roomTypeOf(r.n).name)}</option>`).join('')}</select></label>
          <label><span>${tx('Canal')}</span><select name="channel"><option value="direct">${tx('Direct')}</option><option value="booking">Booking.com</option><option value="airbnb">Airbnb</option><option value="expedia">Expedia</option><option value="walkin">${tx('Walk-in')}</option><option value="other">${tx('Autre OTA')}</option></select></label>
          <label><span>${tx('Statut')}</span><select name="status">${statusChoices.map((value) => `<option value="${value}">${statusLabels[value]}</option>`).join('')}</select></label>
          <label><span>${tx('Voyageurs')}</span><input name="partySize" type="number" min="1" max="12" value="${booking?.partySize || 1}"><small class="hx-capacity-hint" data-hx-capacity-hint></small></label>
          <label><span>${tx('Référence OTA')} <small>· ${tx('optionnel')}</small></span><input name="externalRef" maxlength="80" dir="ltr" value="${esc(booking?.hotel?.externalRef || '')}" placeholder="${tx('Ex. 4219-8840')}"></label>
          <label><span>${tx('Téléphone')} <small>· ${tx('optionnel')}</small></span><input name="phone" maxlength="32" dir="ltr" value="${esc(booking?.customer?.phone || '')}"></label>
          <label><span>${tx('E-mail')} <small>· ${tx('optionnel')}</small></span><input name="email" type="email" maxlength="160" dir="ltr" value="${esc(booking?.customer?.email || '')}"></label>
          <fieldset class="hx-room-form-wide hx-commercial-stay" data-hx-commercial-stay><legend>${tx('Compte & formule de réservation')}</legend><p role="status">${tx('Chargement des comptes…')}</p></fieldset>
          <div class="hx-room-form-wide hx-guest-block">
            <div class="hx-guest-block-head">
              <b>${tx('Fiche voyageurs · identité et séjour')}</b>
              <button type="button" class="hx-link-btn hx-guest-add" data-action="hx-add-guest-row">+ ${tx('Ajouter un voyageur')}</button>
            </div>
            <div data-hx-guests-container>
              ${existingGuests.map(guestRowHtml).join('')}
            </div>
          </div>
          <label class="hx-room-form-wide"><span>${tx('Note interne')}</span><textarea name="note" maxlength="600" rows="3">${esc(booking?.note || '')}</textarea></label>
        </div><p class="hx-stay-error" data-hx-stay-error role="status"></p><div class="hx-room-form-actions">${booking && ['requested', 'confirmed'].includes(booking.status) ? `<button type="button" class="hx-btn warn" data-action="hx-stay-cancel" data-arg="${esc(booking.id)}">${tx('Annuler le séjour')}</button>` : '<span></span>'}<button class="hx-btn atlas" type="submit">${booking ? tx('Enregistrer les modifications') : (booking?.status === 'requested' ? tx('Poser une option (bloquer la chambre)') : tx('Confirmer la réservation'))}</button></div>
      </form>` });
    const form = m.el.querySelector('[data-hx-stay-form]');
    form.__hxStayScope = cuStayScope();
    form.__hxClientRef = booking?.publicRef || ('staff-' + crypto.randomUUID());
    form.__hxLinkedStayId = linked?.id || '';
    if (linked) {
      ['checkIn','checkOut'].forEach(k => { form.elements[k].value = linked.hotel[k]; });
      ['name','phone','email'].forEach(k => { form.elements[k].value = linked.customer?.[k] || ''; });
      if (linked.hotel.dayUse) form.elements.stayMode.value = 'day_use';
    }
    const submitBtn = form.querySelector('[type="submit"]');
    const updateSubmitButton = () => {
      if (booking) {
        submitBtn.textContent = tx('Enregistrer les modifications');
        return;
      }
      const val = form.elements.status?.value;
      if (val === 'requested') {
        submitBtn.textContent = tx('Poser une option (bloquer la chambre)');
      } else {
        submitBtn.textContent = tx('Confirmer la réservation');
      }
    };
    form.elements.status.addEventListener('change', updateSubmitButton);
    updateSubmitButton();

    let capacityMsg = '';
    const updateCapacityValidation = () => {
      const selectedTypeId = form.elements.roomTypeId.value;
      const typeObj = types.find(t => t.id === selectedTypeId);
      const maxGuests = typeObj?.maxGuests || 4;
      form.elements.partySize.max = maxGuests;
      const hint = form.querySelector('[data-hx-capacity-hint]');
      if (hint) hint.textContent = tx('Capacité max : {n} pers.', { n: maxGuests });
      const currentParty = Number(form.elements.partySize.value) || 1;
      const err = form.querySelector('[data-hx-stay-error]');
      if (currentParty > maxGuests) {
        capacityMsg = tx('La catégorie « {name} » ne peut pas accueillir {n} personnes (max : {max}). Réduisez le nombre de personnes.', { name: typeObj?.name || selectedTypeId, n: currentParty, c: txn(currentParty, 'personne'), max: maxGuests });
        if (err) err.textContent = capacityMsg;
        submitBtn.disabled = true;
      } else {
        // Cleared by identity, not by its words: it is no longer French under English or Arabic.
        if (err && capacityMsg && err.textContent === capacityMsg) err.textContent = '';
        capacityMsg = '';
        submitBtn.disabled = false;
      }
    };
    form.elements.roomTypeId.addEventListener('change', updateCapacityValidation);
    form.elements.partySize.addEventListener('input', updateCapacityValidation);
    updateCapacityValidation();

    const toggleDayUse = () => {
      const day = form.elements.stayMode.value === 'day_use';
      form.querySelectorAll('[data-hx-day-use]').forEach(el => { el.hidden = !day; });
      form.elements.checkOut.readOnly = day;
      if (day) form.elements.checkOut.value = form.elements.checkIn.value;
      else if (form.elements.checkOut.value <= form.elements.checkIn.value) form.elements.checkOut.value = add(form.elements.checkIn.value, 1);
      form.elements.dayUsePrice.required = day;
      if (day && form.elements.priceMode) { form.elements.priceMode.value = 'catalogue'; form.elements.board.value = 'room_only'; }
      if (form.elements.priceMode) form.elements.priceMode.disabled = day;
      if (form.elements.board) form.elements.board.disabled = day;
      const quoteButton = form.querySelector('[data-hx-quote]'); if (quoteButton) quoteButton.hidden = day || !form.elements.accountId?.value;
    };
    form.elements.stayMode.addEventListener('change', toggleDayUse);
    form.elements.checkIn.addEventListener('change', toggleDayUse); toggleDayUse();
    // A stay typed at the desk is direct unless staff pick an OTA; an older stay with no channel stays « Autre OTA ».
    form.elements.channel.value = booking?.hotel?.channel || (!booking || booking.source === 'public' ? 'direct' : 'other');
    form.elements.status.value = booking?.status || 'confirmed';
    updateSubmitButton();
    const filterRooms = () => { const selected = form.elements.resourceId.value; Array.from(form.elements.resourceId.options).forEach((o, i) => { if (!i) return; o.hidden = o.dataset.type !== form.elements.roomTypeId.value; }); if (selected && form.elements.resourceId.selectedOptions[0]?.hidden) form.elements.resourceId.value = ''; };
    form.elements.roomTypeId.addEventListener('change', filterRooms); filterRooms();
    form.addEventListener('click', (e) => {
      if (e.target.closest('[data-action="hx-add-guest-row"]')) {
        const c = form.querySelector('[data-hx-guests-container]');
        if (c) {
          const count = c.querySelectorAll('[data-hx-guest-row]').length;
          const wrap = document.createElement('div');
          wrap.innerHTML = guestRowHtml({}, count);
          const newRow = wrap.firstElementChild;
          c.appendChild(newRow);
          cuWireNationalitySelectors(newRow);
        }
      } else if (e.target.closest('[data-action="hx-remove-guest-row"]')) {
        const row = e.target.closest('[data-hx-guest-row]');
        if (row) row.remove();
      }
    });
    form.addEventListener('submit', (e) => { e.preventDefault(); cuSubmitStay(form, booking, m); });
    cuWireStayCommercial(form, booking).then(() => { toggleDayUse(); if (typeof Event === 'function' && typeof form.dispatchEvent === 'function') form.dispatchEvent(new Event('hx-refresh-direct')); });
    cuWireNationalitySelectors(form);
    openModal = { el: m.el, close: m.close };
  }

  const cuDraftMoney = n => (window.KiwiNumber?.format((n / 100), {minimumFractionDigits:2,maximumFractionDigits:2}) ?? (n / 100).toLocaleString(document.documentElement?.lang === 'en' ? 'en-GB' : 'fr-FR', {minimumFractionDigits:2,maximumFractionDigits:2}));
  const cuDraftStatus = v => ({requested:tx('Demandée'),confirmed:tx('Confirmée'),checked_in:tx('En séjour'),completed:tx('Terminée'),cancelled:tx('Annulée'),no_show:tx('Non présenté')})[v] || v;
  function cuDraftRoom(id) { return window.__kiwiHotelInternal.part('folio').cuDraftRoom.apply(this, arguments); }
  function cuBillingLine(l, payers) { return window.__kiwiHotelInternal.part('folio').cuBillingLine.apply(this, arguments); }
  function cuDossierRooms(data) { return window.__kiwiHotelInternal.part('folio').cuDossierRooms.apply(this, arguments); }
  /* A billing breakage hides no room: the dossier lists its rooms with a
   * targeted reason instead of the blanket "indisponible", and the money form
   * is withheld until the stay data is repaired. Ticket #0003. */
  function cuBillingBlocked(code) { return window.__kiwiHotelInternal.part('folio').cuBillingBlocked.apply(this, arguments); }
  function cuBillingBody(data) { return window.__kiwiHotelInternal.part('folio').cuBillingBody.apply(this, arguments); }
  function cuDraftInput(form, extras) { return window.__kiwiHotelInternal.part('folio').cuDraftInput.apply(this, arguments); }
  function cuPrintDraft(saved) { return window.__kiwiHotelInternal.part('folio').cuPrintDraft.apply(this, arguments); }
  async function cuOpenDossier(booking) {
    const scope=cuStayScope(),merchant=cuChannelMerchant(),id=booking.hotel.dossierId||booking.id;
    openModal?.close?.();
    const m=K().modal({tag:booking.code || tx('DOSSIER'),title:tx('Chambres & préfacture'),desc:tx('Les chambres restent modifiables et annulables séparément.'),width:1080,
      body:`<div class="hx-room-form-actions"><button type="button" class="hx-btn ghost" data-hx-linked-room>${tx('Ajouter une chambre au dossier')}</button></div><div data-hx-dossier-body role="status">${tx('Chargement du dossier serveur…')}</div>`});
    openModal={el:m.el,close:m.close};
    const host=m.el.querySelector('[data-hx-dossier-body]');
    m.el.querySelector('[data-hx-linked-room]').onclick=()=>{m.close();if(scope===cuStayScope())cuStayEditor(null,booking);};
    try{
      const res=await fetch('/api/hotel/billing-draft?'+new URLSearchParams({merchant,dossierId:id})),data=await res.json().catch(()=>({}));
      if(scope!==cuStayScope()||m.el.isConnected===false)return;
      if(!res.ok){
        const code=data?.error;
        if(code==='dossier-not-found')throw new Error(tx('Dossier introuvable. Actualisez la réception puis rouvrez-le.'));
        if(code==='unauthorized')throw new Error(tx('Session expirée. Reconnectez-vous puis rouvrez le dossier.'));
        if(code==='invalid-dossier')throw new Error(tx('Dossier illisible. Actualisez la réception.'));
        throw new Error(tx('Préfacturation indisponible. Aucune donnée comptable n’a été modifiée.'));
      }
      host.innerHTML=cuBillingBody(data); host.removeAttribute('role');
      const error=host.querySelector('[data-hx-billing-error],[data-hx-dossier-error]');
      host.querySelectorAll('[data-hx-open-stay]').forEach(button=>button.onclick=async()=>{
        if(scope!==cuStayScope()){m.close();return;}
        const response=await fetch('/api/hotel/stays?'+new URLSearchParams({merchant,id:button.dataset.hxOpenStay,includeCancelled:'1'}));
        const body=await response.json();if(scope!==cuStayScope())return;
        const stay=body.stays?.find(b=>b.id===button.dataset.hxOpenStay);
        if(!response.ok||!stay){if(error)error.textContent=tx('Séjour introuvable. Actualisez la réception.');return;}
        cuStayCache().set(stay.id,stay);m.close();cuStayEditor(stay);
      });
      const form=host.querySelector('[data-hx-billing-form]');
      if(form){
      const formError=form.querySelector('[data-hx-billing-error]');
      let extras=data.stale?[]:(data.saved?.input?.extras||[]),pending=null,dirty=false;
      const dirtyNow=()=>{dirty=true;pending=null;form.querySelector('[data-hx-print-draft]').disabled=true;};
      const summary=()=>{
        try{
          const input=cuDraftInput(form,extras),totals=new Map();
          input.allocations.forEach(a=>a.parts.forEach(p=>totals.set(p.payer,(totals.get(p.payer)||0)+p.amountCents)));
          form.querySelector('[data-hx-billing-summary]').innerHTML=[...totals].map(([payer,amount])=>`<span>${esc(data.source.payers.find(p=>p.id===payer)?.name||tx('Payeur'))} <b>${ltr(cuDraftMoney(amount) + ' MAD')}</b></span>`).join('');
          host.querySelector('[data-hx-draft-total]').textContent=cuDraftMoney([...totals.values()].reduce((a,b)=>a+b,0))+' MAD';
          error.textContent='';
        }catch(e){error.textContent=e.message;}
      };
      form.addEventListener('input',()=>{dirtyNow();summary();}); form.addEventListener('change',()=>{dirtyNow();summary();});
      host.querySelector('[data-hx-reset-draft]')?.addEventListener('click',()=>{form.querySelector('fieldset').disabled=false;dirtyNow();error.textContent=tx('Les anciens suppléments et répartitions seront remplacés uniquement après enregistrement.');});
      form.querySelector('[data-hx-add-extra]').onclick=()=>{
        const raw=form.elements.extraPrice.value.trim().replace(',','.'),quantity=Number(form.elements.extraQuantity.value),label=form.elements.extraLabel.value.trim(),date=form.elements.extraDate.value;
        if(!label||!date||!/^\d{1,7}(\.\d{1,2})?$/.test(raw)||!Number.isInteger(quantity)||quantity<1||quantity>10000){error.textContent=tx('Complétez la date, le libellé, la quantité et le prix du supplément.');return;}
        const e={id:'ex-'+crypto.randomUUID(),date,label,quantity,unitCents:Math.round(Number(raw)*100),payer:data.source.payers.find(p=>p.kind==='individual')?.id||data.source.payers[0]?.id};
        extras.push(e);const wrap=document.createElement('div');wrap.innerHTML=cuBillingLine({...e,id:'extra:'+e.id,kind:'extra',amountCents:e.unitCents*quantity},data.source.payers);
        form.querySelector('[data-hx-billing-lines]').appendChild(wrap.firstElementChild);dirtyNow();summary();form.elements.extraLabel.value='';
      };
      form.addEventListener('click',e=>{const button=e.target.closest('[data-hx-remove-extra]');if(!button)return;const row=button.closest('[data-hx-billing-line]');extras=extras.filter(x=>'extra:'+x.id!==row.dataset.hxBillingLine);row.remove();dirtyNow();summary();});
      form.querySelector('[data-hx-print-draft]').onclick=()=>{if(scope===cuStayScope()&&!dirty&&data.saved)cuPrintDraft(data.saved);};
      form.onsubmit=async e=>{
        e.preventDefault();if(form.__saving||scope!==cuStayScope())return;
        try{
          const input=cuDraftInput(form,extras);
          pending ||= {action:'save-draft',merchant,dossierId:id,rev:data.rev,sourceDigest:data.sourceDigest,directoryRev:data.directoryRev,commandId:'draft-'+crypto.randomUUID(),input};
          form.__saving=true;form.querySelector('fieldset').disabled=true;error.textContent=tx('Enregistrement serveur…');
          const response=await fetch('/api/hotel/billing-draft',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(pending)}),body=await response.json();
          if(scope!==cuStayScope())return;
          if(!response.ok)throw new Error(body.error==='draft-stale'?tx('Le dossier ou ses comptes ont changé. Rouvrez-le pour vérifier les prix avant enregistrement.'):(['billing-quote-mismatch','billing-bad-status','billing-bad-stay','billing-bad-dates','directory-unreadable'].includes(body.error)?cuBillingBlocked(body.error):tx('Enregistrement refusé. Vérifiez les montants et les payeurs.')));
          data.saved=body.saved;data.rev=body.rev;pending=null;dirty=false;form.querySelector('[data-hx-print-draft]').disabled=false;
          error.textContent=tx('Préfacture enregistrée. Aucun paiement ni facture fiscale créé.');
        }catch(e){error.textContent=e.message||tx('Réponse non reçue. Réessayez sans modifier les champs pour conserver la même référence.');}
        finally{form.__saving=false;form.querySelector('fieldset').disabled=false;}
      };
      }
    }catch(e){host.textContent=e.message||tx('Dossier indisponible.');}
  }

  function cuParseDelimitedLine(line) {
    const parts = [];
    let current = '';
    let inQuotes = false;
    let i = 0;
    const len = line.length;
    while (i < len) {
      const c = line[i];
      if (inQuotes) {
        if (c === '"') {
          if (i + 1 < len && line[i + 1] === '"') {
            current += '"';
            i += 2;
            continue;
          } else {
            inQuotes = false;
            i++;
            continue;
          }
        } else {
          current += c;
          i++;
        }
      } else {
        if (c === '"') {
          inQuotes = true;
          i++;
        } else if (c === ',' || c === '\t' || c === ';') {
          parts.push(current.trim());
          current = '';
          i++;
        } else {
          current += c;
          i++;
        }
      }
    }
    parts.push(current.trim());
    return parts;
  }

  function cuHasGroupRecovery() {
    const merchant = cuMerchantSlug();
    if (!merchant) return false;
    try {
      const staged = JSON.parse(localStorage.getItem('kiwi:hotel-group-staged:' + merchant) || 'null');
      if (staged && staged.merchant === merchant) return true;
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key || !key.startsWith('kiwi_hx_intent_')) continue;
        const intent = JSON.parse(localStorage.getItem(key) || 'null');
        if (intent && intent.merchant === merchant && intent.status !== 'complete') return true;
      }
    } catch (_) {}
    return false;
  }

  async function cuGroupReservationModal(options = {}) {
    const resume = options.resume === true;
    const initialScope = cuStayScope();
    const initialMerchant = cuMerchantSlug();
    const initialCache = cuStayCache();
    const st = cuState(), types = cuTypes(), allRooms = Object.values(st.rooms || {}).sort((a, b) => a.n - b.n);
    if (!types.length || !allRooms.length) { toast(tx('Configurez vos chambres d’abord'), { type: 'warn' }); return; }
    await cuLoadCommercial();
    if (initialScope !== cuStayScope() || initialMerchant !== cuMerchantSlug()) return;
    const commState = cuCommercialState();
    const today = new (globalThis.KiwiZoneLaw?.DateTimeFormat || Intl.DateTimeFormat)('en-CA', { timeZone: 'Africa/Casablanca', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const add = (ymd, n) => { const d = new Date(ymd + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
    const tomorrow = add(today, 1);

    const stagedKey = 'kiwi:hotel-group-staged:' + initialMerchant;
    let staged = null;
    if (resume) {
      try {
        staged = JSON.parse(localStorage.getItem(stagedKey) || 'null');
      } catch (_) {}
    }
    if (!staged || staged.merchant !== initialMerchant) staged = null;
    /* Ticket #0007 · a stale staged draft must never wedge "new reservation".
     * The staged cache is UI progress only (server truth is untouched), so a
     * draft pointing at deleted rooms, an archived account or impossible
     * dates is dropped and the modal opens blank instead of frozen. */
    const stagedUsable = (s) => {
      if (!s || typeof s !== 'object') return false;
      if (s.checkIn && !/^\d{4}-\d{2}-\d{2}$/.test(s.checkIn)) return false;
      if (s.checkOut && !/^\d{4}-\d{2}-\d{2}$/.test(s.checkOut)) return false;
      if (s.checkIn && s.checkOut && s.checkOut <= s.checkIn) return false;
      const roomIds = new Set(allRooms.map((r) => r.id));
      if (Array.isArray(s.selectedRoomIds) && s.selectedRoomIds.some((id) => !roomIds.has(id))) return false;
      if (Array.isArray(s.travelers) && s.travelers.some((t) => t && t.roomId && !roomIds.has(t.roomId))) return false;
      if (s.accountId) {
        const accounts = (commState && commState.accounts) || [];
        if (accounts.length && !accounts.some((a) => a && a.id === s.accountId && !a.archived)) return false;
      }
      return true;
    };
    if (staged && !stagedUsable(staged)) {
      try { localStorage.removeItem(stagedKey); } catch (_) {}
      staged = null;
    }

    // ── Durable submission intent, v2 (defect 2) ──────────────────────────
    // kiwi_hx_intent_<dossier> is the ONE authoritative recovery record: it
    // carries the frozen terms, the exact per-room payloads attempted (with
    // their stable clientRef identities), the quote position and a status.
    // The staged draft (kiwi:hotel-group-staged:) stays a UI/progress cache;
    // whenever both exist and disagree, the unresolved intent wins for the
    // dossier it covers, and the merge is said out loud. v1 records (terms
    // only, no rooms) are honoured for their terms and ignored for anything
    // else. Proven local progress (savedRooms with server answers in hand)
    // always outranks an unknown-outcome intent for ANOTHER dossier — that
    // intent simply surfaces again once this dossier is done or discarded.
    const INTENT_VERSION = 2;
    const intentKeyFor = (dossierId) => 'kiwi_hx_intent_' + dossierId;
    const readIntent = (dossierId) => {
      try {
        const raw = JSON.parse(localStorage.getItem(intentKeyFor(dossierId)) || 'null');
        if (!raw || raw.merchant !== initialMerchant || raw.dossierId !== dossierId) return null;
        return raw;
      } catch (_) { return null; }
    };
    const readAnyUnresolvedIntent = () => {
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (!key || !key.startsWith('kiwi_hx_intent_')) continue;
          let raw = null;
          try { raw = JSON.parse(localStorage.getItem(key) || 'null'); } catch (_) { continue; }
          if (raw && raw.merchant === initialMerchant && raw.status !== 'complete') return raw;
        }
      } catch (_) {}
      return null;
    };
    const writeIntent = (record) => {
      // Throws on quota/denied storage: the caller must stop before any
      // booking write when the authoritative record cannot be persisted.
      localStorage.setItem(intentKeyFor(record.dossierId), JSON.stringify(record));
    };

    const pendingIntent = resume ? readAnyUnresolvedIntent() : null;
    const draftSavedCount = (staged && staged.savedRooms) ? Object.keys(staged.savedRooms).length : 0;
    // Adopt the in-flight dossier only when this draft holds no proven rooms.
    const adoptIntent = !!(pendingIntent && pendingIntent.dossierId
      && (!staged || staged.dossierId !== pendingIntent.dossierId)
      && draftSavedCount === 0);
    let intentNotice = '';
    if (pendingIntent && pendingIntent.dossierId && (!staged || staged.dossierId !== pendingIntent.dossierId) && !adoptIntent) {
      intentNotice = 'other-pending';
    }
    if (adoptIntent) {
      staged = null;
      intentNotice = 'adopted';
    }
    // Terms of the adopted intent (same dossier, or newly adopted dossier).
    const intentTerms = (pendingIntent && (adoptIntent || (staged && staged.dossierId === pendingIntent.dossierId)) && pendingIntent.terms && typeof pendingIntent.terms === 'object')
      ? { ...pendingIntent.terms }
      : null;
    const intentRooms = (pendingIntent && (adoptIntent || (staged && staged.dossierId === pendingIntent.dossierId)) && Array.isArray(pendingIntent.rooms))
      ? pendingIntent.rooms.filter(r => r && r.roomId && allRooms.some((room) => room.id === r.roomId))
      : [];
    const intentTravelers = (pendingIntent && (adoptIntent || (staged && staged.dossierId === pendingIntent.dossierId)) && Array.isArray(pendingIntent.travelers) && pendingIntent.travelers.length)
      ? pendingIntent.travelers
      : null;

    let groupDossierId = (staged && staged.dossierId)
      ? staged.dossierId
      : ((pendingIntent && adoptIntent)
        ? pendingIntent.dossierId
        : ('grp_' + Date.now() + '_' + crypto.randomUUID().slice(0, 8)));

    let savedRooms = (staged && staged.savedRooms) ? staged.savedRooms : {};
    let failedRooms = (staged && staged.failedRooms) ? staged.failedRooms : {};
    let quoteBreakdown = (staged && staged.quoteBreakdown) ? staged.quoteBreakdown : {};
    let quoteRevision = (staged && staged.quoteRevision != null) ? staged.quoteRevision : null;
    let quoteAccepted = !!(staged && staged.quoteAccepted && staged.quoteBreakdown && Object.keys(staged.quoteBreakdown).length > 0);
    if (!staged && pendingIntent && adoptIntent) {
      quoteBreakdown = (pendingIntent.quoteBreakdown && typeof pendingIntent.quoteBreakdown === 'object') ? { ...pendingIntent.quoteBreakdown } : {};
      quoteRevision = (pendingIntent.quoteRevision != null) ? pendingIntent.quoteRevision : null;
      quoteAccepted = !!(pendingIntent.quoteAccepted && Object.keys(quoteBreakdown).length > 0);
    }
    // Frozen dossier terms (defect 1): once any room is saved, dates, account,
    // meal plan, channel and group/contact identity are locked in the DOM and
    // every later submit reads them from here — never from disabled controls
    // that FormData silently drops. Intent terms (an actual attempt) outrank
    // the draft cache.
    let committedTerms = (staged && staged.committedTerms && typeof staged.committedTerms === 'object')
      ? { ...staged.committedTerms }
      : null;
    if (!committedTerms && intentTerms) committedTerms = { ...intentTerms };
    // Per-room commercial directory revision captured with each accepted quote
    // (defect 4): a quote is only submittable when every room was priced under
    // the single revision the group was reviewed with.
    let quoteRevs = (staged && staged.quoteRevs && typeof staged.quoteRevs === 'object')
      ? { ...staged.quoteRevs }
      : {};
    if (!staged && pendingIntent && adoptIntent && pendingIntent.quoteRevs && typeof pendingIntent.quoteRevs === 'object') {
      quoteRevs = { ...pendingIntent.quoteRevs };
    }

    const selectedRoomIds = new Set(
      (staged && Array.isArray(staged.selectedRoomIds) && staged.selectedRoomIds.length)
        ? staged.selectedRoomIds
        : []
    );
    for (const r of intentRooms) selectedRoomIds.add(r.roomId);

    let travelers = (staged && Array.isArray(staged.travelers) && staged.travelers.length)
      ? staged.travelers
      : (intentTravelers
        ? JSON.parse(JSON.stringify(intentTravelers))
        : [{ id: 'gst_' + crypto.randomUUID().slice(0, 12), name: '', sex: '', nationality: '', residenceCountry: '', birthDate: '', idDocType: '', idDocNumber: '', roomId: '' }]);

    const it = intentTerms || {};
    const initialGroupName = (staged && staged.groupName) || it.groupName || '';
    const initialCheckIn = (staged && staged.checkIn) || it.checkIn || today;
    const initialCheckOut = (staged && staged.checkOut) || it.checkOut || tomorrow;
    const initialContactName = (staged && staged.contactName) || it.contactName || '';
    const initialContactPhone = (staged && staged.contactPhone) || it.contactPhone || '';
    const initialContactEmail = (staged && staged.contactEmail) || it.contactEmail || '';
    const initialAccountId = (staged && staged.accountId) || it.accountId || '';
    const initialChannel = (staged && staged.channel) || it.channel || 'direct';
    const initialBoard = (staged && staged.board) || it.board || 'room_only';

    const hasSavedRooms = Object.keys(savedRooms).length > 0;

    const m = K().modal({
      tag: tx('RÉSERVATION DE GROUPE'),
      title: tx('Nouveau dossier groupe'),
      desc: tx('Sélection multi-chambres avec contrôle de disponibilité serveur, répartition des voyageurs et pré-confirmation.'),
      width: 920,
      body: `
        <form class="hx-group-modal" data-hx-group-form>
          <div data-hx-group-recovery-slot>
            ${hasSavedRooms ? `
              <div class="hx-group-partial-alert" data-hx-group-resume-alert>
                <b>${tx('Dossier en cours de reprise')}</b>${hxColon()}${tx('{n} chambre(s) déjà enregistrée(s) sous le dossier {code}.', { n: Object.keys(savedRooms).length, code: `<code>${esc(groupDossierId)}</code>` })}
                <br>${tx('Les chambres confirmées sont conservées et verrouillées. Vous pouvez finaliser les chambres restantes ou remplacer une chambre indisponible.')}
                <div style="margin-top:6px;display:flex;gap:8px;">
                  <button type="button" class="hx-link-btn" data-action="hx-discard-staged">${tx('Abandonner ce brouillon local')}</button>
                </div>
              </div>
            ` : ''}
            ${!hasSavedRooms && committedTerms ? `
              <div class="hx-group-partial-alert" data-hx-group-resume-alert>
                <b>${tx('Tentative précédente reprise')}</b>${hxColon()}${tx('aucune chambre enregistrée, et les informations sont verrouillées pour protéger l’envoi en cours.')}
                <br>${tx('Finalisez l’envoi, ou repartez d’un dossier vierge.')}
                <div style="margin-top:6px;display:flex;gap:8px;">
                  <button type="button" class="hx-link-btn" data-action="hx-discard-staged">${tx('Abandonner et nouveau dossier vierge')}</button>
                </div>
              </div>
            ` : ''}
            ${(!hasSavedRooms && !committedTerms && (staged || pendingIntent)) ? `
              <div class="hx-group-partial-alert" data-hx-group-resume-alert>
                <b>${tx('Brouillon repris')}</b>${hxColon()}${tx('ce formulaire a été prérempli avec une saisie précédente')}${staged && staged.dossierId ? ` (${tx('dossier {code}', { code: `<code>${esc(staged.dossierId)}</code>` })})` : ''}.
                <br>${tx('Aucune chambre n’a été enregistrée. Vous pouvez continuer, ou repartir d’un dossier vierge.')}
                <div style="margin-top:6px;display:flex;gap:8px;">
                  <button type="button" class="hx-link-btn" data-action="hx-discard-staged">${tx('Abandonner et nouveau dossier vierge')}</button>
                </div>
              </div>
            ` : ''}
          </div>

          <div class="hx-commercial-hero">
            <div>
              <span class="hx-commercial-eyebrow">${tx('DOSSIER GROUPE · RÉSERVATION MULTI-CHAMBRES')}</span>
              <h3 style="margin:4px 0;font-size:16px;">${tx('Séminaires, agences et groupes de voyageurs')}</h3>
              <p style="font-size:12px;color:var(--n-600);margin:0;">${tx('Chaque chambre est contrôlée et garantie sous la même référence de dossier.')}</p>
            </div>
          </div>

          <fieldset class="hx-room-form-wide" style="border:1px solid var(--n-200);border-radius:12px;padding:14px;">
            <legend style="font-size:12px;font-weight:600;padding:0 6px;">${tx('1. Informations du groupe et séjour')}</legend>
            <div class="hx-room-form hx-type-form">
              <label class="hx-room-form-wide"><span>${tx('Nom du groupe / événement *')}</span><input name="groupName" required maxlength="120" placeholder="${tx('Ex. Séminaire Atlas Tech, Groupe Tourisme')}" value="${esc(initialGroupName)}"></label>
              <label><span>${tx('Date d’arrivée *')}</span><input name="checkIn" type="date" required value="${esc(initialCheckIn)}"></label>
              <label><span>${tx('Date de départ *')}</span><input name="checkOut" type="date" required value="${esc(initialCheckOut)}"></label>
              <label><span>${tx('Contact principal (nom) *')}</span><input name="contactName" required maxlength="100" placeholder="${tx('Nom du responsable')}" value="${esc(initialContactName)}"></label>
              <label><span>${tx('Téléphone contact')}</span><input name="contactPhone" maxlength="32" dir="ltr" placeholder="${tx('Ex. +212 6...')}" value="${esc(initialContactPhone)}"></label>
              <label><span>${tx('E-mail contact')}</span><input name="contactEmail" type="email" maxlength="160" dir="ltr" placeholder="contact@groupe.com" value="${esc(initialContactEmail)}"></label>
              <label><span>${tx('Compte commercial')}</span><select name="accountId">
                <option value="">${tx('Sans compte commercial')}</option>
                ${(commState.accounts || []).filter(a => !a.archived).map(a => `<option value="${esc(a.id)}" ${a.id === initialAccountId ? 'selected' : ''}>${esc(cuKinds[a.kind] + ' · ' + a.name)}</option>`).join('')}
              </select></label>
              <label><span>${tx('Canal')}</span><select name="channel">
                <option value="direct" ${initialChannel === 'direct' ? 'selected' : ''}>${tx('Direct')}</option>
                <option value="agency" ${initialChannel === 'agency' ? 'selected' : ''}>${tx('Agence')}</option>
                <option value="booking" ${initialChannel === 'booking' ? 'selected' : ''}>Booking.com</option>
                <option value="expedia" ${initialChannel === 'expedia' ? 'selected' : ''}>Expedia</option>
                <option value="other" ${initialChannel === 'other' ? 'selected' : ''}>${tx('Autre')}</option>
              </select></label>
              <label><span>${tx('Formule repas par défaut')}</span><select name="board">
                ${Object.entries(cuBoards).map(([v, l]) => `<option value="${v}" ${v === initialBoard ? 'selected' : ''}>${esc(l)}</option>`).join('')}
              </select></label>
            </div>
          </fieldset>

          <fieldset class="hx-room-form-wide" style="border:1px solid var(--n-200);border-radius:12px;padding:14px;">
            <legend style="font-size:12px;font-weight:600;padding:0 6px;">${tx('2. Sélection des chambres')}</legend>
            <div class="hx-group-filter-bar" style="display:flex;flex-wrap:wrap;gap:12px;align-items:flex-start;margin-bottom:12px;font-size:12px;">
              <div style="display:flex;flex-direction:column;gap:4px;">
                <span style="font-weight:500;">${tx('Section / Étage (choix multiple) :')}</span>
                <div class="hx-group-filter-floors" style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;">
                  ${Object.values(st.floors || {}).map(f => `
                    <label class="hx-filter-pill-label">
                      <input type="checkbox" data-hx-filter-floor="${esc(f.id)}">
                      <span>${esc(f.name)}</span>
                    </label>
                  `).join('')}
                </div>
              </div>
              <label>${tx('Catégorie :')}
                <select data-hx-filter-type>
                  <option value="">${tx('Toutes les catégories')}</option>
                  ${types.map(t => `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join('')}
                </select>
              </label>
              <label>${tx('Vue :')}
                <select data-hx-filter-view>
                  <option value="">${tx('Toutes les vues')}</option>
                  ${((Array.isArray(st.views) && st.views.length) ? st.views : DEFAULT_VIEWS).map(v => `<option value="${esc(v)}">${esc(cuViewLabel(v))}</option>`).join('')}
                </select>
              </label>
              <label>${tx('Capacité min. :')}
                <select data-hx-filter-cap>
                  <option value="0">${tx('Toutes capacités')}</option>
                  <option value="1">${tx('1+ personne')}</option>
                  <option value="2">${tx('2+ personnes')}</option>
                  <option value="3">${tx('3+ personnes')}</option>
                  <option value="4">${tx('4+ personnes')}</option>
                </select>
              </label>
              <label>${tx('Portes communicantes :')}
                <select data-hx-filter-conn>
                  <option value="">${tx('Toutes')}</option>
                  <option value="with">${tx('Avec porte communicante')}</option>
                  <option value="without">${tx('Sans communicante')}</option>
                </select>
              </label>
            </div>

            <div class="hx-group-rooms-grid" data-hx-group-rooms-grid></div>

            <div class="hx-group-summary-card" data-hx-rooms-summary style="margin-top:10px;">
              <span data-hx-rooms-counter>${tx('0 chambre sélectionnée')}</span>
            </div>
          </fieldset>

          <fieldset class="hx-room-form-wide" style="border:1px solid var(--n-200);border-radius:12px;padding:14px;">
            <legend style="font-size:12px;font-weight:600;padding:0 6px;">${tx('3. Fiche et répartition des voyageurs')}</legend>
            <div class="hx-group-paste-wrap">
              <details data-hx-import-details>
                <summary style="font-size:12px;color:var(--atlas);cursor:pointer;font-weight:500;">${tx('Importer rapidement une liste de voyageurs (copier-coller CSV / TSV)')}</summary>
                <div style="margin-top:8px;">
                  <textarea class="hx-group-paste-area" data-hx-group-paste placeholder="${tx('Collez les voyageurs (un voyageur par ligne : “Nom, Prénom”, Nationalité, Document)…')}"></textarea>
                  <div style="margin-top:6px;display:flex;gap:8px;align-items:center;">
                    <button type="button" class="hx-btn ghost" data-action="hx-preview-paste">${tx('Prévisualiser l’import')}</button>
                  </div>
                  <div data-hx-import-preview-area style="margin-top:8px;"></div>
                </div>
              </details>
            </div>

            <div class="hx-group-travelers-sec" style="margin-top:10px;">
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <span style="font-size:12px;font-weight:600;color:var(--ink);" data-hx-travelers-count>${tx('{n} voyageur(s)', { n: travelers.length, c: txn(travelers.length, 'voyageur') })}</span>
                <button type="button" class="hx-btn ghost" data-action="hx-add-group-traveler">+ ${tx('Ajouter un voyageur')}</button>
              </div>
              <div data-hx-group-travelers-container></div>
              <div data-hx-capacity-alerts style="margin-top:8px;"></div>
            </div>
          </fieldset>

          <div data-hx-group-quote-slot></div>

          <div class="hx-group-summary-card" data-hx-group-review>
            <h4 style="margin:0 0 6px;font-size:13.5px;color:var(--ink);">${tx('Récapitulatif du dossier de groupe')}</h4>
            <div class="hx-group-summary-grid">
              <div><small style="color:var(--n-500);display:block;">${tx('Identifiant dossier')}</small><code style="font-family:var(--mono);font-size:11.5px;">${esc(groupDossierId)}</code></div>
              <div><small style="color:var(--n-500);display:block;">${tx('Période')}</small><span data-hx-rev-dates>-</span></div>
              <div><small style="color:var(--n-500);display:block;">${tx('Chambres réservées')}</small><b data-hx-rev-rooms>${tx('0 chambre')}</b></div>
              <div><small style="color:var(--n-500);display:block;">${tx('Voyageurs enregistrés')}</small><span data-hx-rev-guests>${txn(0, 'personne')}</span></div>
            </div>
          </div>

          <p class="hx-stay-error" data-hx-group-error role="status" style="margin:4px 0;"></p>

          <div class="hx-room-form-actions">
            <button type="button" class="hx-btn ghost" data-action="hx-group-cancel">${tx('Fermer')}</button>
            <button type="submit" class="hx-btn atlas" data-hx-group-submit>${hasSavedRooms ? tx('Reprendre la confirmation ({n} enregistrée(s))', { n: Object.keys(savedRooms).length }) : tx('Confirmer la réservation du groupe')}</button>
          </div>
        </form>
      `
    });

    openModal = { el: m.el, close: m.close };
    const form = m.el.querySelector('[data-hx-group-form]');
    const roomsGrid = form.querySelector('[data-hx-group-rooms-grid]');
    const roomsCounter = form.querySelector('[data-hx-rooms-counter]');
    const travelersContainer = form.querySelector('[data-hx-group-travelers-container]');
    const travelersCountLabel = form.querySelector('[data-hx-travelers-count]');
    const capacityAlerts = form.querySelector('[data-hx-capacity-alerts]');
    const quoteSlot = form.querySelector('[data-hx-group-quote-slot]');
    const errorEl = form.querySelector('[data-hx-group-error]');

    let filterFloors = new Set();
    let filterType = '';
    let filterView = '';
    let filterMinCap = 0;
    let filterConn = '';

    // A partially committed dossier is one commercial identity: group name,
    // contact, channel, dates, account and meal plan all freeze with the
    // first saved room. They must not LOOK editable afterwards — any edit
    // would either split the dossier across two identities or be silently
    // ignored for the rooms already on the server. The frozen values live in
    // committedTerms (defect 1) and are restored from the draft cache.
    const lockCommittedFields = () => {
      // Locked once the dossier has proven rooms OR frozen terms (an adopted
      // unresolved intent): in both cases the controls no longer feed the
      // submission, and an editable look would promise edits that go nowhere.
      const frozen = Object.keys(savedRooms).length > 0 || !!committedTerms;
      for (const name of ['groupName', 'checkIn', 'checkOut', 'contactName', 'contactPhone', 'contactEmail', 'accountId', 'channel', 'board']) {
        if (form.elements[name]) form.elements[name].disabled = frozen;
      }
    };

    const persistStaged = () => {
      try {
        const payload = {
          merchant: initialMerchant,
          dossierId: groupDossierId,
          groupName: String(form.elements.groupName?.value || '').trim(),
          checkIn: form.elements.checkIn?.value,
          checkOut: form.elements.checkOut?.value,
          contactName: String(form.elements.contactName?.value || '').trim(),
          contactPhone: String(form.elements.contactPhone?.value || '').trim(),
          contactEmail: String(form.elements.contactEmail?.value || '').trim(),
          accountId: form.elements.accountId?.value || '',
          channel: form.elements.channel?.value || 'direct',
          board: form.elements.board?.value || 'room_only',
          committedTerms,
          quoteRevs,
          selectedRoomIds: Array.from(selectedRoomIds),
          savedRooms,
          failedRooms,
          travelers,
          quoteBreakdown,
          quoteRevision,
          quoteAccepted,
          updatedAt: Date.now(),
        };
        localStorage.setItem(stagedKey, JSON.stringify(payload));
        return true;
      } catch (_) { return false; }
    };

    // Authoritative submission terms for this attempt (defect 1). Frozen
    // terms win over live controls: after a partial save the controls that
    // carry them are disabled (and therefore invisible to FormData), so the
    // frozen model is the only honest source.
    const getTerms = () => {
      if (committedTerms) return { ...committedTerms };
      return {
        groupName: String(form.elements.groupName?.value || '').trim(),
        checkIn: form.elements.checkIn?.value || '',
        checkOut: form.elements.checkOut?.value || '',
        contactName: String(form.elements.contactName?.value || '').trim(),
        contactPhone: String(form.elements.contactPhone?.value || '').trim(),
        contactEmail: String(form.elements.contactEmail?.value || '').trim(),
        accountId: form.elements.accountId?.value || '',
        channel: form.elements.channel?.value || 'direct',
        board: form.elements.board?.value || 'room_only',
      };
    };
    const freezeTerms = (terms) => {
      committedTerms = { ...terms };
      persistStaged();
    };
    const termsDiffer = (a, b) => {
      const keys = ['groupName', 'checkIn', 'checkOut', 'contactName', 'contactPhone', 'contactEmail', 'accountId', 'channel', 'board'];
      return keys.some(k => String(a?.[k] ?? '') !== String(b?.[k] ?? ''));
    };

    const cuGroupQuoteSignature = () => {
      const checkIn = form.elements.checkIn?.value || '';
      const checkOut = form.elements.checkOut?.value || '';
      const board = form.elements.board?.value || 'room_only';
      const accountId = form.elements.accountId?.value || '';
      const selected = Array.from(selectedRoomIds).sort();
      const roomsInfo = selected.map(rid => {
        const room = allRooms.find(r => r.id === rid);
        const count = travelers.filter(t => t.roomId === rid).length;
        return `${rid}:${room?.typeId || ''}:${count}`;
      }).join(';');
      return `${checkIn}|${checkOut}|${board}|${accountId}|${roomsInfo}`;
    };

    let activeQuoteSignature = quoteAccepted ? cuGroupQuoteSignature() : '';

    const invalidateQuote = () => {
      quoteGen++;
      quoteAccepted = false;
      quoteBreakdown = {};
      quoteRevision = null;
      quoteRevs = {};
      activeQuoteSignature = '';
      renderQuoteBox();
      persistStaged();
    };

    const syncTravelersFromDom = () => {
      const rows = travelersContainer.querySelectorAll('[data-hx-group-traveler]');
      if (!rows.length) return;
      const updated = [];
      rows.forEach((row) => {
        const id = row.dataset.travelerId;
        const name = String(row.querySelector('[data-hx-t-name]')?.value || '').trim();
        const sex = String(row.querySelector('[data-hx-t-sex]')?.value || '').trim();
        const nationality = String(row.querySelector('[data-hx-guest-nationality]')?.value || '').trim();
        const birthDate = String(row.querySelector('[data-hx-t-birth]')?.value || '').trim();
        const idDocNumber = String(row.querySelector('[data-hx-t-doc]')?.value || '').trim();
        const roomId = String(row.querySelector('[data-hx-t-room]')?.value || '').trim();
        const existing = travelers.find(t => t.id === id) || {};
        updated.push({
          ...existing,
          id,
          name,
          sex,
          nationality,
          birthDate,
          idDocNumber,
          roomId,
        });
      });
      travelers = updated;
    };

    const renderRooms = () => {
      const filtered = allRooms.filter(r => {
        if (filterFloors.size > 0 && !filterFloors.has(r.floorId) && !filterFloors.has(r.floor)) return false;
        if (filterType && r.typeId !== filterType) return false;
        if (filterView && r.view !== filterView) return false;
        if (filterMinCap > 0 && (roomTypeOf(r.n).maxGuests || 2) < filterMinCap) return false;
        const hasConn = Array.isArray(r.connectingRoomIds) && r.connectingRoomIds.length > 0;
        if (filterConn === 'with' && !hasConn) return false;
        if (filterConn === 'without' && hasConn) return false;
        return true;
      });

      if (!filtered.length) {
        roomsGrid.innerHTML = `<div style="padding:16px;color:var(--n-500);font-size:12px;text-align:center;">${tx('Aucune chambre correspondante aux filtres.')}</div>`;
        return;
      }

      roomsGrid.innerHTML = filtered.map(r => {
        const type = roomTypeOf(r.n);
        const isChecked = selectedRoomIds.has(r.id);
        const isSaved = !!savedRooms[r.id];
        const isFailed = !!failedRooms[r.id];
        const connRoomNumbers = (r.connectingRoomIds || [])
          .map(cid => allRooms.find(x => x.id === cid)?.n)
          .filter(Boolean);

        let badge = '';
        if (isSaved) {
          badge = `<span class="hx-badge-saved">${tx('Chambre enregistrée')}</span>`;
        } else if (isFailed) {
          badge = '<span class="hx-badge-dup" style="font-size:11px;">' + tx('Échec : {reason}', { reason: esc(failedRooms[r.id]) }) + '</span>';
        }

        return `
          <label class="hx-group-room-card ${isChecked ? 'is-selected' : ''} ${isSaved ? 'is-saved' : ''}" data-room-card-id="${esc(r.id)}">
            <input type="checkbox" data-hx-group-cb value="${esc(r.id)}" ${isChecked ? 'checked' : ''} ${isSaved ? 'disabled' : ''}>
            <div class="hx-group-room-details">
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <span class="hx-group-room-title">${tx('Chambre {n}', { n: r.n })}</span>
                ${badge}
              </div>
              <span class="hx-group-room-sub">${esc(type.name)} · ${tx('max {n} pers.', { n: type.maxGuests || 4 })} · ${type.base != null ? tx('{amount}/nuit', { amount: MAD(type.base) }) : tx('Tarif standard')}</span>
              ${connRoomNumbers.length ? `<span class="hx-group-room-conn">${tx('Porte communicante : ch. {list}', { list: esc(connRoomNumbers.join(', ')) })}</span>` : ''}
            </div>
          </label>
        `;
      }).join('');
    };

    const renderQuoteBreakdownHtml = () => {
      const selected = allRooms.filter(r => selectedRoomIds.has(r.id));
      let totalCentsAll = 0;
      let allQuoted = true;
      const lines = selected.map(r => {
        const q = quoteBreakdown[r.id];
        if (!q || !Array.isArray(q.rows) || !Number.isSafeInteger(q.totalCents)) {
          allQuoted = false;
          return `<div>${tx('Ch. {n}', { n: r.n })} (${esc(roomTypeOf(r.n).name)})${hxColon()}<span style="color:var(--warn-ink);">${tx('En attente de calcul')}</span></div>`;
        }
        totalCentsAll += q.totalCents;
        const roomMad = cuDraftMoney(q.totalCents);
        const nights = q.rows.length;
        const rates = q.rows.map(row => row.amountCents);
        const minRate = cuDraftMoney(Math.min(...rates));
        const maxRate = cuDraftMoney(Math.max(...rates));
        const rateSummary = minRate === maxRate ? tx('{amount} MAD/nuit', { amount: ltr(minRate) }) : tx('de {min} à {max} MAD/nuit', { min: ltr(minRate), max: ltr(maxRate) });
        const taxLabel = q.taxBasis === 'exclusive' ? tx('HT') : tx('TTC');
        return `<div>${tx('Ch. {n}', { n: r.n })} (${esc(roomTypeOf(r.n).name)})${hxColon()}<b>${ltr(roomMad + ' MAD')} ${taxLabel}</b> (${txn(nights, 'nuit')} · ${rateSummary})</div>`;
      });
      if (allQuoted && selected.length > 0) {
        const totalMadAll = cuDraftMoney(totalCentsAll);
        const groupTax = Object.values(quoteBreakdown)[0]?.taxBasis === 'exclusive' ? tx('HT') : tx('TTC');
        lines.push(`<div style="margin-top:4px;font-weight:700;color:var(--ink);border-top:1px dashed var(--n-200);padding-top:4px;">${tx('Total commercial groupe : {amount} MAD {tax}', { amount: ltr(totalMadAll), tax: groupTax })}</div>`);
      }
      return lines.join('');
    };

    // Direct-guest group pricing (defect: no account needed). Pure recompute
    // from the hotel's own type configuration; agreed prices are not offered
    // here — a room without a configured rate names exactly what is missing.
    const groupDirectQuotes = () => {
      const board = form.elements.board?.value || 'room_only';
      const checkIn = form.elements.checkIn?.value || '';
      const checkOut = form.elements.checkOut?.value || '';
      const perRoom = {};
      let totalCents = 0, allOk = true;
      const missing = [];
      for (const r of allRooms.filter(x => selectedRoomIds.has(x.id))) {
        const type = cuTypes().find(t => t.id === r.typeId);
        const occ = Math.max(1, travelers.filter(t => t.roomId === r.id).length);
        const q = cuDirectQuote({
          typeRate: type ? type.rate : null, baseRate: cuState().baseRate, boardRates: type ? type.boardRates : null,
          board, checkIn, checkOut, occupancy: occ,
        });
        if (q.ok) {
          perRoom[r.id] = { rows: q.rows, totalCents: q.totalCents, nights: q.nights };
          totalCents += q.totalCents;
        } else {
          perRoom[r.id] = { missing: q.missing };
          allOk = false;
          missing.push({ room: r, missing: q.missing });
        }
      }
      return { perRoom, totalCents, allOk, missing };
    };

    const renderQuoteBox = () => {
      const board = form.elements.board?.value || 'room_only';
      const accountId = form.elements.accountId?.value || '';
      const selected = allRooms.filter(r => selectedRoomIds.has(r.id));
      const contractMode = !!accountId;
      if (!contractMode) {
        if (!selected.length) { quoteSlot.innerHTML = ''; return; }
        const dq = groupDirectQuotes();
        const lines = selected.map(r => {
          const q = dq.perRoom[r.id];
          if (!q || !q.rows) {
            const what = (q && q.missing && q.missing.includes('room'))
              ? tx('sans tarif logement pour « {type} »', { type: esc(roomTypeOf(r.n).name) })
              : tx('sans tarif « {board} » pour « {type} »', { board: esc(cuBoards[board] || board), type: esc(roomTypeOf(r.n).name) });
            return `<div>${tx('Ch. {n}', { n: r.n })}${hxColon()}<span style="color:var(--warn-ink);">${tx('En attente de tarif, {what}. Renseignez-le dans Types de chambres, ou réservez cette chambre en prix convenu depuis sa fiche individuelle.', { what })}</span></div>`;
          }
          return `<div>${tx('Ch. {n}', { n: r.n })} (${esc(roomTypeOf(r.n).name)})${hxColon()}<b>${ltr(cuDraftMoney(q.totalCents) + ' MAD')} ${tx('TTC')}</b> (${txn(q.nights, 'nuit')})</div>`;
        });
        if (dq.allOk && selected.length > 0) {
          lines.push(`<div style="margin-top:4px;font-weight:700;color:var(--ink);border-top:1px dashed var(--n-200);padding-top:4px;">${tx('Total groupe (tarifs maison) : {amount} MAD TTC', { amount: ltr(cuDraftMoney(dq.totalCents)) })}</div>`);
        }
        quoteSlot.innerHTML = `
          <div class="hx-quote-group-card">
            <div class="hx-quote-group-title">${tx('Tarifs maison · Formule : {board}', { board: esc(cuBoards[board] || board) })}</div>
            <p style="font-size:11.5px;color:var(--n-600);margin:0 0 8px;">${tx('Sans compte : chaque chambre est chiffrée au tarif configuré de sa catégorie. Vérifié côté serveur avant enregistrement.')}</p>
            <div class="hx-quote-group-breakdown">${lines.join('')}</div>
          </div>`;
        return;
      }


      const allQuoted = selected.length > 0 && selected.every(r => quoteBreakdown[r.id] && Number.isSafeInteger(quoteBreakdown[r.id].totalCents));
      const hasTaxExclusive = selected.some(r => quoteBreakdown[r.id]?.taxBasis === 'exclusive');

      let unsupportedWarn = '';
      if (board !== 'room_only' && !accountId) {
        unsupportedWarn = `<p class="hx-warn-note" style="color:var(--warn-ink);background:var(--warn-soft);padding:6px 10px;border-radius:6px;font-size:11.5px;margin:4px 0;">${tx('Formule repas : un compte commercial avec des contrats actifs est requis pour cette formule.')}</p>`;
      } else {
        const overCapRooms = selected.filter(r => {
          const count = travelers.filter(t => t.roomId === r.id).length;
          return count > 3;
        });
        if (overCapRooms.length > 0) {
          unsupportedWarn = `<p class="hx-warn-note" style="color:var(--danger,#b91c1c);background:rgba(201,74,58,0.08);padding:6px 10px;border-radius:6px;font-size:11.5px;margin:4px 0;">${tx('Attention : La tarification contractuelle couvre au maximum 3 personnes par chambre. Les chambres {list} dépassent cette limite (1 à 3 pers.).', { list: overCapRooms.map(r => r.n).join(', ') })}</p>`;
        }
      }

      let acceptCheckboxHtml = '';
      if (allQuoted && !unsupportedWarn) {
        if (hasTaxExclusive) {
          acceptCheckboxHtml = `<p class="hx-warn-note" style="color:var(--warn-ink);margin-top:6px;font-size:11.5px;">${tx('Tarif HT détecté : la configuration fiscale est requise avant validation.')}</p>`;
        } else {
          acceptCheckboxHtml = `
            <label class="hx-quote-accept" style="font-size:12px;display:flex;align-items:center;gap:6px;cursor:pointer;">
              <input type="checkbox" data-hx-group-accept-quote ${quoteAccepted ? 'checked' : ''}>
              <span>${tx('J’accepte ce devis commercial pour l’ensemble des chambres et la formule choisie.')}</span>
            </label>
          `;
        }
      } else {
        acceptCheckboxHtml = `
          <label class="hx-quote-accept" style="font-size:12px;display:flex;align-items:center;gap:6px;color:var(--n-500);cursor:not-allowed;">
            <input type="checkbox" disabled>
            <span>${tx('Simulez un devis complet et valide pour pouvoir accepter les tarifs.')}</span>
          </label>
        `;
      }

      quoteSlot.innerHTML = `
        <div class="hx-quote-group-card">
          <div class="hx-quote-group-title">${tx('Tarification commerciale · Formule : {board}', { board: esc(cuBoards[board] || board) })}</div>
          ${quoteRevision != null ? `<div style="font-size:11px;color:var(--n-500);margin:2px 0 6px;">${tx('Révision commerciale n°{n}', { n: quoteRevision })} · ${quoteAccepted ? tx('devis accepté pour ces tarifs') : tx('en attente d’acceptation')}</div>` : ''}
          <p style="font-size:11.5px;color:var(--n-600);margin:0 0 8px;">${tx('Cette formule nécessite la simulation et l’acceptation d’un devis commercial avant validation.')}</p>
          ${unsupportedWarn}
          <div class="hx-quote-group-breakdown" data-hx-quote-breakdown>
            ${allQuoted ? renderQuoteBreakdownHtml() : `<span style="color:var(--n-500);">${tx('Devis non encore simulé ou incomplet.')}</span>`}
          </div>
          <div style="display:flex;gap:8px;align-items:center;margin-top:6px;">
            <button type="button" class="hx-btn ghost" data-action="hx-simulate-group-quote" style="font-size:11.5px;padding:4px 10px;">${tx('Simuler / Actualiser le devis')}</button>
          </div>
          <div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--n-100);">
            ${acceptCheckboxHtml}
          </div>
        </div>
      `;
    };

    // Monotonic quote generation (defect 4): overlapping simulations and
    // late failures must neither replace nor clear a newer quote. The
    // signature guard below only sees user edits; the generation sees time.
    let quoteGen = 0;

    const simulateQuotes = async () => {
      syncTravelersFromDom();
      const selected = allRooms.filter(r => selectedRoomIds.has(r.id));
      if (!selected.length) {
        toast(tx('Sélectionnez au moins une chambre avant de simuler le devis.'), { type: 'warn' });
        return;
      }
      const board = form.elements.board?.value || 'room_only';
      const accountId = form.elements.accountId?.value || null;
      const checkIn = form.elements.checkIn.value;
      const checkOut = form.elements.checkOut.value;

      if (board !== 'room_only' && !accountId) {
        toast(tx('Formule repas : sélectionnez un compte commercial avant de simuler le devis.'), { type: 'warn' });
        return;
      }

      for (const room of selected) {
        const occ = travelers.filter(t => t.roomId === room.id).length;
        if (occ > 3) {
          toast(tx('Chambre {n} : la tarification contractuelle couvre de 1 à 3 personnes (actuellement {occ}).', { n: room.n, occ }), { type: 'warn' });
          return;
        }
      }

      const simBtn = form.querySelector('[data-action="hx-simulate-group-quote"]');
      if (simBtn) { simBtn.disabled = true; simBtn.textContent = tx('Calcul en cours…'); }

      quoteBreakdown = {};
      quoteAccepted = false;
      quoteRevision = null;
      quoteRevs = {};
      const targetSig = cuGroupQuoteSignature();
      const gen = ++quoteGen;

      try {
        let firstRev = null;
        const revs = {};
        for (const room of selected) {
          const roomGuests = travelers.filter(t => t.roomId === room.id);
          const occupancy = Math.max(1, roomGuests.length);
          const res = await fetch('/api/hotel/commercial', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'quote',
              merchant: initialMerchant,
              accountId,
              roomTypeId: room.typeId,
              checkIn,
              checkOut,
              occupancy,
              board,
            }),
          });

          if (initialScope !== cuStayScope() || initialMerchant !== cuMerchantSlug() || openModal?.el !== m.el || !form.isConnected) {
            return;
          }
          if (gen !== quoteGen) {
            return;
          }
          if (targetSig !== cuGroupQuoteSignature()) {
            return;
          }

          const b = await res.json().catch(() => ({}));
          if (gen !== quoteGen) {
            return;
          }
          if (!res.ok || !b.quote) {
            throw new Error(tx('Chambre {n} : {reason}', { n: room.n, reason: cuCommercialError(b.error) || b.error || tx('Erreur devis') }));
          }
          // One reviewed group, one directory revision (defect 4): if the
          // commercial directory moved between two rooms' responses, the
          // displayed totals would mix two price lists while the submission
          // carries a single revision. Reject the whole simulation instead.
          if (!Number.isSafeInteger(b.rev)) {
            throw new Error(tx('Chambre {n} : devis sans révision vérifiable. Relancez la simulation.', { n: room.n }));
          }
          if (firstRev === null) {
            firstRev = b.rev;
          } else if (b.rev !== firstRev) {
            throw new Error(tx('Le répertoire commercial a changé pendant la simulation (révision {a} puis {b}). Relancez la simulation pour un devis cohérent.', { a: firstRev, b: b.rev }));
          }
          revs[room.id] = b.rev;
          quoteBreakdown[room.id] = b.quote;
        }

        if (gen !== quoteGen) {
          return;
        }
        quoteRevision = firstRev;
        quoteRevs = revs;
        activeQuoteSignature = targetSig;
        renderQuoteBox();
        persistStaged();
        toast(tx('Devis commercial simulé avec succès'), { type: 'success' });
      } catch (err) {
        // A late failure from an older attempt must not wipe the newer
        // quote it no longer owns (defect 4: async results clearing newer).
        if (gen !== quoteGen) {
          return;
        }
        quoteBreakdown = {};
        quoteAccepted = false;
        quoteRevision = null;
        quoteRevs = {};
        activeQuoteSignature = '';
        renderQuoteBox();
        const area = quoteSlot.querySelector('[data-hx-quote-breakdown]');
        if (area) area.innerHTML = `<span style="color:var(--danger,#b91c1c);">${esc(err.message)}</span>`;
      } finally {
        const btn = form.querySelector('[data-action="hx-simulate-group-quote"]');
        if (btn) { btn.disabled = false; btn.textContent = tx('Simuler / Actualiser le devis'); }
      }
    };

    const updateRoomsSummary = () => {
      const selected = allRooms.filter(r => selectedRoomIds.has(r.id));
      const totalCapacity = selected.reduce((acc, r) => acc + (roomTypeOf(r.n).maxGuests || 4), 0);
      const nights = Math.max(1, Math.round((Date.parse(form.elements.checkOut.value + 'T12:00:00Z') - Date.parse(form.elements.checkIn.value + 'T12:00:00Z')) / 86400000) || 1);
      const totalEst = selected.reduce((acc, r) => {
        const baseRate = roomTypeOf(r.n).base ?? cuState().baseRate ?? 0;
        return acc + (baseRate * nights);
      }, 0);

      const visibleSelectedCount = allRooms.filter(r => selectedRoomIds.has(r.id) &&
        (filterFloors.size === 0 || filterFloors.has(r.floorId) || filterFloors.has(r.floor)) &&
        (!filterType || r.typeId === filterType) &&
        (!filterView || r.view === filterView) &&
        (filterMinCap === 0 || (roomTypeOf(r.n).maxGuests || 2) >= filterMinCap) &&
        (filterConn !== 'with' || (Array.isArray(r.connectingRoomIds) && r.connectingRoomIds.length > 0)) &&
        (filterConn !== 'without' || (!Array.isArray(r.connectingRoomIds) || r.connectingRoomIds.length === 0))
      ).length;

      let counterHtml = `<b>${tx('{n} chambre(s) sélectionnée(s)', { n: selected.length, c: txn(selected.length, 'chambre') })}</b>`;
      if (selected.length > 0 && visibleSelectedCount < selected.length) {
        counterHtml += ` (${tx('{n} visible(s) selon les filtres', { n: visibleSelectedCount })})`;
      }
      counterHtml += ` · ${tx('Capacité totale : {n} personnes', { n: totalCapacity, c: txn(totalCapacity, 'personne') })} · ${tx('Estimation base : {amount}', { amount: MAD(totalEst) })} (${txn(nights, 'nuit')})`;
      roomsCounter.innerHTML = counterHtml;

      form.querySelector('[data-hx-rev-dates]').textContent = `${cuDay(form.elements.checkIn.value)}${hxTo()}${cuDay(form.elements.checkOut.value)} (${txn(nights, 'nuit')})`;
      form.querySelector('[data-hx-rev-rooms]').textContent = tx('{n} chambre(s) ({v} validée(s))', { n: selected.length, c: txn(selected.length, 'chambre'), v: Object.keys(savedRooms).length });
      form.querySelector('[data-hx-rev-guests]').textContent = txn(travelers.length, 'voyageur');

      renderQuoteBox();
      updateTravelerRoomOptions();
      validateCapacity();
    };

    const updateTravelerRoomOptions = () => {
      // Committed rooms are not assignable (defect 3): a traveler parked on
      // a saved room would never reach the server, and the UI would pretend
      // otherwise. The row's own saved room stays visible so frozen rows
      // keep showing where their travelers sleep.
      const selected = allRooms.filter(r => selectedRoomIds.has(r.id));
      const roomSelects = form.querySelectorAll('[data-hx-t-room]');
      roomSelects.forEach(sel => {
        const currentVal = sel.value;
        const avail = selected.filter(r => !savedRooms[r.id] || r.id === currentVal);
        sel.innerHTML = `<option value="">${tx('-- Sélectionner une chambre --')}</option>` + avail.map(r => `<option value="${esc(r.id)}" ${r.id === currentVal ? 'selected' : ''}>${tx('Ch. {n}', { n: r.n })} · ${esc(roomTypeOf(r.n).name)}</option>`).join('');
      });
    };

    const travelerRowHtml = (t, idx) => {
      const selected = allRooms.filter(r => selectedRoomIds.has(r.id));
      const isUnassigned = !t.roomId;
      const isRoomSaved = !!(t.roomId && savedRooms[t.roomId]);
      return `
        <div class="hx-guest-item ${isUnassigned ? 'is-unassigned' : ''} ${isRoomSaved ? 'is-frozen' : ''}" data-hx-group-traveler data-traveler-id="${esc(t.id || ('gst_' + crypto.randomUUID().slice(0, 12)))}" style="margin-bottom:10px;">
          <div class="hx-guest-head" style="display:flex;justify-content:space-between;align-items:center;">
            <div style="display:flex;align-items:center;gap:8px;">
              <span>${tx('VOYAGEUR {n}', { n: idx + 1 })}</span>
              ${isUnassigned ? `<span class="hx-badge-unassigned">${tx('Non attribué à une chambre')}</span>` : ''}
              ${isRoomSaved ? `<span class="hx-badge-saved" style="font-size:11px;">${tx('Enregistré · Verrouillé')}</span>` : ''}
            </div>
            ${!isRoomSaved && travelers.length > 1 ? `<button type="button" class="hx-link-btn" data-action="hx-remove-group-traveler">${tx('Retirer')}</button>` : ''}
          </div>
          <div class="hx-guest-grid">
            <label><span>${tx('Nom complet *')}</span><input data-hx-t-name required placeholder="${tx('Nom et prénom')}" value="${esc(t.name || '')}" ${isRoomSaved ? 'disabled' : ''}></label>
            <label><span>${tx('Sexe')}</span><select data-hx-t-sex ${isRoomSaved ? 'disabled' : ''}>
              <option value="">${tx('Indéterminé')}</option>
              <option value="M" ${t.sex === 'M' ? 'selected' : ''}>${tx('Masculin (M)')}</option>
              <option value="F" ${t.sex === 'F' ? 'selected' : ''}>${tx('Féminin (F)')}</option>
            </select></label>
            <label><span>${tx('Nationalité')}</span>${cuNationalitySelectorHtml(t, idx, 'grp_', isRoomSaved)}</label>
            <label><span>${tx('Date de naissance')}</span><input type="date" dir="ltr" data-hx-t-birth value="${esc(t.birthDate || '')}" ${isRoomSaved ? 'disabled' : ''}></label>
            <label><span>${tx('N° de document')}</span><input dir="ltr" data-hx-t-doc placeholder="${tx('Passeport / CNIE')}" value="${esc(t.idDocNumber || '')}" ${isRoomSaved ? 'disabled' : ''}></label>
            <label><span>${tx('Chambre attribuée *')}</span><select data-hx-t-room ${isRoomSaved ? 'disabled' : ''} ${isUnassigned ? 'style="border-color:var(--warn-ink);"' : ''}>
              <option value="">${tx('-- Sélectionner une chambre --')}</option>
              ${selected.filter(r => !savedRooms[r.id] || r.id === t.roomId).map(r => `<option value="${esc(r.id)}" ${t.roomId === r.id ? 'selected' : ''}>${tx('Ch. {n}', { n: r.n })} · ${esc(roomTypeOf(r.n).name)}</option>`).join('')}
            </select></label>
          </div>
        </div>
      `;
    };

    const renderTravelers = () => {
      travelersContainer.innerHTML = travelers.map((t, idx) => travelerRowHtml(t, idx)).join('');
      travelersCountLabel.textContent = txn(travelers.length, 'voyageur');
      form.querySelector('[data-hx-rev-guests]').textContent = txn(travelers.length, 'voyageur');
      cuWireNationalitySelectors(travelersContainer);
      validateCapacity();
    };

    const validateCapacity = () => {
      syncTravelersFromDom();
      const selected = allRooms.filter(r => selectedRoomIds.has(r.id));
      const roomAssignedCounts = new Map();
      const names = [];
      let unassignedCount = 0;

      travelers.forEach(t => {
        const name = String(t.name || '').trim();
        if (name) names.push(cuNormalizeText(name));
        if (t.roomId) {
          roomAssignedCounts.set(t.roomId, (roomAssignedCounts.get(t.roomId) || 0) + 1);
        } else {
          unassignedCount++;
        }
      });

      const alerts = [];
      if (unassignedCount > 0) {
        alerts.push(`<p class="hx-warn-note" style="color:var(--warn-ink);background:var(--warn-soft);padding:6px 10px;border-radius:6px;font-size:11.5px;margin:3px 0;">${tx('Attention : {n} voyageur(s) ne sont pas encore attribués à une chambre.', { n: unassignedCount, c: txn(unassignedCount, 'voyageur') })}</p>`);
      }

      selected.forEach(r => {
        const assigned = roomAssignedCounts.get(r.id) || 0;
        const max = roomTypeOf(r.n).maxGuests || 4;
        if (assigned === 0) {
          alerts.push(`<p class="hx-warn-note" style="color:var(--warn-ink);background:var(--warn-soft);padding:6px 10px;border-radius:6px;font-size:11.5px;margin:3px 0;">${tx('Chambre {n} : aucun voyageur attribué.', { n: r.n })}</p>`);
        } else if (assigned > max) {
          alerts.push(`<p class="hx-warn-note" style="color:var(--danger,#b91c1c);background:rgba(201,74,58,0.08);padding:6px 10px;border-radius:6px;font-size:11.5px;margin:3px 0;">${tx('Attention : Chambre {n} dépasse sa capacité maximale ({a} / {max} pers.).', { n: r.n, a: assigned, max })}</p>`);
        }
      });

      const dups = names.filter((n, i) => names.indexOf(n) !== i);
      if (dups.length) {
        alerts.push(`<p class="hx-warn-note" style="color:var(--warn-ink);background:var(--warn-soft);padding:6px 10px;border-radius:6px;font-size:11.5px;margin:3px 0;">${tx('Noms en double détectés dans la liste des voyageurs. Vérifiez les homonymes.')}</p>`);
      }

      capacityAlerts.innerHTML = alerts.join('');
    };

    form.addEventListener('change', (e) => {
      const floorCb = e.target.closest('[data-hx-filter-floor]');
      if (floorCb) {
        const val = floorCb.getAttribute('data-hx-filter-floor');
        if (floorCb.checked) {
          filterFloors.add(val);
        } else {
          filterFloors.delete(val);
        }
        renderRooms();
        updateRoomsSummary();
      }
    });

    form.querySelector('[data-hx-filter-type]')?.addEventListener('change', (e) => {
      filterType = e.target.value; renderRooms(); updateRoomsSummary();
    });
    form.querySelector('[data-hx-filter-view]')?.addEventListener('change', (e) => {
      filterView = e.target.value; renderRooms(); updateRoomsSummary();
    });
    form.querySelector('[data-hx-filter-cap]')?.addEventListener('change', (e) => {
      filterMinCap = Number(e.target.value) || 0; renderRooms(); updateRoomsSummary();
    });
    form.querySelector('[data-hx-filter-conn]')?.addEventListener('change', (e) => {
      filterConn = e.target.value; renderRooms(); updateRoomsSummary();
    });

    roomsGrid.addEventListener('change', (e) => {
      const cb = e.target.closest('[data-hx-group-cb]');
      if (cb) {
        syncTravelersFromDom();
        if (cb.checked) {
          selectedRoomIds.add(cb.value);
        } else {
          selectedRoomIds.delete(cb.value);
          // Preserve travelers by unassigning rather than deleting
          travelers.forEach(t => {
            if (t.roomId === cb.value) {
              t.roomId = '';
            }
          });
        }
        invalidateQuote();
        const card = cb.closest('.hx-group-room-card');
        if (card) card.classList.toggle('is-selected', cb.checked);
        renderTravelers();
        updateRoomsSummary();
        persistStaged();
      }
    });

    form.elements.checkIn?.addEventListener('change', () => { invalidateQuote(); updateRoomsSummary(); persistStaged(); });
    form.elements.checkOut?.addEventListener('change', () => { invalidateQuote(); updateRoomsSummary(); persistStaged(); });
    form.elements.board?.addEventListener('change', () => { invalidateQuote(); updateRoomsSummary(); persistStaged(); });
    form.elements.accountId?.addEventListener('change', () => { invalidateQuote(); updateRoomsSummary(); persistStaged(); });

    form.addEventListener('change', (e) => {
      if (e.target.matches('[data-hx-group-accept-quote]')) {
        quoteAccepted = e.target.checked;
        persistStaged();
      }
    });

    form.addEventListener('click', (e) => {
      if (e.target.closest('[data-action="hx-add-group-traveler"]')) {
        syncTravelersFromDom();
        travelers.push({ id: 'gst_' + crypto.randomUUID().slice(0, 12), name: '', sex: '', nationality: '', residenceCountry: '', birthDate: '', idDocType: '', idDocNumber: '', roomId: '' });
        invalidateQuote();
        renderTravelers();
        persistStaged();
      } else if (e.target.closest('[data-action="hx-remove-group-traveler"]')) {
        syncTravelersFromDom();
        const item = e.target.closest('[data-hx-group-traveler]');
        if (item) {
          const id = item.dataset.travelerId;
          travelers = travelers.filter(t => t.id !== id);
          if (!travelers.length) travelers.push({ id: 'gst_' + crypto.randomUUID().slice(0, 12), name: '', sex: '', nationality: '', residenceCountry: '', birthDate: '', idDocType: '', idDocNumber: '', roomId: '' });
          invalidateQuote();
          renderTravelers();
          persistStaged();
        }
      } else if (e.target.closest('[data-action="hx-preview-paste"]')) {
        const pasteText = String(form.querySelector('[data-hx-group-paste]')?.value || '').trim();
        const previewArea = form.querySelector('[data-hx-import-preview-area]');
        if (!pasteText) {
          previewArea.innerHTML = `<span style="color:var(--warn-ink);font-size:11.5px;">${tx('Veuillez coller du texte avant de prévisualiser.')}</span>`;
          return;
        }
        const lines = pasteText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        const parsed = lines.map(line => {
          const parts = cuParseDelimitedLine(line);
          const name = parts[0] || '';
          const natRaw = parts[1] || '';
          const doc = parts[2] || '';
          const matchedNat = cuMatchNationality(natRaw);
          return {
            name,
            natRaw,
            natCode: matchedNat || '',
            natLabel: matchedNat ? cuNationalityLabel(matchedNat) : '',
            doc,
          };
        }).filter(p => p.name);

        if (!parsed.length) {
          previewArea.innerHTML = `<span style="color:var(--warn-ink);font-size:11.5px;">${tx('Aucun voyageur valide détecté dans le texte.')}</span>`;
          return;
        }

        form.__parsedImport = parsed;
        previewArea.innerHTML = `
          <div class="hx-import-preview-box">
            <table class="hx-import-preview-table">
              <thead><tr><th>#</th><th>${tx('Nom')}</th><th>${tx('Nationalité détectée')}</th><th>${tx('Document')}</th></tr></thead>
              <tbody>
                ${parsed.map((p, i) => `<tr><td>${i+1}</td><td><b>${esc(p.name)}</b></td><td>${esc(p.natLabel || p.natRaw || tx('Indéterminée'))}</td><td dir="ltr">${esc(p.doc || '-')}</td></tr>`).join('')}
              </tbody>
            </table>
          </div>
          <div style="display:flex;gap:8px;margin-top:6px;">
            <button type="button" class="hx-btn atlas" data-action="hx-confirm-import" style="font-size:11.5px;padding:4px 10px;">${tx('Confirmer l’import ({n} voyageurs)', { n: parsed.length, c: txn(parsed.length, 'voyageur') })}</button>
            <button type="button" class="hx-btn ghost" data-action="hx-cancel-import" style="font-size:11.5px;padding:4px 10px;">${tx('Annuler')}</button>
          </div>
        `;
      } else if (e.target.closest('[data-action="hx-confirm-import"]')) {
        const parsed = form.__parsedImport || [];
        if (parsed.length) {
          syncTravelersFromDom();
          const selected = allRooms.filter(r => selectedRoomIds.has(r.id));
          let rIndex = 0;
          parsed.forEach(p => {
            const assignedRoom = selected.length ? selected[rIndex % selected.length].id : '';
            travelers.push({
              id: 'gst_' + crypto.randomUUID().slice(0, 12),
              name: p.name,
              sex: '',
              nationality: p.natCode || p.natRaw || '',
              residenceCountry: '',
              birthDate: '',
              idDocType: '',
              idDocNumber: p.doc,
              roomId: assignedRoom,
            });
            if (selected.length) rIndex++;
          });
          if (travelers.length > 1 && !travelers[0].name) {
            travelers.shift();
          }
          invalidateQuote();
          renderTravelers();
          updateRoomsSummary();
          persistStaged();
          form.querySelector('[data-hx-group-paste]').value = '';
          form.querySelector('[data-hx-import-preview-area]').innerHTML = '';
          delete form.__parsedImport;
          toast(tx('{n} voyageur(s) importé(s)', { n: parsed.length, c: txn(parsed.length, 'voyageur') }), { type: 'success' });
        }
      } else if (e.target.closest('[data-action="hx-cancel-import"]')) {
        form.querySelector('[data-hx-import-preview-area]').innerHTML = '';
        delete form.__parsedImport;
      } else if (e.target.closest('[data-action="hx-simulate-group-quote"]')) {
        simulateQuotes();
      } else if (e.target.closest('[data-action="hx-discard-staged"]')) {
        localStorage.removeItem(stagedKey);
        try { localStorage.removeItem(intentKeyFor(groupDossierId)); } catch (_) {}
        /* ── ABANDONNER DOIT VOULOIR DIRE ABANDONNER (ticket #0007) ────────
         * On n'effaçait que la trace du dossier COURANT. Une tentative
         * inachevée portant un AUTRE identifiant survivait donc au geste, et
         * la fois suivante « nouvelle réservation » la réadoptait : le même
         * essai revenait, avec ses champs verrouillés, sans qu'aucun bouton
         * ne puisse plus s'en défaire. C'est très exactement le blocage
         * décrit — « quand on ferme et qu'on reclique, on retombe sur le
         * même dossier qui n'a pas pu se charger ».
         *
         * Ces enregistrements sont des aides à la reprise LOCALES : les
         * chambres déjà enregistrées côté serveur le restent, et un dossier
         * réellement en cours se relit depuis la liste des séjours. Les
         * effacer sur un geste explicite ne perd donc aucune réservation. */
        try {
          const orphans = [];
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (!key || !key.startsWith('kiwi_hx_intent_')) continue;
            let raw = null;
            try { raw = JSON.parse(localStorage.getItem(key) || 'null'); } catch (_) { raw = null; }
            if (raw && raw.merchant === initialMerchant && raw.status !== 'complete') orphans.push(key);
          }
          orphans.forEach((key) => { try { localStorage.removeItem(key); } catch (_) {} });
        } catch (_) {}
        savedRooms = {};
        failedRooms = {};
        quoteBreakdown = {};
        quoteAccepted = false;
        quoteRevision = null;
        quoteRevs = {};
        committedTerms = null;
        activeQuoteSignature = '';
        groupDossierId = 'grp_' + Date.now() + '_' + crypto.randomUUID().slice(0, 8);
        // A fresh dossier means blank inputs, no rooms, one empty traveler:
        // leaving adopted values behind would re-freeze the next persist.
        selectedRoomIds.clear();
        travelers = [{ id: 'gst_' + crypto.randomUUID().slice(0, 12), name: '', sex: '', nationality: '', residenceCountry: '', birthDate: '', idDocType: '', idDocNumber: '', roomId: '' }];
        for (const [name, value] of [['groupName', ''], ['checkIn', today], ['checkOut', tomorrow], ['contactName', ''], ['contactPhone', ''], ['contactEmail', ''], ['accountId', ''], ['channel', 'direct'], ['board', 'room_only']]) {
          if (form.elements[name]) form.elements[name].value = value;
        }
        const recoverySlot = form.querySelector('[data-hx-group-recovery-slot]');
        if (recoverySlot) recoverySlot.innerHTML = '';
        lockCommittedFields();
        renderRooms();
        renderTravelers();
        updateRoomsSummary();
        toast(tx('Brouillon local abandonné. Nouveau dossier prêt.'), { type: 'info' });
      } else if (e.target.closest('[data-action="hx-group-cancel"]')) {
        m.close();
        openModal = null;
      }
    });

    travelersContainer.addEventListener('change', (e) => {
      if (e.target.matches('[data-hx-t-room]')) {
        invalidateQuote();
      }
      validateCapacity();
      persistStaged();
    });
    travelersContainer.addEventListener('input', () => { validateCapacity(); persistStaged(); });

    lockCommittedFields();
    renderRooms();
    renderTravelers();
    updateRoomsSummary();
    if (intentNotice === 'adopted') {
      toast(tx('Dossier en cours de finalisation restauré ({id}). Les chambres seront revérifiées auprès du serveur avant tout nouvel enregistrement.', { id: groupDossierId }), { type: 'info' });
    } else if (intentNotice === 'other-pending' && pendingIntent) {
      toast(tx('Un autre dossier ({id}) attend encore sa finalisation. Terminez ou abandonnez ce brouillon pour le reprendre.', { id: pendingIntent.dossierId }), { type: 'info' });
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (form.__hxSubmitting) return;
      errorEl.textContent = '';
      const submitBtn = form.querySelector('[data-hx-group-submit]');

      if (initialScope !== cuStayScope() || initialMerchant !== cuMerchantSlug()) {
        errorEl.textContent = tx('L’hôtel actif a changé. Ce dossier ne peut pas être finalisé dans un autre établissement.');
        return;
      }

      syncTravelersFromDom();

      // Defect 1: read the frozen submission model, never the (possibly
      // disabled, hence FormData-invisible) controls. On a first attempt the
      // model mirrors the live form; after any room is saved it is the exact
      // terms that room was booked with.
      const terms = getTerms();
      const groupName = terms.groupName;
      const checkIn = terms.checkIn;
      const checkOut = terms.checkOut;
      const contactName = terms.contactName;
      const contactPhone = terms.contactPhone;
      const contactEmail = terms.contactEmail;
      const accountId = terms.accountId || null;
      const channel = terms.channel;
      const board = terms.board;

      if (!groupName) { errorEl.textContent = tx('Indiquez le nom du groupe.'); return; }
      if (!contactName) { errorEl.textContent = tx('Indiquez le contact principal.'); return; }
      if (!checkIn || !checkOut || checkOut <= checkIn) { errorEl.textContent = tx('Vérifiez les dates d’arrivée et de départ.'); return; }
      if (selectedRoomIds.size === 0) { errorEl.textContent = tx('Sélectionnez au moins une chambre pour le groupe.'); return; }

      // Check unassigned travelers
      const unassigned = travelers.filter(t => !t.roomId);
      if (unassigned.length > 0) {
        errorEl.textContent = tx('Tous les voyageurs doivent être attribués à une chambre. Veuillez attribuer ou retirer les {n} voyageur(s) sans chambre.', { n: unassigned.length, c: txn(unassigned.length, 'voyageur') });
        return;
      }

      // Check room capacity
      const selected = allRooms.filter(r => selectedRoomIds.has(r.id));
      for (const room of selected) {
        const assignedCount = travelers.filter(t => t.roomId === room.id).length;
        const maxCap = roomTypeOf(room.n).maxGuests || 4;
        if (assignedCount === 0) {
          errorEl.textContent = tx('La chambre {n} n’a aucun voyageur attribué.', { n: room.n });
          return;
        }
        if (assignedCount > maxCap) {
          errorEl.textContent = tx('La chambre {n} dépasse sa capacité maximale ({a} / {max} pers.).', { n: room.n, a: assignedCount, max: maxCap });
          return;
        }
      }

      // Check quotes for meal plans and accounts (defect 4). The accepted
      // quote must still describe THIS dossier: same signature as at accept
      // time, one single revision across every quoted room, a complete entry
      // for each room that is about to be written, and a directory revision
      // that has not moved since. Anything else restarts the simulation —
      // the operator reviews one total and the server books exactly it
      // (the save endpoint re-checks the revision and 409s otherwise).
      // Two genuinely separate pricing paths (defect: ordinary groups need
      // no account). Contract groups simulate and accept; direct groups are
      // priced live from the hotel configuration, no simulation to accept.
      const contractMode = !!accountId;
      let groupDirect = null;
      if (contractMode && !quoteAccepted) {
        errorEl.textContent = tx('Veuillez simuler et accepter le devis commercial pour cette formule de séjour avant de confirmer le groupe.');
        return;
      }
      if (!contractMode) {
        groupDirect = groupDirectQuotes();
        const missingRoom = allRooms
          .filter(r => selectedRoomIds.has(r.id) && !savedRooms[r.id])
          .find(r => !groupDirect.perRoom[r.id] || !groupDirect.perRoom[r.id].rows);
        if (missingRoom) {
          const miss = (groupDirect.perRoom[missingRoom.id] && groupDirect.perRoom[missingRoom.id].missing) || ['meal'];
          const what = miss.includes('room')
            ? tx('sans tarif logement pour « {type} »', { type: roomTypeOf(missingRoom.n).name })
            : (miss.includes('dates') ? tx('dates du séjour invalides') : tx('sans tarif « {board} » pour « {type} »', { board: cuBoards[board] || board, type: roomTypeOf(missingRoom.n).name }));
          errorEl.textContent = tx('Chambre {n} {what}. Renseignez le tarif dans Types de chambres, ou réservez cette chambre en prix convenu depuis sa fiche individuelle.', { n: missingRoom.n, what });
          return;
        }
      }
      if (contractMode) {
        if (!activeQuoteSignature || activeQuoteSignature !== cuGroupQuoteSignature() || quoteRevision == null) {
          errorEl.textContent = tx('Le devis accepté ne correspond plus au dossier (dates, chambres, voyageurs ou formule ont changé). Relancez la simulation.');
          return;
        }
        const pendingRooms = allRooms.filter(r => selectedRoomIds.has(r.id) && !savedRooms[r.id]);
        const incomplete = pendingRooms.find(r => {
          const q = quoteBreakdown[r.id];
          return !q || !Array.isArray(q.rows) || !Number.isSafeInteger(q.totalCents) || quoteRevs[r.id] !== quoteRevision;
        });
        if (incomplete) {
          errorEl.textContent = tx('Devis incomplet ou périmé pour la chambre {n}. Relancez la simulation pour l’ensemble du groupe.', { n: incomplete.n });
          return;
        }
        try {
          const revRes = await fetch('/api/hotel/commercial?merchant=' + encodeURIComponent(initialMerchant), { cache: 'no-store' });
          const revBody = await revRes.json().catch(() => ({}));
          if (revRes.ok && Number.isSafeInteger(revBody.rev) && revBody.rev !== quoteRevision) {
            invalidateQuote();
            errorEl.textContent = tx('Le répertoire commercial a changé (révision {a} → {b}) depuis le devis accepté. Relancez la simulation avant de confirmer.', { a: quoteRevision, b: revBody.rev });
            return;
          }
        } catch (_) { /* unreachable directory: the save endpoint re-checks per room */ }
      }

      // Build the exact per-room payloads first (defect 2): stable clientRef
      // identities, frozen terms, traveler snapshot. Nothing is posted before
      // these payloads — with the frozen terms — are durably recorded.
      const roomPlans = allRooms
        .filter(r => selectedRoomIds.has(r.id))
        .map(room => {
          const roomKey = String(room.id).replace(/[^A-Za-z0-9_-]/g, '_');
          const clientRef = ('staff-grp-' + groupDossierId + '-' + roomKey).slice(0, 80);
          const roomGuests = travelers.filter(t => t.roomId === room.id).map(g => ({
            name: g.name,
            sex: g.sex || '',
            nationality: g.nationality || '',
            birthDate: g.birthDate || '',
            residenceCountry: g.residenceCountry || '',
            idDocType: g.idDocType || '',
            idDocNumber: g.idDocNumber || '',
          }));
          const roomDirect = (!accountId && groupDirect && groupDirect.perRoom[room.id] && groupDirect.perRoom[room.id].rows)
            ? { board, occupancy: Math.max(1, roomGuests.length), rows: groupDirect.perRoom[room.id].rows, totalCents: groupDirect.perRoom[room.id].totalCents }
            : null;
          return {
            room, clientRef,
            payload: {
              action: 'save',
              merchant: initialMerchant,
              dossierId: groupDossierId,
              groupName,
              clientRef,
              roomTypeId: room.typeId,
              resourceId: room.id,
              checkIn,
              checkOut,
              partySize: Math.max(1, roomGuests.length),
              status: 'confirmed',
              channel,
              customer: {
                name: roomGuests[0]?.name || contactName,
                phone: contactPhone,
                email: contactEmail,
              },
              guests: roomGuests,
              commercial: {
                accountId,
                booker: contactName,
                board,
                quoted: !!quoteAccepted,
              },
              quoteRevision: quoteRevision != null ? quoteRevision : undefined,
              acceptQuote: !!quoteAccepted,
              ...(roomDirect ? { directPricing: roomDirect } : {}),
            },
          };
        });

      // Never overwrite an unresolved intent with incompatible edits: a retry
      // reuses the frozen terms by construction, so any divergence here means
      // the draft was tampered with outside the locked UI — stop loudly
      // instead of splitting one dossier across two commercial identities.
      const priorIntent = readIntent(groupDossierId);
      if (priorIntent && priorIntent.status !== 'complete' && Object.keys(savedRooms).length > 0 && priorIntent.terms && termsDiffer(priorIntent.terms, terms)) {
        errorEl.textContent = tx('Ce dossier a changé depuis son enregistrement partiel et ne peut pas être repris tel quel. Abandonnez le brouillon local pour recommencer un dossier propre.');
        return;
      }

      // Persist the authoritative intent before the first network write.
      // A failure here stops everything: no booking is written without its
      // recovery record. The draft cache (persistStaged) is best-effort —
      // recovery is driven by the intent, never by the cache.
      try {
        writeIntent({
          version: INTENT_VERSION,
          status: 'in-progress',
          merchant: initialMerchant,
          dossierId: groupDossierId,
          terms: { ...terms },
          rooms: roomPlans.map(p => ({ roomId: p.room.id, roomN: p.room.n, clientRef: p.clientRef, payload: p.payload })),
          travelers: JSON.parse(JSON.stringify(travelers)),
          quoteBreakdown: JSON.parse(JSON.stringify(quoteBreakdown)),
          quoteRevs: { ...quoteRevs },
          quoteRevision,
          quoteAccepted,
          activeQuoteSignature,
          createdAt: (priorIntent && priorIntent.createdAt) || Date.now(),
          updatedAt: Date.now(),
        });
      } catch (storageErr) {
        errorEl.textContent = tx('Impossible de sécuriser l’intention de réservation en stockage local ({reason}). Aucune chambre n’a été enregistrée : libérez de l’espace ou autorisez le stockage, puis relancez la confirmation.', { reason: storageErr.message || tx('quota dépassé') });
        return;
      }
      // Read the record back: the loop below iterates the persisted attempt,
      // proving the payloads were durable before the first booking write.
      const attempt = readIntent(groupDossierId);
      if (!attempt || attempt.status === 'complete' || !Array.isArray(attempt.rooms) || attempt.rooms.length !== roomPlans.length) {
        errorEl.textContent = tx('Intention de réservation illisible après écriture. Aucune chambre n’a été enregistrée : réessayez la confirmation.');
        return;
      }
      if (!persistStaged()) {
        toast(tx('Brouillon local non sauvegardé (stockage indisponible). La reprise reste assurée par l’intention durable du dossier.'), { type: 'warn' });
      }

      form.__hxSubmitting = true;
      form.classList.add('is-submitting');
      submitBtn.disabled = true;
      errorEl.textContent = tx('Contrôle des disponibilités et enregistrement des chambres…');

      const formControls = Array.from(form.querySelectorAll('input, select, textarea, button'));
      formControls.forEach(el => {
        if (!el.disabled) {
          el.setAttribute('data-hx-submitting-disabled', '1');
          el.disabled = true;
        }
      });

      // Material comparison between a server booking and the payload we would
      // write (defect 3, hardened). Room, dates, party and dossier are not
      // enough: a guest renamed, a swapped account or meal plan, or a
      // different booker on another device must surface as an
      // incompatibility — never as a silent adopt, and never as a
      // delete-and-recreate.
      //
      // Empty values compare as REAL values (defect 2): the old
      // `if (a && ...)` guard let a cleared phone, e-mail, account, board or
      // group name pass as "unchanged". Every field below is stored by every
      // save path (room, dates, partySize, dossierId defaulted to the stay
      // id, groupName since dossiers exist, channel defaulted, customer
      // always written, commercial normalized to '' when absent), so an
      // empty-vs-filled difference is a genuine change — including a legacy
      // record that never contained the term. Such a record must not certify
      // terms it never held: the run fails naming the field, the server
      // version is preserved, and the explicit amendment flow (or a clean
      // restart after discarding the draft) is the way forward.
      const normField = (s) => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase();
      const guestIdentity = (g) => [g && g.name, g && g.idDocNumber, g && g.nationality, g && g.birthDate, g && g.sex].map(normField).join('|');
      // A reconciliation answer is only authoritative entry by entry
      // (follow-up): nulls, primitives, arrays masquerading as bookings and
      // records without identity (id) or status must never read as "no
      // booking". That misreading used to fall through to POST, whose
      // idempotent replay was then adopted with zero material checks.
      const asBookingRecord = (value) => {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
        if (typeof value.id !== 'string' || !value.id) return null;
        if (typeof value.status !== 'string' || !value.status) return null;
        return value;
      };
      // Shared adoption gate for GET-found and POST-returned bookings
      // (follow-up): cancelled/no-show refuses, then the material
      // comparison. Fresh POSTs pass by construction (the server echoes the
      // payload); idempotent replays pass only when the pre-existing booking
      // still matches what we would write. Returns null when adoptable,
      // otherwise { kind, field } for the caller to phrase.
      const adoptionProblem = (booking, payload, room) => {
        if (['cancelled', 'no_show'].includes(booking.status)) return { kind: 'cancelled' };
        const mismatch = bookingMatchesPayload(booking, payload, room);
        if (mismatch) return { kind: 'mismatch', field: mismatch };
        return null;
      };
      /* The compared fields keep their French names; the message reads them. */
      const cuFieldLabel = (f) => ({ chambre: tx('chambre'), 'arrivée': tx('arrivée'), 'départ': tx('départ'), effectif: tx('effectif'),
        dossier: tx('dossier'), 'nom du groupe': tx('nom du groupe'), canal: tx('canal'), contact: tx('contact'), 'téléphone': tx('téléphone'),
        'e-mail': tx('e-mail'), compte: tx('compte'), formule: tx('formule'), voyageurs: tx('voyageurs') })[f] || f;
      const bookingMatchesPayload = (existing, payload, room) => {
        const pairs = [
          ['chambre', existing.resourceId || existing.hotel?.roomId || '', room.id],
          ['arrivée', existing.hotel?.checkIn || '', payload.checkIn],
          ['départ', existing.hotel?.checkOut || '', payload.checkOut],
          ['effectif', String(existing.partySize ?? ''), String(payload.partySize)],
          ['dossier', existing.hotel?.dossierId || '', payload.dossierId],
          ['nom du groupe', existing.hotel?.groupName || '', payload.groupName || ''],
          ['canal', existing.hotel?.channel || '', payload.channel || ''],
          ['contact', existing.customer?.name || '', (payload.customer && payload.customer.name) || ''],
          ['téléphone', existing.customer?.phone || '', (payload.customer && payload.customer.phone) || ''],
          ['e-mail', existing.customer?.email || '', (payload.customer && payload.customer.email) || ''],
          ['compte', (existing.commercial && existing.commercial.accountId) || '', (payload.commercial && payload.commercial.accountId) || ''],
          ['formule', (existing.commercial && existing.commercial.board) || '', (payload.commercial && payload.commercial.board) || ''],
        ];
        for (const [label, a, b] of pairs) {
          if (normField(a) !== normField(b)) return label;
        }
        // Guest identities, order-insensitive (homonyms stay distinct rows,
        // the server drops fully-empty rows exactly like the payload filter).
        const keptGuests = (payload.guests || []).filter(g => g && (g.name || g.nationality || g.idDocNumber));
        const aGuests = (existing.guests || []).map(guestIdentity).sort().join(';');
        const bGuests = keptGuests.map(guestIdentity).sort().join(';');
        if (aGuests !== bGuests) return 'voyageurs';
        return null;
      };

      try {
        // Iterate the persisted attempt (defect 2): every payload below was
        // durable before the first booking write of this attempt.
        for (const entry of attempt.rooms) {
          const room = allRooms.find(r => r.id === entry.roomId);
          if (!room) {
            const errMsg = tx('La chambre {n} n’existe plus au plan. Retirez-la du dossier pour continuer.', { n: entry.roomN || entry.roomId });
            failedRooms[entry.roomId] = errMsg;
            persistStaged();
            renderRooms();
            throw new Error(errMsg);
          }
          const payload = entry.payload;
          const clientRef = entry.clientRef;
          if (initialScope !== cuStayScope() || initialMerchant !== cuMerchantSlug() || openModal?.el !== m.el || !form.isConnected) {
            throw new Error(tx('L’hôtel actif a changé pendant l’enregistrement.'));
          }

          // Server reconciliation (defect 3): EVERY room is checked against
          // the server by its stable clientRef — including rooms this browser
          // already marks saved. A cancellation or an edit on another device
          // must surface here, never hide behind an old local snapshot. Only
          // when the server itself is unreachable do we provisionally trust
          // the local snapshot (the following write would fail first anyway,
          // and the next online pass re-verifies).
          // Reconciliation lookup, schema-validated (defect 1): only a
          // well-formed envelope authorizes anything below. A failed HTTP
          // status, a network fault, or a malformed body (stays missing,
          // not a list, first entry not an object) all mean the same thing:
          // this room is UNVERIFIED, and nothing may treat it as confirmed.
          let existingBooking = null;
          let checkOk = false;
          try {
            const checkRes = await fetch('/api/hotel/stays?merchant=' + encodeURIComponent(initialMerchant) + '&clientRef=' + encodeURIComponent(clientRef) + '&includeCancelled=1', { cache: 'no-store' });
            if (checkRes.ok) {
              const checkData = await checkRes.json().catch(() => null);
              const stays = (checkData && Array.isArray(checkData.stays)) ? checkData.stays : null;
              // Valid-empty ([]) authorizes the POST below; every non-empty
              // answer must be entry-validated first. A single malformed
              // entry poisons the whole lookup: treating it as "no booking"
              // would route into POST, whose replay used to bypass every
              // check. The returned identity must also answer to the
              // reference we asked for.
              if (stays !== null) {
                const malformed = stays.some((s) => {
                  const rec = asBookingRecord(s);
                  return !rec || (typeof rec.publicRef === 'string' && rec.publicRef !== '' && rec.publicRef !== clientRef);
                });
                if (!malformed) {
                  checkOk = true;
                  existingBooking = stays.length ? stays[0] : null;
                }
              }
            }
          } catch (_) { checkOk = false; }

          if (initialScope !== cuStayScope() || initialMerchant !== cuMerchantSlug() || openModal?.el !== m.el || !form.isConnected) {
            throw new Error(tx('L’hôtel actif a changé pendant la vérification.'));
          }

          // A claimed-saved room the server could not confirm PAUSES the
          // operation (defect 1): adopting it would bless a stale snapshot
          // (e.g. a cancellation on another device), and skipping past it
          // would let the run finish "successfully" around a hole — room 102
          // saved, modal closed, room 101 quietly cancelled. The intent and
          // draft records stay exactly as they are, the room keeps its
          // failure badge, and the retry (server reachable again) re-runs
          // this same lookup. Nothing is counted as confirmed here.
          if (!existingBooking && savedRooms[room.id] && !checkOk) {
            const errMsg = tx('La chambre {n} n’a pas pu être revérifiée auprès du serveur (réconciliation indisponible). La reprise est en pause : réessayez avec le serveur joignable. Rien n’a été validé à tort.', { n: room.n });
            failedRooms[room.id] = errMsg;
            persistStaged();
            renderRooms();
            throw new Error(errMsg);
          }

          if (existingBooking) {
            const problem = adoptionProblem(existingBooking, payload, room);
            if (problem) {
              const errMsg = problem.kind === 'cancelled'
                ? tx('La réservation existante pour la chambre {n} est annulée ou non présentée ({status}).', { n: room.n, status: cuDraftStatus(existingBooking.status) })
                : tx('Incompatibilité ({field}) détectée pour la réservation existante ({id}) de la chambre {n}. Le serveur a une version différente : aucune écriture, utilisez un avenant explicite.', { field: cuFieldLabel(problem.field), id: existingBooking.id, n: room.n });
              failedRooms[room.id] = errMsg;
              persistStaged();
              renderRooms();
              throw new Error(errMsg);
            }

            savedRooms[room.id] = existingBooking;
            delete failedRooms[room.id];
            initialCache.set(existingBooking.id, existingBooking);
            if (!committedTerms) { freezeTerms(terms); lockCommittedFields(); }
            persistStaged();
            renderRooms();
            renderTravelers();
            updateTravelerRoomOptions();
            continue;
          }

          // A lost response is not a failed booking (defect 2): the server
          // may have saved it. Name the room, keep the badge, and let the
          // clientRef reconciliation adopt it on retry instead of guessing.
          let res;
          try {
            res = await fetch('/api/hotel/stays', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
            });
          } catch (netErr) {
            const errMsg = tx('La réponse du serveur pour la chambre {n} a été perdue ({reason}). La réservation sera vérifiée à la reprise.', { n: room.n, reason: (netErr && netErr.message) || tx('réseau') });
            failedRooms[room.id] = errMsg;
            persistStaged();
            renderRooms();
            throw new Error(errMsg);
          }
          const body = await res.json().catch(() => ({}));

          if (initialScope !== cuStayScope() || initialMerchant !== cuMerchantSlug() || openModal?.el !== m.el || !form.isConnected) {
            throw new Error(tx('L’hôtel actif a changé pendant l’enregistrement.'));
          }

          if (!res.ok || !body.booking) {
            const errMsg = cuCommercialError(body.error) || body.error || tx('chambre indisponible');
            failedRooms[room.id] = errMsg;
            persistStaged();
            renderRooms();
            throw new Error(tx('Erreur sur la chambre {n} : {reason}', { n: room.n, reason: errMsg }));
          }

          // The POST answer goes through the same gate (follow-up): a
          // malformed record is a failed write, never an adoption, and an
          // idempotent replay is only adopted when it still matches what we
          // would write — a replay carrying another device's edits must fail
          // here, not masquerade as our fresh booking.
          const returned = asBookingRecord(body.booking);
          if (!returned || (typeof returned.publicRef === 'string' && returned.publicRef !== '' && returned.publicRef !== clientRef)) {
            const errMsg = tx('La réponse du serveur pour la chambre {n} est inexploitable. La reprise est en pause : réessayez avec le serveur joignable.', { n: room.n });
            failedRooms[room.id] = errMsg;
            persistStaged();
            renderRooms();
            throw new Error(errMsg);
          }
          const postProblem = adoptionProblem(returned, payload, room);
          if (postProblem) {
            const errMsg = postProblem.kind === 'cancelled'
              ? tx('La réservation retournée pour la chambre {n} est annulée ou non présentée.', { n: room.n })
              : tx('Incompatibilité ({field}) détectée pour la réservation retournée ({id}) de la chambre {n}. Le serveur a une version différente : aucune écriture, utilisez un avenant explicite.', { field: cuFieldLabel(postProblem.field), id: returned.id, n: room.n });
            failedRooms[room.id] = errMsg;
            persistStaged();
            renderRooms();
            throw new Error(errMsg);
          }

          savedRooms[room.id] = returned;
          delete failedRooms[room.id];
          initialCache.set(returned.id, returned);
          cuStaysChanged();
          // First proven room freezes the dossier identity (defects 1+3):
          // the locked controls stop feeding submissions from here on.
          if (!committedTerms) { freezeTerms(terms); lockCommittedFields(); }
          persistStaged();
          renderRooms();
          renderTravelers();
          updateTravelerRoomOptions();
        }

        // Scope check before completing
        if (initialScope !== cuStayScope() || initialMerchant !== cuMerchantSlug() || openModal?.el !== m.el || !form.isConnected) {
          return;
        }

        // All rooms saved successfully: the intent is fulfilled, both the
        // authoritative record and the draft cache go away together.
        try { localStorage.removeItem(intentKeyFor(groupDossierId)); } catch (_) {}
        try { localStorage.removeItem(stagedKey); } catch (_) {}

        const doc = window.KiwiReservations?.get?.();
        if (doc && Array.isArray(doc.bookings)) {
          Object.values(savedRooms).forEach(b => {
            const idx = doc.bookings.findIndex(x => x.id === b.id);
            if (idx < 0) doc.bookings.push(b);
            else doc.bookings[idx] = b;
          });
          window.KiwiReservations.set(doc);
        }

        m.close();
        openModal = null;
        toast(tx('Réservation de groupe enregistrée'), {
          type: 'success',
          desc: groupName + ' · ' + tx('{n} chambre(s) confirmée(s).', { n: Object.keys(savedRooms).length, c: txn(Object.keys(savedRooms).length, 'chambre') }),
        });
        rerender();
      } catch (err) {
        if (initialScope !== cuStayScope() || initialMerchant !== cuMerchantSlug() || openModal?.el !== m.el || !form.isConnected) {
          return;
        }
        errorEl.textContent = (err.message || tx('Échec de la réservation de groupe.')) + (Object.keys(savedRooms).length ? ' ' + tx('Les chambres déjà enregistrées ({n}) restent conservées sous le dossier {id}.', { n: Object.keys(savedRooms).length, id: groupDossierId }) : '');
        if (Object.keys(savedRooms).length > 0) {
          submitBtn.textContent = tx('Reprendre la confirmation ({n} enregistrée(s))', { n: Object.keys(savedRooms).length });
        }
      } finally {
        form.__hxSubmitting = false;
        form.classList.remove('is-submitting');
        formControls.forEach(el => {
          if (el.hasAttribute('data-hx-submitting-disabled')) {
            el.removeAttribute('data-hx-submitting-disabled');
            el.disabled = false;
          }
        });
        lockCommittedFields();
        renderRooms();
        renderTravelers();
        submitBtn.disabled = false;
      }
    });
  }

  async function cuSubmitStay(form, booking, modal) {
    if (form.__hxSubmitting) return;
    const fd = new FormData(form), submit = form.querySelector('[type="submit"]'), error = form.querySelector('[data-hx-stay-error]');
    if (form.__hxStayScope !== cuStayScope()) { error.textContent = tx('L’hôtel actif a changé. Fermez ce dossier et rouvrez-le dans le bon établissement.'); return; }
    if (form.__hxTariffSyncState && form.__hxTariffSyncState !== 'ready') {
      error.textContent = form.__hxTariffSyncState === 'pending'
        ? tx('Attendez la confirmation du tarif par le serveur avant d’enregistrer la réservation.')
        : tx('Le nouveau tarif n’est pas encore confirmé par le serveur. Réessayez la synchronisation sans fermer ce brouillon.');
      return;
    }
    // The board selector lives in the commercial box: submitting before it
    // wires would silently fall back to room_only. Wait for it when the box
    // exists but is still loading; callers without the box (or with a failed
    // directory, where no meal choice exists) keep the legacy room-only path.
    if (form.querySelector('[data-hx-commercial-stay]') && !form.__commercialReady && !form.__commercialFailed) { error.textContent = tx('Tarifs en cours de chargement. Patientez quelques secondes puis réessayez.'); return; }
    const slug = cuMerchantSlug();
    const guestRows = [];
    const guestEls = Array.from(form.querySelectorAll('[data-hx-guest-row]'));
    for (let gi = 0; gi < guestEls.length; gi++) {
      const row = guestEls[gi];
      const birth = cuBirthIso(row.querySelector('[data-hx-guest-birth]')?.value);
      if (!birth.ok) {
        error.textContent = tx('Date de naissance invalide (voyageur {n}). Utilisez le format JJ/MM/AAAA.', { n: gi + 1 });
        row.querySelector('[data-hx-guest-birth]')?.focus?.();
        return;
      }
      guestRows.push({
        id: row.getAttribute('data-hx-guest-id') || '',
        name: String(row.querySelector('[data-hx-guest-name]')?.value || '').trim(),
        sex: String(row.querySelector('[data-hx-guest-sex]')?.value || '').trim(),
        nationality: String(row.querySelector('[data-hx-guest-nationality]')?.value || '').trim(),
        birthDate: birth.iso,
        minorsUnder18: Number(row.querySelector('[data-hx-guest-minors]')?.value || 0),
        residenceCountry: String(row.querySelector('[data-hx-guest-residence]')?.value || '').trim(),
        idDocType: String(row.querySelector('[data-hx-guest-id-type]')?.value || '').trim(),
        idDocNumber: String(row.querySelector('[data-hx-guest-id-num]')?.value || '').trim(),
      });
    }
    const guests = guestRows.filter((g) => g.name || g.nationality || g.idDocNumber);

    const partySize = Number(fd.get('partySize')) || 1;
    const roomTypeId = fd.get('roomTypeId');
    const selectedType = cuTypes().find((t) => t.id === roomTypeId);
    if (selectedType && partySize > (selectedType.maxGuests || 4)) {
      error.textContent = tx('La catégorie « {type} » ne peut pas accueillir {n} personnes (capacité max : {max}).', { type: selectedType.name || roomTypeId, n: partySize, c: txn(partySize, 'personne'), max: selectedType.maxGuests || 4 });
      return;
    }

    const payload = { action: 'save', merchant: slug, id: booking?.id || '', clientRef: form.__hxClientRef, roomTypeId, resourceId: fd.get('resourceId'), checkIn: fd.get('checkIn'), checkOut: fd.get('checkOut'), partySize, channel: fd.get('channel'), status: fd.get('status'), externalRef: fd.get('externalRef'), note: fd.get('note'), guests, customer: { name: fd.get('name'), phone: fd.get('phone'), email: fd.get('email') } };
    /* La version du dossier sur laquelle cette réception a travaillé. Le
       serveur refuse d'écrire par-dessus une version plus récente : c'est ce
       qui empêche deux réceptions d'effacer mutuellement leurs saisies. */
    if (booking) payload.expectedUpdatedAt = +booking.updatedAt || 0;
    payload.linkedStayId = form.__hxLinkedStayId || '';
    payload.dayUse = form.elements.stayMode?.value === 'day_use';
    if (payload.dayUse) {
      const price = String(fd.get('dayUsePrice') || '').trim().replace(',', '.');
      if (!/^\d{1,7}(\.\d{1,2})?$/.test(price)) { error.textContent = tx('Saisissez le forfait day-use convenu, avec deux décimales maximum.'); return; }
      payload.dayUseAmountCents = Math.round(Number(price) * 100);
      payload.arrivalTime = fd.get('arrivalTime'); payload.departureTime = fd.get('departureTime');
      payload.checkOut = payload.checkIn;
    }
    const board = fd.get('board') || 'room_only';
    const priceMode = fd.get('priceMode') || 'catalogue';
    const accountIdNow = form.__commercialReady ? String(fd.get('accountId') || '') : '';
    if (form.__commercialReady && !accountIdNow) {
      // Direct-guest path: the stay is priced from the hotel's own type
      // configuration — no account, no contract, no simulation. Ordinary
      // travelers were previously forced into creating a commercial account
      // for any meal plan; that gate is gone, replaced by configured rates.
      payload.commercial = { accountId: '', booker: fd.get('booker'), voucher: fd.get('voucher'), board, quoted: false };
      if (!payload.dayUse) {
        // Preservation first (defects 1+3): guest, contact, note, status and
        // traveler edits resend no pricing material at all, so the accepted
        // snapshot — including the original agreed authorization — survives
        // untouched. Only moved pricing inputs (or edited agreed terms)
        // attach fresh material, and configured changes need their own
        // confirmation click below.
        const storedNow = (booking && booking.pricing && booking.pricing.kind === 'direct') ? booking.pricing : null;
        const inputsMoved = !booking ? true : (typeof form.__pricingChanged === 'function' ? form.__pricingChanged() : true);
        const agreedNow = {
          amount: String(form.querySelector('[data-hx-agreed-amount]')?.value || '').trim().replace(',', '.'),
          reason: String(form.querySelector('[data-hx-agreed-reason]')?.value || '').trim(),
          checked: !!form.querySelector('[data-hx-agreed-confirm]')?.checked,
          visible: (() => { const bx = form.querySelector('[data-hx-agreed-box]'); return !!bx && !bx.hidden; })(),
        };
        const agreedDeviates = !!(storedNow && storedNow.agreed && agreedNow.amount !== '' && (
          Math.round(Number(agreedNow.amount) * 100) !== Number(storedNow.totalCents || 0) ||
          agreedNow.reason !== String(storedNow.reason || '')));
        if (!inputsMoved && !agreedDeviates) {
          // Nothing priced moved: keep the accepted snapshot server-side.
        } else {
          const typeNow = cuTypes().find((t) => t.id === fd.get('roomTypeId'));
          const dq = cuDirectQuote({
            typeRate: typeNow ? typeNow.rate : null, baseRate: cuState().baseRate, boardRates: typeNow ? typeNow.boardRates : null,
            board, checkIn: fd.get('checkIn'), checkOut: fd.get('checkOut'), occupancy: partySize,
          });
          if (agreedNow.visible && agreedNow.checked) {
            if (!/^\d{1,7}(\.\d{1,2})?$/.test(agreedNow.amount) || !(Number(agreedNow.amount) > 0)) { error.textContent = tx('Montant convenu invalide : un total TTC en MAD, supérieur à zéro.'); return; }
            if (agreedNow.reason.length < 3) { error.textContent = tx('Indiquez le motif du prix convenu (3 caractères minimum). Il sera enregistré sur la réservation avec votre identité.'); return; }
            payload.directPricing = { agreed: true, amountCents: Math.round(Number(agreedNow.amount) * 100), reason: agreedNow.reason.slice(0, 280), board, occupancy: partySize };
          } else if (!dq.ok) {
            if (booking && board === 'room_only' && !storedNow) {
              // Legacy room-only edit without a configured rate: keep the
              // previous behavior (server-side rate × nights) rather than
              // bricking the edit. New bookings never take this path.
            } else {
              const typeName = typeNow ? typeNow.name : tx('cette catégorie');
              const what = dq.missing.includes('dates')
                ? tx('Dates du séjour invalides.')
                : (dq.missing.includes('room')
                  ? tx('Aucun tarif logement configuré pour « {type} ».', { type: typeName })
                  : tx('Aucun tarif « {board} » configuré pour « {type} ».', { board: cuBoards[board] || board, type: typeName }));
              error.textContent = what + (dq.missing.includes('dates') ? '' : ' ' + tx('Renseignez-le dans Types de chambres, ou convenez un prix ci-dessous.'));
              return;
            }
          } else {
            if (booking && storedNow && inputsMoved) {
              const rw = form.querySelector('[data-hx-reprice-confirm]');
              if (!rw || !rw.checked) { error.textContent = tx('Le tarif a changé : vérifiez le nouveau total affiché puis confirmez la revalorisation.'); return; }
            }
            payload.directPricing = { board, occupancy: partySize, rows: dq.rows, totalCents: dq.totalCents };
          }
        }
      }
    } else if (form.__commercialReady) {
      payload.commercial = { accountId: fd.get('accountId'), booker: fd.get('booker'), voucher: fd.get('voucher'), board, quoted: priceMode === 'contract' };
      const preview = form.__commercialQuote;
      const changed = !booking ? true : (typeof form.__pricingChanged === 'function' ? form.__pricingChanged() : true);
      if (preview && preview.signature === cuStayQuoteSignature(form) && form.querySelector('[data-hx-accept-quote]')?.checked) {
        payload.acceptQuote = true; payload.quoteRevision = preview.rev;
      } else if (changed && (board !== 'room_only' || priceMode === 'contract')) {
        error.textContent = tx('Formule repas ou tarif contractuel : simulez le contrat et cochez l’acceptation du prix avant de valider.');
        return;
      }
    }
    if (!slug) { error.textContent = tx('Cette boutique n’est pas encore reliée à son compte Kiwi.'); return; }
    form.__hxSubmitting = true; submit.disabled = true; error.textContent = '';
    const scope = cuStayScope(), cache = cuStayCache();
    try {
      const res = await fetch('/api/hotel/stays', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.booking) {
        const messages = {
          'room-unavailable': tx('Cette chambre vient d’être prise sur ces dates. Choisissez-en une autre.'),
          'room-type-not-found': tx('La catégorie choisie ne peut pas accueillir {n} personnes. Ajustez le nombre d’occupants ou changez de catégorie.', { n: partySize, c: txn(partySize, 'personne') }),
          'duplicate-reference': tx('Cette référence OTA existe déjà.'),
          'invalid-dates': tx('Les dates du séjour sont invalides.'),
          'account-required': tx('Sélectionnez un compte commercial avant de simuler un contrat.'),
          'account-archived': tx('Le compte commercial sélectionné est archivé. Choisissez un compte actif ou réactivez-le dans le Cardex.'),
          'account-not-found': tx('Le compte commercial sélectionné est introuvable pour cet établissement.'),
          'invalid-formula': tx('La tarification contractuelle couvre de 1 à 3 personnes. Ajustez le nombre d’occupants.'),
          invalid: tx('Complétez le nom, les dates et la catégorie.'),
          unauthorized: tx('Votre session a expiré. Reconnectez-vous.'),
          /* Le dossier a bougé sous nos yeux : on ne l'écrase pas. La version
             fraîche revient avec le refus, on la remet en mémoire et on invite
             à rouvrir — la collègue qui vient d'y saisir un téléphone ne le
             perd pas. */
          'stay-conflict': tx('Ce dossier vient d’être modifié depuis un autre poste. Rouvrez-le pour voir la version à jour, puis refaites votre modification.'),
          'expected-updated-at-required': tx('Cette page est trop ancienne pour enregistrer sans risque d’écraser une autre saisie. Rafraîchissez, puis refaites votre modification.')
        };
        /* Le refus porte la version fraîche du serveur : on la range tout de
           suite, pour que la réouverture du dossier montre la vérité. */
        if (body.booking && (body.error === 'stay-conflict' || body.error === 'expected-updated-at-required')) {
          try {
            cache.set(body.booking.id, body.booking);
      cuStaysChanged();
            const live = window.KiwiReservations?.get?.();
            if (live && Array.isArray(live.bookings)) {
              const at = live.bookings.findIndex((x) => x.id === body.booking.id);
              if (at >= 0) live.bookings[at] = body.booking;
            }
          } catch (_) {}
        }
        error.textContent = messages[body.error] || cuCommercialError(body.error); return;
      }
      cache.set(body.booking.id, body.booking);
      cuStaysChanged();
      if (scope !== cuStayScope() || cuMerchantSlug() !== slug) { return; }
      const doc = window.KiwiReservations?.get?.();
      if (doc && Array.isArray(doc.bookings)) {
        const i = doc.bookings.findIndex((x) => x.id === body.booking.id);
        if (i < 0) doc.bookings.push(body.booking); else doc.bookings[i] = body.booking;
        window.KiwiReservations.set(doc);
      }
      modal?.close?.();
      if (openModal?.el === modal?.el) openModal = null;
      toast(tx('Séjour enregistré · ch. {n}', { n: (cuState().rooms && Object.values(cuState().rooms).find((r) => r.id === body.booking.resourceId)?.n) || '' }), { type: 'success', desc: cuDay(body.booking.hotel.checkIn) + hxTo() + cuDay(body.booking.hotel.checkOut) + ' · ' + (body.booking.hotel.channel || 'direct') });
      rerender();
    } catch (_) { error.textContent = tx('Réponse serveur non reçue. Vérifiez le dossier ou réessayez : la même référence sera conservée pour éviter un doublon.'); }
    finally {
      form.__hxSubmitting = false;
      submit.disabled = !!(form.__hxTariffSyncState && form.__hxTariffSyncState !== 'ready');
    }
  }

  async function cuCancelStay(id, button, modal) {
    const slug = cuMerchantSlug();
    if (!slug || !id) return;
    const scope = cuStayScope(), cache = cuStayCache();
    button.disabled = true;
    try {
      const res = await fetch('/api/hotel/stays', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'cancel', merchant: slug, id }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.booking) { toast(tx('Annulation impossible'), { type: 'warn', desc: body.error || tx('Réessayez.') }); return; }
      cache.set(body.booking.id, body.booking);
      cuStaysChanged();
      if (scope !== cuStayScope() || cuMerchantSlug() !== slug) { return; }
      const doc = window.KiwiReservations?.get?.();
      if (doc && Array.isArray(doc.bookings)) {
        const i = doc.bookings.findIndex((x) => x.id === body.booking.id);
        if (i >= 0) doc.bookings[i] = body.booking;
        window.KiwiReservations.set(doc);
      }
      modal?.close?.();
      if (openModal?.el === modal?.el) openModal = null;
      toast(tx('Séjour annulé dans Kiwi'), { type: 'success', desc: tx('La disponibilité directe est mise à jour. Vérifiez séparément l’annulation sur l’OTA ou auprès de l’agence.') });
      rerender();
    } catch (_) { toast(tx('Confirmation non reçue'), { type: 'warn', desc: tx('Actualisez le dossier pour vérifier si l’annulation a été enregistrée.') }); }
    finally { button.disabled = false; }
  }
  /* Arrivée et départ, depuis le journal de réception.
   *
   * Le journal listait les mouvements du jour sans permettre de les
   * enregistrer. On passe par l'action `status`, qui ne touche que le statut :
   * un `save` complet reconstruit le dossier à partir de ce qu'on envoie et
   * effacerait le téléphone, l'e-mail ou les voyageurs non renvoyés. */
  async function cuMoveStayStatus(id, next, button, reopen, force = false) {
    const slug = cuMerchantSlug();
    if (!slug || !id) return;
    const scope = cuStayScope(), cache = cuStayCache();
    /* Quatre mouvements passent par ici, pas deux : arrivée, départ, annulation
       d'une arrivée saisie par erreur, et non-présentation. Les messages les
       nomment tous — « Départ non enregistré » sur une annulation d'arrivée
       ferait douter la réception de ce qu'elle vient de faire. */
    const WORDING = {
      checked_in: { fail: tx('Arrivée non enregistrée'), done: tx('Client arrivé'), desc: tx('La chambre apparaît occupée dans le plan.') },
      completed: { fail: tx('Départ non enregistré'), done: tx('Départ enregistré'), desc: tx('La chambre passe à nettoyer dans le plan et la file ménage.') },
      confirmed: { fail: tx('Arrivée non annulée'), done: tx('Arrivée annulée'), desc: tx('Le séjour repart de « confirmé » et la chambre est rendue. Le geste est tracé au journal.') },
      no_show: { fail: tx('Non-présentation non enregistrée'), done: tx('Client non présenté'), desc: tx('Le séjour est clos sans facturation de séjour. La chambre est libérée.') },
    };
    if (reopen) WORDING.checked_in = { fail: tx('Dossier non rouvert'), done: tx('Dossier rouvert'),
      desc: tx('La facturation redevient modifiable. Reclôturez le séjour une fois le dossier réparé.') };
    const words = WORDING[next] || WORDING.completed;
    if (button) button.disabled = true;
    try {
      const res = await fetch('/api/hotel/stays', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'status', merchant: slug, id, status: next, force,
          /* Réouverture d'un dossier clos : un geste explicite, jamais un
             effet de bord d'un changement de statut ordinaire. */
          ...(reopen ? { reopen: true } : {}) }),
      });
      const body = await res.json().catch(() => ({}));
      if (scope !== cuStayScope() || cuMerchantSlug() !== slug) return;
      if (res.status === 409 && body.error === 'stay-unpaid' && !force) {
        if (confirm(tx('Il reste {amount} MAD à régler. Confirmer le départ avec ce solde impayé ?', { amount: cuDraftMoney(body.owedCents) }))) return await cuMoveStayStatus(id, next, button, reopen, true);
        return;
      }
      if (!res.ok || !body.booking) {
        toast(words.fail, {
          type: 'warn',
          desc: body.error === 'invalid-status-transition'
            ? tx('Statut actuel : {status}. Ouvrez le dossier.', { status: body.from ? cuDraftStatus(body.from) : tx('inconnu') })
            : body.error === 'reopen-forbidden'
              ? tx('Seul le propriétaire du compte peut rouvrir un dossier clos.')
            : body.error === 'room-occupied'
              ? tx('Cette chambre est déjà occupée par un autre séjour. Vérifiez le plan et attribuez une autre chambre.')
              : (body.error || tx('Réessayez.')),
        });
        return;
      }
      cache.set(body.booking.id, body.booking);
      cuStaysChanged();
      if (scope !== cuStayScope() || cuMerchantSlug() !== slug) return;
      const doc = window.KiwiReservations?.get?.();
      if (doc && Array.isArray(doc.bookings)) {
        const i = doc.bookings.findIndex((x) => x.id === body.booking.id);
        if (i >= 0) doc.bookings[i] = body.booking;
      }
      toast(words.done, { type: 'success', desc: words.desc });
      rerender();
    } catch (_) {
      toast(tx('Confirmation non reçue'), { type: 'warn', desc: tx('Actualisez le journal pour vérifier si le mouvement a été enregistré.') });
    } finally { if (button) button.disabled = false; }
  }
  const cuCommercialByScope = new Map();
  /* Getters, not strings: each read names the formula in the current language. */
  const cuBoards = {
    get room_only() { return tx('Logement seul'); }, get bb() { return tx('Bed & Breakfast'); },
    get hb_lunch() { return tx('Demi-pension · déjeuner'); }, get hb_dinner() { return tx('Demi-pension · dîner'); },
    get full_board() { return tx('Pension complète'); },
  };
  const cuKinds = { get individual() { return tx('Particulier'); }, get agency() { return tx('Agence'); }, get company() { return tx('Société'); } };
  function cuStayQuoteSignature(form) { return window.__kiwiHotelInternal.part('rates').cuStayQuoteSignature.apply(this, arguments); }
  /* Direct-guest pricing, pure and shared (single editor + group modal +
   * unit tests): room nightly rate plus the meal supplement per person per
   * night, from the hotel's own type configuration — never a contract, never
   * an account. Mirrors priceDirectStay() server-side cent for cent; any
   * divergence fails closed at save with price-mismatch.
   * Returns { ok, rows, totalCents, nights, roomCents, mealCents } or
   * { ok:false, missing:['room'|'meal'|'dates'] }. */
  /* Birth dates are typed, not picked: native date inputs render in the
   * browser UI locale (mm/dd/yyyy on an English browser) no matter the page
   * language, while receptionists type JJ/MM/AAAA. Stored ISO stays the
   * single persisted shape; these convert at the editor edges. */
  function cuBirthDisplay(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || '').trim());
    return m ? `${m[3]}/${m[2]}/${m[1]}` : String(iso || '');
  }
  function cuBirthIso(raw) {
    const s = String(raw || '').trim().replace(/-/g, '/');
    if (!s) return { ok: true, iso: '' };
    const iso = /^(\d{4})\/(\d{2})\/(\d{2})$/.exec(s);
    const fr = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
    let y = 0, m = 0, d = 0;
    if (iso) { y = +iso[1]; m = +iso[2]; d = +iso[3]; }
    else if (fr) { d = +fr[1]; m = +fr[2]; y = +fr[3]; }
    else return { ok: false, iso: '' };
    if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return { ok: false, iso: '' };
    const dt = new Date(Date.UTC(y, m - 1, d));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return { ok: false, iso: '' };
    const p = (n) => String(n).padStart(2, '0');
    return { ok: true, iso: `${y}-${p(m)}-${p(d)}` };
  }
  /* Tariff-save acknowledgment for the stay editor. The type editor returns
   * after the LOCAL write; its server push is still in flight. A new total
   * is ready to book only once the rooms document is acknowledged — never
   * before. Pending, busy, offline and failed saves each get a visible
   * state; the reservation draft is never touched and retry is offered. */
  const HX_TARIFF_SYNC_COPY = {
    get pending() { return tx('Synchronisation du tarif avec le serveur…'); },
    get failed() { return tx('Tarif enregistré sur cet appareil, mais pas confirmé par le serveur. Votre brouillon est intact.'); },
    get offline() { return tx('Connexion perdue : tarif enregistré sur cet appareil uniquement. Votre brouillon est intact.'); },
    get retry() { return tx('Réessayer la synchronisation'); },
  };
  function cuSetTariffSync(form, state, render = true) { return window.__kiwiHotelInternal.part('rates').cuSetTariffSync.apply(this, arguments); }
  async function cuAwaitTariffAck(form) {
    // A scheduled save can already own the cloud writer when this flow starts.
    // Busy means "still pending", not "failed". Wait beyond cloud-doc's 10 s
    // request timeout, then keep the gate pending and retry in the background.
    const deadline = Date.now() + 14000;
    while (form && form.isConnected) {
      let ack = null;
      try { ack = await hotelCloud?.flush?.(); } catch (_) { ack = null; }
      if (ack && ack.ok) return { ok: true };
      if (!ack || ack.error !== 'busy') return { ok: false, offline: !!(ack && ack.offline), error: ack && ack.error };
      if (Date.now() >= deadline) return { ok: false, pending: true };
      await new Promise((r) => setTimeout(r, 500));
    }
    return { ok: false, cancelled: true };
  }
  function cuTariffSyncCycle(form, pendingDelayMs) { return window.__kiwiHotelInternal.part('rates').cuTariffSyncCycle.apply(this, arguments); }
  function cuTariffRetry(form) { return window.__kiwiHotelInternal.part('rates').cuTariffRetry.apply(this, arguments); }
  function cuDirectQuote(input) { return window.__kiwiHotelInternal.part('rates').cuDirectQuote.apply(this, arguments); }
  function cuQuoteRows(q) { return window.__kiwiHotelInternal.part('rates').cuQuoteRows.apply(this, arguments); }
  function cuWireStayCommercial(form, booking) { return window.__kiwiHotelInternal.part('rates').cuWireStayCommercial.apply(this, arguments); }
  function cuCommercialState() {
    const scope = cuStayScope();
    if (!cuCommercialByScope.has(scope)) cuCommercialByScope.set(scope, { accounts: [], contracts: [], rev: 0, loaded: false, loading: false, error: '', kind: '', search: '' });
    return cuCommercialByScope.get(scope);
  }
  function cuCommercialError(code) {
    return tx(({ stale: txk('Le répertoire a changé sur un autre appareil. Actualisez avant de reprendre votre modification.'),
      'rate-gap': txk('Une ou plusieurs nuits n’ont aucun tarif. Complétez les dates du contrat.'),
      'rate-overlap': txk('Deux tarifs couvrent les mêmes dates pour ce compte, cette catégorie, cette occupation et cette formule.'),
      'mixed-tax-basis': txk('Le séjour mélange des tarifs HT et TTC. Harmonisez le contrat.'),
      'account-required': txk('Sélectionnez un compte commercial avant de simuler un contrat.'),
      'account-archived': txk('Le compte commercial sélectionné est archivé. Choisissez un compte actif ou réactivez-le dans le Cardex.'),
      'account-not-found': txk('Le compte commercial sélectionné est introuvable pour cet établissement.'),
      'account-unavailable': txk('Le compte commercial est absent ou archivé.'),
      'room-type-not-found': txk('La catégorie choisie ne peut pas accueillir ce nombre d’occupants ou est introuvable.'),
      'room-unavailable': txk('Cette chambre vient d’être prise sur ces dates. Choisissez-en une autre.'),
      'invalid-price': txk('Saisissez un montant positif ou nul, avec deux décimales maximum.'),
      'quote-required': txk('Simulez puis acceptez le tarif pour les dates et voyageurs sélectionnés.'),
      'reprice-required': txk('Les dates, la chambre, la formule ou le compte ont changé : vérifiez le nouveau tarif affiché puis confirmez.'),
      'direct-pricing-required': txk('Formule sans tarif : affichez le prix maison ci-dessus, ou convenez un prix avec le client.'),
      'rate-missing': txk('Aucun tarif configuré pour cette formule. Renseignez-le dans Types de chambres, ou convenez un prix.'),
      'price-mismatch': txk('Le tarif affiché ne correspond plus à la configuration. Recommencez la réservation.'),
      'price-overflow': txk('Montant trop élevé pour être enregistré. Vérifiez le tarif.'),
      'mixed-pricing': txk('Un séjour ne peut pas combiner compte commercial et tarif maison. Choisissez un seul mode.'),
      'agreed-invalid': txk('Prix convenu invalide : montant positif et motif de 3 caractères minimum.'),
      'agreed-forbidden': txk('Un prix convenu exige un responsable (propriétaire ou gérant).'),
      'tax-configuration-required': txk('Un tarif HT ne peut pas être confirmé avant configuration de la fiscalité hôtelière.'),
      'feed-contract-unsupported': txk('Un séjour importé par iCal ne peut pas encore recevoir un contrat tarifaire.'),
      'closed-commercial': txk('Les informations commerciales d’un dossier clôturé sont verrouillées.'),
      'invalid-day-use': txk('Le day-use nécessite une arrivée et un départ le même jour, avec une heure de départ après l’arrivée.'),
      'day-use-price-required': txk('Indiquez le forfait day-use convenu, sans tarif automatique par nuit.'),
      'stay-mode-locked': txk('Le type de séjour est fixé à la création. Créez un nouveau séjour pour le modifier.'),
      'day-use-contract-unsupported': txk('Les contrats par nuit ne sont pas applicables au day-use. Indiquez son forfait TTC.'),
      'linked-stay-not-found': txk('Le dossier d’origine est introuvable dans cet hôtel.'),
      unauthorized: txk('Accès réservé au compte propriétaire ou à la console opérateur.'),
      'invalid-dates': txk('Vérifiez les dates de début et de fin.'),
      'invalid-formula': txk('La tarification contractuelle couvre de 1 à 3 personnes (Single, Double ou Triple). Ajustez le nombre d’occupants.') })[code] || txk('Enregistrement indisponible. Vérifiez les champs et réessayez.'));
  }
  async function cuLoadCommercial() {
    const st = cuCommercialState(), scope = cuStayScope(), merchant = cuChannelMerchant();
    if (!merchant || st.loading) return;
    st.loading = true; st.error = '';
    try {
      const res = await fetch('/api/hotel/commercial?merchant=' + encodeURIComponent(merchant), { cache: 'no-store' });
      const b = await res.json();
      if (!res.ok || !Array.isArray(b.accounts) || !Array.isArray(b.contracts)) throw new Error(b.error || 'unavailable');
      Object.assign(st, { accounts: b.accounts, contracts: b.contracts, rev: b.rev, loaded: true });
    } catch (e) { st.error = cuCommercialError(e.message); }
    finally { st.loading = false; if (scope === cuStayScope() && openDrawer?.page === 'commercial') rerender(); }
  }
  function cuCommercialBody() {
    const st = cuCommercialState(), needle = st.search.toLocaleLowerCase('fr');
    const accounts = st.accounts.filter(a => (!st.kind || a.kind === st.kind) && [a.name, a.legalName, a.contact, a.ice].join(' ').toLocaleLowerCase('fr').includes(needle));
    const accountIds = new Set(accounts.map(a => a.id));
    const contracts = st.contracts.filter(r => accountIds.has(r.accountId));
    const active = st.accounts.filter(a => !a.archived);
    return `<div class="hx-page hx-commercial"><div class="hx-commercial-head"><div><span class="hx-kicker">${tx('RELATIONS HÔTELIÈRES')}</span><h3>${tx('Chaque relation,<br>ses accords.')}</h3><p>${tx('Clients, agences & sociétés. Le voyageur reste distinct du réservant et du compte à facturer. Les tarifs acceptés sont conservés dans chaque séjour.')}</p></div><div class="hx-commercial-tools"><button class="hx-btn atlas" data-action="hx-account-new">${tx('+ Nouveau compte')}</button><button class="hx-btn ghost" data-action="clients-directory">${tx('Cardex voyageurs')}</button></div></div>
      <div class="hx-commercial-summary" aria-label="${tx('Comptes actifs')}">${Object.entries(cuKinds).map(([kind, label]) => `<div><span>${label}</span><strong>${st.loaded ? active.filter(a => a.kind === kind).length : '…'}</strong><small>${tx('comptes actifs')}</small></div>`).join('')}<div><span>${tx('Tarifs contractuels')}</span><strong>${st.loaded ? st.contracts.filter(r => !r.archived).length : '…'}</strong><small>${tx('périodes définies')}</small></div></div>
      <div class="hx-commercial-tools"><button class="hx-btn ghost" data-action="hx-contract-new">${tx('+ Tarif contractuel')}</button><button class="hx-btn ghost" data-action="hx-production">${tx('Production mensuelle')}</button><button class="hx-btn ghost" data-action="hx-commercial-refresh" ${st.loading ? 'disabled' : ''}>${tx('Actualiser')}</button></div>
      <form class="hx-commercial-filter" data-hx-commercial-filter><label>${tx('Type')}<select name="kind"><option value="">${tx('Tous les comptes')}</option>${Object.entries(cuKinds).map(([v,l]) => `<option value="${v}" ${st.kind === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label><label>${tx('Recherche')}<input name="search" type="search" value="${esc(st.search)}" placeholder="${tx('Nom, contact, ICE')}"></label><button class="hx-btn ghost" type="submit">${tx('Filtrer')}</button></form>
      <p class="hx-commercial-feedback" role="status">${esc(st.error || (st.loading ? tx('Chargement du répertoire…') : tx('{a} compte(s) · {b} tarif(s) actif(s) dans cette sélection', { a: accounts.length, b: contracts.filter(r => !r.archived).length })))}</p>
      <div class="hx-commercial-grid">${accounts.map(a => `<article class="block hx-commercial-card"><div><span class="hx-kicker">${cuKinds[a.kind]}${a.archived ? ' · ' + tx('ARCHIVÉ') : ''}</span><h3>${esc(a.name)}</h3><p>${esc(a.legalName || a.contact || tx('Identité de facturation à compléter'))}</p><small>${esc([a.city, a.ice ? 'ICE ' + a.ice : '', tx('Échéance {n} j', { n: a.paymentDays })].filter(Boolean).join(' · '))}</small></div><div class="hx-commercial-tools"><button class="hx-btn ghost" data-action="hx-account-edit" data-arg="${esc(a.id)}">${tx('Modifier')} <span class="sr-only">${esc(a.name)}</span></button><button class="hx-btn ghost" data-action="hx-account-stays" data-arg="${esc(a.id)}">${tx('Voir les séjours')} <span class="sr-only">${esc(a.name)}</span></button></div></article>`).join('') || `<p>${tx('Aucun compte dans cette sélection. Créez une agence, une société ou un particulier.')}</p>`}</div>
      <div class="hx-h"><span class="t">${tx('Grille contractuelle')}</span><span class="s">${tx('Bornes inclusives · MAD · aucun tarif implicite hors période')}</span></div>
      <div class="hx-commercial-grid">${contracts.map(r => `<article class="block hx-commercial-card"><div><span class="hx-kicker">${esc(st.accounts.find(a => a.id === r.accountId)?.name || tx('Compte indisponible'))}${r.archived ? ' · ' + tx('ARCHIVÉ') : ''}</span><h3>${esc(r.name)}</h3><p>${esc(cuTypes().find(t => t.id === r.roomTypeId)?.name || r.roomTypeId)} · ${['', 'Single', 'Double', 'Triple'][r.occupancy]} · ${cuBoards[r.board]}</p><small>${ltr(`${esc(r.from)} → ${esc(r.to)}`)}</small><p class="hx-commercial-price">${ltr(cuDraftMoney(r.amountCents))} <small>${tx(r.unit === 'person' ? 'MAD / personne / nuit' : 'MAD / chambre / nuit')} · ${r.taxBasis === 'inclusive' ? tx('TTC') : tx('HT')}</small></p></div><button class="hx-btn ghost" data-action="hx-contract-edit" data-arg="${esc(r.id)}">${tx('Modifier')} <span class="sr-only">${esc(r.name)}</span></button></article>`).join('') || `<p class="hx-commercial-empty">${tx('Aucun tarif dans cette sélection. Ajoutez une période négociée avec ses dates exactes. Septembre à décembre doit être défini explicitement.')}</p>`}</div></div>`;
  }
  const cuProductionByScope = new Map();
  function cuProductionState() {
    const scope = cuStayScope();
    if (!cuProductionByScope.has(scope)) cuProductionByScope.set(scope, {
      month: new (globalThis.KiwiZoneLaw?.DateTimeFormat || Intl.DateTimeFormat)('en-CA', { timeZone: 'Africa/Casablanca', year: 'numeric', month: '2-digit' }).format(new Date()).slice(0, 7),
      report: null, loading: false, error: '', request: 0,
    });
    return cuProductionByScope.get(scope);
  }
  async function cuLoadProduction() {
    const scope = cuStayScope(), st = cuProductionState(), sequence = ++st.request, month = st.month;
    st.loading = true; st.error = ''; st.report = null;
    if (openDrawer?.page === 'production') rerender();
    try {
      const res = await fetch('/api/hotel/production?' + new URLSearchParams({ merchant: cuChannelMerchant(), month }), { cache: 'no-store' });
      const b = await res.json();
      if (!res.ok || b.month !== month || !Array.isArray(b.groups) || !Array.isArray(b.totals)) throw new Error(b.error || 'unavailable');
      if (st.request === sequence) st.report = b;
    } catch (e) {
      if (st.request === sequence) st.error = e.message === 'production-limit' ? txk('Ce mois dépasse la limite de lecture. Aucun total partiel n’est affiché.') : txk('Production indisponible. Le registre complet est nécessaire ; aucun total n’est estimé depuis le cache.');
    } finally {
      if (st.request === sequence) st.loading = false;
      if (scope === cuStayScope() && st.request === sequence && openDrawer?.page === 'production') rerender();
    }
  }
  function cuProductionBody() {
    const st = cuProductionState(), r = st.report;
    return `<div class="hx-page hx-commercial hx-production"><div class="hx-commercial-head"><div><span class="hx-kicker">${tx('PRODUCTION MENSUELLE')}</span><h3>${tx('Qui remplit<br>vos chambres.')}</h3><p>${tx('Chambres-nuits réservées par compte ou canal. Séjours confirmés, en maison et terminés ; annulations, no-shows et demandes exclus.')}</p></div><button class="hx-btn ghost" data-action="hx-commercial">${tx('Retour aux comptes')}</button></div>
      <form data-hx-production-filter class="hx-commercial-filter"><label>${tx('Mois du séjour')}<input type="month" dir="ltr" name="month" value="${esc(st.month)}" required min="0001-01" max="9998-12"></label><button type="submit" class="hx-btn atlas">${tx('Afficher le mois')}</button></form>
      <p class="hx-commercial-feedback" role="status">${esc(tx(st.error) || (st.loading ? tx('Lecture du registre des réservations…') : tx('Une chambre-nuit correspond à une chambre réservée pour une nuit. Ce ne sont ni des encaissements ni un relevé de présence.')))}</p>
      ${r ? `<div class="hx-commercial-summary"><div><span>${tx('Chambres-nuits')}</span><strong>${r.nights}</strong><small>${tx('sur le mois sélectionné')}</small></div><div><span>${tx('Réservations')}</span><strong>${r.reservations}</strong><small>${tx('croisant la période')}</small></div><div><span>${tx('Comptes & canaux')}</span><strong>${r.groups.length}</strong><small>${tx('avec une production')}</small></div><div><span>${tx('Sans chambre attribuée')}</span><strong>${r.unassigned}</strong><small>${tx('réservations incluses')}</small></div></div>
      <div class="hx-production-scroll" tabindex="0" role="region" aria-label="${tx('Tableau mensuel défilant horizontalement')}"><table class="hx-production-table"><caption>${tx('Chambres-nuits')} · ${ltr(esc(r.month))} · ${tx('faites défiler pour consulter tous les jours')}</caption><thead><tr><th scope="col">${tx('Compte / canal')}</th><th scope="col">${tx('Total')}</th>${r.totals.map((_, i) => `<th scope="col"><abbr title="${esc(r.month + '-' + String(i + 1).padStart(2, '0'))}">${i + 1}</abbr></th>`).join('')}</tr></thead><tbody>${r.groups.map(g => `<tr><th scope="row"><b>${esc(g.name)}</b><small>${esc(cuKinds[g.kind] || tx('Canal de réservation'))}</small></th><td><strong>${g.nights}</strong></td>${g.days.map(n => `<td${n ? ' class="has-nights"' : ''}>${n || '·'}</td>`).join('')}</tr>`).join('')}</tbody><tfoot><tr><th scope="row">${tx('Total chambres-nuits')}</th><td>${r.nights}</td>${r.totals.map(n => `<td>${n}</td>`).join('')}</tr></tfoot></table></div>${!r.groups.length ? `<p class="hx-commercial-empty">${tx('Aucune réservation confirmée sur ce mois.')}</p>` : ''}
      <p class="hx-daily-note">${tx('La nuit du départ est exclue. Les séjours sans compte commercial sont regroupés par canal. Une réservation sans chambre attribuée reste comptée ; ce tableau ne mesure pas les chambres encore disponibles.')}</p>` : ''}</div>`;
  }
  async function cuAccountStays(id) {
    const scope = cuStayScope(), account = cuCommercialState().accounts.find(a => a.id === id);
    if (!account) return;
    const m = K().modal({ tag: cuKinds[account.kind], title: tx('Séjours · {name}', { name: account.name }), width: 800, desc: tx('Dossiers rattachés à ce compte. Les montants réservés ne sont ni des encaissements ni un solde débiteur.'), body: `<div data-hx-account-stays role="status">${tx('Chargement des dossiers…')}</div>` });
    const host = m.el.querySelector('[data-hx-account-stays]');
    try {
      const res = await fetch('/api/hotel/stays?' + new URLSearchParams({ merchant: cuChannelMerchant(), accountId: id, includeCancelled: '1' }), { cache: 'no-store' });
      const b = await res.json();
      if (scope !== cuStayScope()) { m.close(); return; }
      if (!res.ok || !Array.isArray(b.stays)) throw new Error('unavailable');
      host.innerHTML = `<p>${tx('{n} dossier(s)', { n: b.stays.length, c: txn(b.stays.length, 'dossier') })}${b.capped ? ' · ' + tx('limite de lecture atteinte, liste incomplète') : ''}${b.coverage === 'document' ? ' · ' + tx('document actif seulement, historique non vérifié') : ''}</p><div class="hx-commercial-grid">${b.stays.map(s => `<article class="block hx-commercial-card"><div><span class="hx-kicker">${ltr(esc(s.code))} · ${esc(({ confirmed: tx('Confirmé'), requested: tx('Demandé'), checked_in: tx('En maison'), completed: tx('Terminé'), cancelled: tx('Annulé'), no_show: tx('No-show') })[s.status] || s.status)}</span><h3>${esc(s.customer?.name || '')}</h3><p>${esc(cuDay(s.hotel?.checkIn))}${hxTo()}${esc(cuDay(s.hotel?.checkOut))} · ${esc(cuBoards[s.commercial?.board] || tx('Logement seul'))}</p><p>${tx('{amount} MAD réservés', { amount: ltr(Number(s.hotel?.total || 0).toFixed(2)) })}</p><small>${esc(s.commercial?.voucher || tx('Sans voucher / bon de commande'))}</small></div></article>`).join('') || `<p>${tx('Aucun séjour rattaché. Sélectionnez ce compte dans le dossier de réservation.')}</p>`}</div>`;
    } catch (_) { host.textContent = tx('Historique indisponible. Aucun dossier n’a été modifié.'); }
  }
  async function cuCommercialEditor(kind, id) {
    const scope = cuStayScope();
    await cuLoadCommercial();
    if (scope !== cuStayScope()) return;
    const st = cuCommercialState();
    if (!st.loaded || st.error) { toast(st.error || tx('Répertoire indisponible'), { type: 'warn' }); return; }
    const key = kind === 'account' ? 'accounts' : 'contracts';
    const old = st[key].find(x => x.id === id);
    if (id && !old) return;
    const item = old || { id: 'hc-' + crypto.randomUUID(), kind: 'agency', paymentDays: 0, occupancy: 1, board: 'room_only', unit: 'room', taxBasis: 'inclusive' };
    const field = (name, label, type = 'text', attrs = '') => `<label><span>${label}</span><input name="${name}" type="${type}"${['email', 'tel', 'date', 'number'].includes(type) || ['ice', 'taxId', 'rc'].includes(name) ? ' dir="ltr"' : ''} value="${esc(item[name] ?? '')}" ${attrs}></label>`;
    const select = (name, label, options) => `<label><span>${label}</span><select name="${name}">${Object.entries(options).map(([v,l]) => `<option value="${esc(v)}" ${String(item[name]) === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
    const accountFields = () => select('kind', tx('Type de compte'), cuKinds) + field('name', tx('Nom usuel'), 'text', 'required maxlength="160"') + field('legalName', tx('Raison sociale / nom facturé'), 'text', 'maxlength="160"') + field('contact', tx('Contact'), 'text', 'maxlength="160"') + field('address', tx('Adresse de facturation'), 'text', 'maxlength="500"') + field('city', tx('Ville'), 'text', 'maxlength="100"') + field('country', tx('Pays'), 'text', 'maxlength="100"') + field('ice', tx('ICE'), 'text', 'maxlength="40"') + field('taxId', tx('Identifiant fiscal'), 'text', 'maxlength="40"') + field('rc', tx('Registre de commerce'), 'text', 'maxlength="40"') + field('email', tx('E-mail'), 'email', 'maxlength="160"') + field('phone', tx('Téléphone'), 'tel', 'maxlength="40"') + field('paymentDays', tx('Délai de paiement (jours)'), 'number', 'required min="0" max="365" step="1"') + field('notes', tx('Notes internes'), 'text', 'maxlength="600"');
    const contractFields = () => select('accountId', tx('Compte contractant'), Object.fromEntries(st.accounts.filter(a => !a.archived || a.id === item.accountId).map(a => [a.id, a.name]))) + field('name', tx('Libellé du tarif'), 'text', 'required maxlength="160"') + select('roomTypeId', tx('Catégorie'), Object.fromEntries(cuTypes().map(t => [t.id,t.name]))) + select('occupancy', tx('Occupation totale'), { 1: tx('Single · 1 personne'), 2: tx('Double · 2 personnes'), 3: tx('Triple · 3 personnes') }) + select('board', tx('Formule incluse'), cuBoards) + select('unit', tx('Prix par'), { room: tx('Chambre / nuit'), person: tx('Personne / nuit') }) + field('from', tx('À partir du (inclus)'), 'date', 'required') + field('to', tx('Jusqu’au (inclus)'), 'date', 'required') + `<label><span>${tx('Montant MAD')}</span><input name="amount" dir="ltr" type="number" required min="0" max="1000000" step="0.01" value="${item.amountCents == null ? '' : (item.amountCents / 100).toFixed(2)}"></label>` + select('taxBasis', tx('Base du prix'), { inclusive: tx('TTC'), exclusive: tx('HT · simulation seulement') });
    const m = K().modal({ tag: kind === 'account' ? tx('COMPTE HÔTEL') : tx('TARIF CONTRACTUEL'), title: old ? tx('Modifier la fiche') : tx('Créer une fiche'), width: 720,
      desc: kind === 'account' ? tx('Les modifications ne remplacent pas l’identité de facturation déjà acceptée dans un séjour.') : tx('Prix de la formule par nuit. Aucune taxe locale ou réduction enfant n’est ajoutée automatiquement. Faites valider le traitement fiscal avant facturation.'),
      body: `<form data-hx-commercial-editor><div class="hx-room-form hx-type-form">${kind === 'account' ? accountFields() : contractFields()}<label><span>${tx('État')}</span><select name="archived"><option value="false">${tx('Actif')}</option><option value="true" ${item.archived ? 'selected' : ''}>${tx('Archivé')}</option></select></label></div><p role="status" data-hx-commercial-error></p><div class="hx-room-form-actions"><button class="hx-btn atlas" type="submit">${tx('Enregistrer')}</button></div></form>` });
    const form = m.el.querySelector('form'), revision = st.rev, merchant = cuChannelMerchant();
    form.addEventListener('submit', async e => {
      e.preventDefault(); if (form.__busy) return;
      const error = form.querySelector('[data-hx-commercial-error]');
      if (scope !== cuStayScope()) { error.textContent = tx('L’hôtel actif a changé. Rouvrez cette fiche.'); return; }
      const fd = Object.fromEntries(new FormData(form)), row = { ...fd, id: item.id, archived: fd.archived === 'true' };
      if (kind === 'account') row.paymentDays = Number(fd.paymentDays);
      else { row.occupancy = Number(fd.occupancy); row.amountCents = Math.round(Number(fd.amount) * 100); }
      form.__busy = true; const button = form.querySelector('[type="submit"]'); button.disabled = true;
      try {
        const res = await fetch('/api/hotel/commercial', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ merchant, action: kind, rev: revision, item: row }) });
        const b = await res.json(); if (!res.ok) { error.textContent = cuCommercialError(b.error); return; }
        Object.assign(st, { accounts: b.accounts, contracts: b.contracts, rev: b.rev });
        m.close(); if (scope === cuStayScope()) { rerender(); toast(tx('Fiche enregistrée'), { type: 'success' }); }
      } catch (_) { error.textContent = tx('Confirmation non reçue. Actualisez le répertoire avant de réessayer, votre référence de fiche est conservée.'); }
      finally { form.__busy = false; button.disabled = false; }
    });
  }
  function cuHotesBody() {
    return `<div class="hx-page">
      <div class="block" style="padding:8px 14px;">
        ${cuStarter(
          tx('Vos fiches clients se créent toutes seules.'),
          tx('Dès le premier séjour, chaque client a sa fiche : préférences, allergies, dépenses par poste, valeur vie, et la reconnaissance des fidèles au check-in.'),
          [tx('« Client fidèle ×2 » signalé à l\'arrivée'), tx('Mix nationalités pour viser vos marchés'), tx('Relance directe −10 % pour court-circuiter les OTA')]
        )}
      </div>
    </div>`;
  }
  const cuChannelState = { loading: false, loaded: false, rows: [], error: '' };
  function cuChannelMerchant() { return window.__kiwiHotelInternal.part('channels').cuChannelMerchant.apply(this, arguments); }
  function cuLoadChannels(sync) { return window.__kiwiHotelInternal.part('channels').cuLoadChannels.apply(this, arguments); }
  function cuChannelRoomLabel(id) { return window.__kiwiHotelInternal.part('channels').cuChannelRoomLabel.apply(this, arguments); }
  function cuChannelEditor(provider) {
    const name = ({ airbnb: 'Airbnb', expedia: 'Expedia', agoda: 'Agoda' })[provider] || 'Booking.com';
    const rooms = Object.values(cuState().rooms || {}).sort((a,b) => a.n-b.n);
    if (!rooms.length) { toast(tx('Ajoutez d’abord vos chambres'), {type:'warn'}); return; }
    const m = K().modal({ tag: tx('CALENDRIER OTA'), title: tx('Connecter {name}', { name }),
      desc: tx('Collez le lien iCal exporté par {name} et liez-le à une chambre physique. Le lien reste chiffré et ne sera plus affiché.', { name }), width:600,
      body:`<div class="hx-room-form">
        <label><span>${tx('Nom de la connexion')}</span><input data-hx-channel-label maxlength="80" value="${esc(name)} · ${esc(vName())}"></label>
        <label><span>${tx('Chambre Kiwi')}</span><select data-hx-channel-room>${rooms.map((r)=>`<option value="${esc(r.id)}">${tx('Chambre {n}', { n: r.n })} · ${esc(r.typeName || '')}</option>`).join('')}</select></label>
        <label class="hx-room-form-wide"><span>${tx('Lien calendrier iCal (.ics)')}</span><input data-hx-channel-url dir="ltr" type="url" inputmode="url" autocomplete="off" spellcheck="false" placeholder="https://…/calendar.ics"></label>
        <p class="hx-room-form-wide" data-hx-channel-status>${tx('Une connexion par chambre. Ajoutez les autres chambres ensuite.')}</p>
      </div><div class="hx-room-form-actions"><button class="hx-btn ghost" data-action="hx-channel-close">${tx('Annuler')}</button><button class="hx-btn atlas" data-action="hx-channel-save" data-arg="${provider}">${tx('Connecter et vérifier')}</button></div>` });
    m.el.querySelector('.kiwi-modal')?.classList.add('hx-hotel-modal'); openModal={el:m.el,close:m.close};
  }
  /* Ticket #0009 · where each extranet hides its iCal export. Generic on
   * purpose: extranet menus move, but every platform below ships an iCal
   * export per listing — except B2B allotment (JumboTours), which stays
   * manual entry via + Réservation. */
  function cuChannelGuide() {
    const rows = [
      ['Booking.com', tx('Extranet → Calendrier & tarifs → synchronisation des calendriers → copiez le lien d’exportation iCal de l’annonce.')],
      ['Expedia', tx('Expedia Partner Central → calendrier de l’établissement → exportation ou partage iCal (certaines propriétés le reçoivent via euro.expedia.net).')],
      ['Agoda', tx('YCS (Yield Control System) → calendrier de l’établissement → export iCal.')],
      ['Airbnb', tx('Annonces → Calendrier → paramètres de disponibilité → exporter / synchroniser le calendrier (lien iCal).')],
      [tx('JumboTours & centrales B2B'), tx('Pas d’export iCal : allotement géré au contrat. Saisissez chaque dossier à la main via + Réservation (canal Agence).')],
    ];
    const m = K().modal({ tag: tx('CANAUX OTA'), title: tx('Où trouver le lien iCal ?'),
      desc: tx('Un lien par chambre. Seules les dates bloquées sont importées : ni prix, ni clients, ni commissions.'), width: 620,
      body: `<div class="hx-list">${rows.map(([name, how]) => `<div class="hx-arr"><span class="tm">ICAL</span><div class="who"><b>${esc(name)}</b><div class="sub">${esc(how)}</div></div></div>`).join('')}</div>
      <div class="hx-room-form-actions"><button class="hx-btn atlas" data-action="hx-channel-close">${tx('Compris')}</button></div>` });
    m.el.querySelector('.kiwi-modal')?.classList.add('hx-hotel-modal');
    openModal = { el: m.el, close: m.close };
  }
  /* Le lien de réservation publique est-il ouvert ? La tuile disait « source de
   * réservations non connectée » quoi qu'il arrive, y compris avec le lien ouvert
   * et des clients qui réservent. */
  function cuDirectOpen() { return window.__kiwiHotelInternal.part('channels').cuDirectOpen.apply(this, arguments); }
  function cuCanauxBody() { return window.__kiwiHotelInternal.part('channels').cuCanauxBody.apply(this, arguments); }
  const cuEconomatState = {
    loading: false, loaded: false, saving: false, error: '', rev: 0,
    registry: { units: [], terminalUnits: {} }, draft: null,
    report: null, reportError: '', shifts: [], shiftReport: null, selectedShift: '',
  };
  function cuMerchantSlug() {
    try {
      return String(window.KiwiStore?.slugFor?.(cuVenueId())
        || window.KiwiVenue?.getCurrentVenueData?.()?.slug
        || window.KiwiMe?.merchant
        || '').trim();
    } catch (_) { return ''; }
  }
  function cuEconomatDraft(value) {
    const raw = value && typeof value === 'object' ? value : {};
    let units = Array.isArray(raw.units) ? raw.units.map((unit) => ({ ...unit })) : [];
    if (!units.length) units = [{
      id: 'economat-central', name: tx('Économat central'), kind: 'economat',
      storeType: 'economat', locationId: 'loc-economat-central', active: true,
    }];
    return {
      units,
      terminals: Object.entries(raw.terminalUnits || {}).map(([terminalId, unitId]) => ({ terminalId, unitId })),
    };
  }
  function cuNewUnit(kind) {
    const tail = Date.now().toString(36).slice(-7);
    const id = `${kind}-${tail}`;
    return {
      id, name: kind === 'department' ? tx('Nouveau département') : tx('Nouveau point de vente'),
      kind, storeType: kind === 'department' ? '' : 'restaurant',
      locationId: `loc-${id}`, active: true,
    };
  }
  function cuQty(milli) {
    return (window.KiwiNumber?.format((Number(milli) || 0) / 1000, {maximumFractionDigits:3}) ?? new Intl.NumberFormat(document.documentElement?.lang === 'en' ? 'en-GB' : 'fr-FR', {maximumFractionDigits:3}).format((Number(milli) || 0) / 1000));
  }
  function cuMoney(cents) { const v = (window.KiwiNumber?.format((Number(cents) || 0) / 100) ?? new Intl.NumberFormat(document.documentElement?.lang === 'en' ? 'en-GB' : 'fr-FR').format((Number(cents) || 0) / 100)) + ' MAD'; return hxLang() === 'ar' ? '⁦' + v + '⁩' : v; }
  function cuCaptureEconomatDraft() {
    if (!openDrawer || !['hotelintel', 'points-vente'].includes(openDrawer.page) || !cuEconomatState.draft) return;
    const host = openDrawer.el.querySelector('[data-hx-economat]');
    if (!host) return;
    cuEconomatState.draft.units.forEach((unit) => {
      const row = host.querySelector(`[data-hx-econ-unit="${CSS.escape(unit.id)}"]`);
      if (!row) return;
      unit.name = String(row.querySelector('[data-hx-econ-name]')?.value || unit.name).trim();
      unit.storeType = String(row.querySelector('[data-hx-econ-store]')?.value ?? unit.storeType);
      unit.active = unit.kind === 'economat' ? true : !!row.querySelector('[data-hx-econ-active]')?.checked;
    });
    cuEconomatState.draft.terminals = [...host.querySelectorAll('[data-hx-econ-terminal-row]')].map((row) => ({
      terminalId: String(row.querySelector('[data-hx-econ-terminal]')?.value || '').trim(),
      unitId: String(row.querySelector('[data-hx-econ-terminal-unit]')?.value || '').trim(),
    }));
  }
  function cuEconomatBody() {
    const s = cuEconomatState;
    if (!s.loaded && s.loading) return `<div class="hx-econ-loading"><i></i>${tx('Lecture de la configuration et des migrations…')}</div>`;
    const d = s.draft || cuEconomatDraft(s.registry);
    const registryReady = s.registry.units.length > 0 && cuOutletsMapped(d);
    const inventory = s.report ? `<div class="hx-econ-kpis">
      <div><span>${tx('Stock hôtel consolidé')}</span><b>${cuQty(s.report.consolidated?.closingMilli)}</b><small>${tx('{n} références', { n: s.report.consolidated?.items?.length || 0 })}</small></div>
      <div><span>${tx('Unités suivies')}</span><b>${s.report.units?.length || 0}</b><small>${s.report.units?.every((u) => u.reconciliation?.balanced) ? tx('réconciliées') : tx('écart à examiner')}</small></div>
      <div><span>${tx('Comptages physiques')}</span><b>${s.report.physicalCounts?.observed || 0}</b><small>${tx('{n} appliqués', { n: s.report.physicalCounts?.applied || 0 })}</small></div>
    </div><div class="hx-econ-unit-report">${(s.report.units || []).map((unit) => `<div><span><b dir="ltr">${esc(unit.locationId)}</b><small>${tx('{n} références', { n: unit.items?.length || 0 })}</small></span><strong>${cuQty(unit.reconciliation?.closingMilli)}</strong><i class="${unit.reconciliation?.balanced ? 'ok' : 'bad'}">${unit.reconciliation?.balanced ? tx('équilibré') : tx('à vérifier')}</i></div>`).join('')}</div>`
      : `<div class="hx-econ-empty">${esc(tx(s.reportError) || (s.registry.units.length ? tx('Le rapport sera disponible après les migrations de production.') : tx('Configurez les unités pour ouvrir le rapport consolidé.')))}</div>`;
    const shiftRows = s.shifts.length ? s.shifts.map((shift) => `<button data-action="hx-econ-shift" data-arg="${esc(shift.shiftId)}" class="${s.selectedShift === shift.shiftId ? 'on' : ''}"><span><b>${new Date(shift.lastTs).toLocaleString(hxLocale())}</b><small>${tx('{a} charges · {b} annulations', { a: shift.chargeCount, b: shift.reversalCount })}</small></span><strong>${cuMoney(shift.netCents)}</strong></button>`).join('') : `<div class="hx-econ-empty">${tx('Aucune charge chambre enregistrée sur les 30 derniers jours.')}</div>`;
    const cashiers = s.shiftReport ? `<div class="hx-econ-cashiers">${(s.shiftReport.cashiers || []).map((row) => `<div><span><b>${esc(row.cashierName || row.cashierId)}</b><small>${tx('{a} charges · {b} annulations', { a: row.chargeCount, b: row.reversalCount })}</small></span><strong>${cuMoney(row.netCents)}</strong></div>`).join('')}</div>` : '';
    return `<div class="hx-econ-shell" data-hx-economat>
      <div class="hx-econ-head"><div><span>${tx('ÉCONOMAT · PILOTE')}</span><h3>${tx('La vérité opérationnelle de l’hôtel')}</h3><p>${tx('Configuration des unités, stock consolidé et charges chambre, sans données client.')}</p></div><button class="hx-btn ghost" data-action="hx-econ-refresh">${tx('Actualiser')}</button></div>
      ${s.error ? `<div class="hx-econ-alert bad">${esc(tx(s.error))}</div>` : ''}
      <div class="hx-econ-readiness"><div class="${registryReady ? 'ok' : 'wait'}"><b>${registryReady ? tx('Registre prêt') : tx('Registre incomplet')}</b><span>${s.registry.units.length ? tx('{a} unités · {b} caisses', { a: s.registry.units.length, b: Object.keys(s.registry.terminalUnits || {}).length }) : tx('aucune écriture en production')}</span></div><div class="${s.report ? 'ok' : 'wait'}"><b>${s.report ? tx('Rapports disponibles') : tx('Migration à confirmer')}</b><span>${s.report ? tx('stock et comptages lisibles') : esc(tx(s.reportError) || tx('aucune donnée fabriquée'))}</span></div><div class="wait"><b>Discovery D</b><span>${tx('visite terrain requise · jamais validée par logiciel')}</span></div></div>
      <div class="hx-econ-section"><div class="hx-h"><span class="t">${tx('Stock consolidé')}</span><span class="s">${tx('équation par unité et vue hôtel')}</span></div>${inventory}</div>
      <div class="hx-econ-section"><div class="hx-h"><span class="t">${tx('Charges chambre par poste')}</span><span class="s">${tx('aucun nom de client ni numéro de chambre')}</span></div><div class="hx-econ-shifts">${shiftRows}</div>${cashiers}</div>
      ${cuUnitsEditorHtml(d)}
    </div>`;
  }
  /* Every active outlet mapped to at least one till: the single readiness
   * rule for the shared registry, read by both host pages. */
  function cuOutletsMapped(d) {
    const outlets = d.units.filter((unit) => unit.kind === 'outlet' && unit.active);
    const mapped = new Set(d.terminals.filter((row) => row.terminalId && row.unitId).map((row) => row.unitId));
    return outlets.length > 0 && outlets.every((unit) => mapped.has(unit.id));
  }
  /* Units + tills editor, shared by Intelligence hôtel and Points de vente:
   * one draft, one registry, one save. Editing here never duplicates an
   * establishment: names, kinds and till assignments all land in the same
   * hotel-units document, and locationId stays immutable server-side, so
   * stock history and room-charge scoping keep pointing at the same units. */
  function cuUnitsEditorHtml(d) {
    const outlets = d.units.filter((unit) => unit.kind === 'outlet' && unit.active);
    const allOutletsMapped = cuOutletsMapped(d);
    const unitRows = d.units.map((unit) => `<div class="hx-econ-unit" data-hx-econ-unit="${esc(unit.id)}">
      <span class="kind">${unit.kind === 'economat' ? tx('ÉCONOMAT') : unit.kind === 'department' ? tx('DÉPARTEMENT') : tx('POINT DE VENTE')}</span>
      <input data-hx-econ-name value="${esc(unit.name)}" maxlength="120" aria-label="${tx('Nom de l’unité')}">
      ${unit.kind === 'department' ? `<input data-hx-econ-store value="" type="hidden"><span class="type">${tx('service interne')}</span>` : unit.kind === 'economat' ? `<input data-hx-econ-store value="economat" type="hidden"><span class="type">${tx('stock central')}</span>` : `<select data-hx-econ-store><option value="restaurant" ${unit.storeType === 'restaurant' ? 'selected' : ''}>${HX_PDV_KINDS.restaurant}</option><option value="bar" ${unit.storeType === 'bar' ? 'selected' : ''}>${HX_PDV_KINDS.bar}</option><option value="cafe" ${unit.storeType === 'cafe' ? 'selected' : ''}>${HX_PDV_KINDS.cafe}</option><option value="spa" ${unit.storeType === 'spa' ? 'selected' : ''}>${HX_PDV_KINDS.spa}</option></select>`}
      <label><input data-hx-econ-active type="checkbox" ${unit.active ? 'checked' : ''} ${unit.kind === 'economat' ? 'disabled' : ''}> ${tx('active')}</label>
      <code>${esc(unit.locationId)}</code>
    </div>`).join('');
    const terminalRows = d.terminals.map((row, index) => `<div class="hx-econ-terminal" data-hx-econ-terminal-row>
      <input data-hx-econ-terminal dir="ltr" value="${esc(row.terminalId)}" maxlength="80" placeholder="term_…">
      <select data-hx-econ-terminal-unit><option value="">${tx('Choisir le point de vente')}</option>${outlets.map((unit) => `<option value="${esc(unit.id)}" ${row.unitId === unit.id ? 'selected' : ''}>${esc(unit.name)}</option>`).join('')}</select>
      <button data-action="hx-econ-remove-terminal" data-arg="${index}" aria-label="${tx('Retirer')}">×</button>
    </div>`).join('');
    return `<div class="hx-econ-section"><div class="hx-h"><span class="t">${tx('Unités et caisses')}</span><span class="s">${tx('un seul enregistrement atomique')}</span></div><div class="hx-econ-units">${unitRows}</div><div class="hx-econ-add"><button class="hx-btn ghost" data-action="hx-econ-add-unit" data-arg="outlet">${tx('+ Point de vente')}</button><button class="hx-btn ghost" data-action="hx-econ-add-unit" data-arg="department">${tx('+ Département')}</button></div>
        <div class="hx-econ-terminal-head"><b>${tx('Assignation des caisses')}</b><span>${tx('Copiez l’identifiant depuis chaque caisse physique.')}</span><button class="hx-btn ghost" data-action="hx-econ-add-terminal">${tx('+ Caisse')}</button></div><div>${terminalRows || `<div class="hx-econ-empty">${tx('Aucune caisse assignée. Le premier registre ne peut pas être activé ainsi.')}</div>`}</div>
        <label class="hx-econ-confirm"><input type="checkbox" data-hx-econ-confirm> ${tx('J’ai relevé toutes les caisses physiques et vérifié leur point de vente.')}</label>
        <div class="hx-econ-save"><span>${allOutletsMapped ? tx('Chaque point de vente actif a au moins une caisse.') : tx('Chaque point de vente actif doit avoir une caisse.')}</span><button class="hx-btn atlas" data-action="hx-econ-save" ${cuEconomatState.saving ? 'disabled' : ''}>${cuEconomatState.saving ? tx('Enregistrement…') : tx('Enregistrer unités + caisses')}</button></div>
      </div>`;
  }
  /* Points de vente: the outlet-facing host for the same shared draft.
   * Rename a restaurant here and the Économat page shows it, because both
   * read cuEconomatState — never a second establishment list. */
  const HX_PDV_KINDS = { get restaurant() { return tx('Restaurant'); }, get bar() { return tx('Bar'); }, get cafe() { return tx('Café'); }, get spa() { return tx('Spa'); } };
  function cuPdvBody() {
    const s = cuEconomatState;
    if (!s.loaded && s.loading) return `<div class="hx-econ-loading"><i></i>${tx('Lecture de la configuration…')}</div>`;
    const d = s.draft || cuEconomatDraft(s.registry);
    const outlets = d.units.filter((unit) => unit.kind === 'outlet');
    const cards = outlets.length ? outlets.map((unit) => {
      const terms = d.terminals.filter((row) => row.unitId === unit.id && row.terminalId).map((row) => row.terminalId);
      return `<article class="hx-pdv-card" data-hx-pdv-card="${esc(unit.id)}">
        <div><span class="kind">${tx('POINT DE VENTE')}${unit.active ? '' : ' · ' + tx('INACTIF')}</span><b>${esc(unit.name)}</b><small>${esc(HX_PDV_KINDS[unit.storeType] || tx('Genre à choisir'))} · <code>${esc(unit.locationId)}</code></small></div>
        <div><span>${terms.length ? terms.map((t) => `<code>${esc(t)}</code>`).join(' ') : tx('aucune caisse assignée')}</span></div>
        <div><button class="hx-btn ghost" data-action="hx-outlet-menu" data-arg="${esc(unit.id)}">${tx('Menu & prix')}</button></div>
      </article>`;
    }).join('') : `<div class="hx-econ-empty">${tx('Aucun point de vente. Ajoutez-en un ci-dessous : il partagera le registre de l’économat, sans doublon.')}</div>`;
    return `<div class="hx-econ-shell" data-hx-economat>
      <div class="hx-econ-head"><div><span>${tx('POINTS DE VENTE')}</span><h3>${tx('Restaurants, bars et caisses')}</h3><p>${tx('Nommez chaque point de vente, assignez ses caisses physiques, consultez ce qu’elles vendent. Un seul registre partagé avec l’économat : renommer ici, c’est renommer partout.')}</p></div><div style="display:flex;gap:8px;flex-wrap:wrap;"><button class="hx-btn ghost" data-action="nav-economat">${tx('Économat · stock central')}</button><button class="hx-btn ghost" data-action="hx-econ-refresh">${tx('Actualiser')}</button></div></div>
      ${s.error ? `<div class="hx-econ-alert bad">${esc(tx(s.error))}</div>` : ''}
      <div class="hx-econ-section"><div class="hx-h"><span class="t">${tx('Vos points de vente')}</span><span class="s">${tx('{a} actifs · {b} caisses assignées', { a: outlets.filter((unit) => unit.active).length, b: d.terminals.filter((row) => row.terminalId && row.unitId).length })}</span></div><div class="hx-pdv-cards">${cards}</div></div>
      ${cuUnitsEditorHtml(d)}
    </div>`;
  }
  async function cuLoadEconomat(force) {
    if (!isCustomHotel() || cuEconomatState.loading) return;
    const merchant = cuMerchantSlug();
    if (!merchant) { cuEconomatState.error = txk('Établissement hôtel introuvable.'); cuEconomatState.loaded = true; rerender(); return; }
    cuEconomatState.loading = true;
    if (!cuEconomatState.loaded) rerender();
    const qs = encodeURIComponent(merchant);
    try {
      const docResponse = await fetch(`/api/store?feature=hotel-units&merchant=${qs}`, { credentials: 'same-origin' });
      const doc = await docResponse.json();
      if (!docResponse.ok) throw new Error(doc.error || txk('unités indisponibles'));
      cuEconomatState.rev = Number(doc.rev) || 0;
      cuEconomatState.registry = doc.data && Array.isArray(doc.data.units) ? doc.data : { units: [], terminalUnits: {} };
      if (force || !cuEconomatState.draft) cuEconomatState.draft = cuEconomatDraft(cuEconomatState.registry);
      cuEconomatState.report = null; cuEconomatState.reportError = ''; cuEconomatState.shifts = [];
      if (cuEconomatState.registry.units.length) {
        const since = Date.now() - 30 * 86400000;
        const [inventoryResponse, shiftsResponse] = await Promise.all([
          fetch(`/api/inventory/hotel-reports?merchant=${qs}`, { credentials: 'same-origin' }),
          fetch(`/api/hotel/room-charges?merchant=${qs}&mode=shifts&since=${since}`, { credentials: 'same-origin' }),
        ]);
        const inventoryBody = await inventoryResponse.json();
        const shiftsBody = await shiftsResponse.json();
        if (inventoryResponse.ok) cuEconomatState.report = inventoryBody.report;
        else cuEconomatState.reportError = inventoryBody.dependency ? tx('Migration manquante : {name}', { name: inventoryBody.dependency }) : String(inventoryBody.error || txk('rapport indisponible'));
        if (shiftsResponse.ok) cuEconomatState.shifts = Array.isArray(shiftsBody.shifts) ? shiftsBody.shifts : [];
        else if (!cuEconomatState.reportError) cuEconomatState.reportError = String(shiftsBody.error || txk('charges chambre indisponibles'));
      }
      cuEconomatState.error = '';
    } catch (error) { cuEconomatState.error = String(error && error.message || error); }
    cuEconomatState.loading = false; cuEconomatState.loaded = true;
    rerender();
  }
  async function cuLoadRoomShift(shiftId) {
    const merchant = cuMerchantSlug();
    if (!merchant || !shiftId) return;
    cuEconomatState.selectedShift = shiftId; cuEconomatState.shiftReport = null; rerender();
    try {
      const response = await fetch(`/api/hotel/room-charges?merchant=${encodeURIComponent(merchant)}&shiftId=${encodeURIComponent(shiftId)}`, { credentials: 'same-origin' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'rapport indisponible');
      cuEconomatState.shiftReport = body.report;
    } catch (error) { cuEconomatState.error = String(error && error.message || error); }
    rerender();
  }
  async function cuSaveEconomat(el) {
    if (cuEconomatState.saving) return;
    cuCaptureEconomatDraft();
    const host = el.closest('[data-hx-economat]');
    const d = cuEconomatState.draft;
    if (!host?.querySelector('[data-hx-econ-confirm]')?.checked) {
      toast(tx('Confirmez le relevé de toutes les caisses'), { type: 'warn', desc: tx('Une caisse oubliée continuerait à vendre sans synchroniser son stock.') }); return;
    }
    const outlets = d.units.filter((unit) => unit.kind === 'outlet' && unit.active);
    if (!outlets.length) { toast(tx('Ajoutez au moins un point de vente actif'), { type: 'warn' }); return; }
    if (d.units.some((unit) => !unit.name)) { toast(tx('Chaque unité doit avoir un nom'), { type: 'warn' }); return; }
    const terminalUnits = {};
    for (const row of d.terminals) {
      if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/.test(row.terminalId) || !outlets.some((unit) => unit.id === row.unitId) || terminalUnits[row.terminalId]) {
        toast(tx('Corrigez les identifiants de caisse'), { type: 'warn', desc: tx('Chaque identifiant doit être unique et relié à un point de vente actif.') }); return;
      }
      terminalUnits[row.terminalId] = row.unitId;
    }
    if (outlets.some((unit) => !Object.values(terminalUnits).includes(unit.id))) {
      toast(tx('Une caisse manque pour un point de vente actif'), { type: 'warn' }); return;
    }
    const merchant = cuMerchantSlug();
    const data = { units: d.units.map((unit) => ({ id: unit.id, name: unit.name, kind: unit.kind, storeType: unit.storeType, locationId: unit.locationId, active: !!unit.active })), terminalUnits };
    cuEconomatState.saving = true; rerender();
    try {
      const response = await fetch('/api/store', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ feature: 'hotel-units', merchant, baseRev: cuEconomatState.rev, data }) });
      const body = await response.json();
      if (!response.ok) {
        if (response.status === 409 && body.data) { cuEconomatState.rev = body.rev; cuEconomatState.registry = body.data; cuEconomatState.draft = cuEconomatDraft(body.data); }
        throw new Error(body.detail || body.error || tx('enregistrement refusé'));
      }
      cuEconomatState.rev = body.rev; cuEconomatState.registry = data; cuEconomatState.draft = cuEconomatDraft(data);
      toast(tx('Unités et caisses enregistrées ensemble'), { type: 'success', desc: tx('{a} unités · {b} caisses.', { a: data.units.length, b: Object.keys(terminalUnits).length }) });
    } catch (error) { cuEconomatState.error = String(error && error.message || error); }
    cuEconomatState.saving = false; cuEconomatState.loaded = false;
    cuLoadEconomat(true);
  }
  function cuIntelBody() {
    cuWarmStays();
    const st = cuState();
    const rooms = Object.values(st.rooms || {});
    const folios = Object.values(st.folios || {}).filter(Boolean);
    /* Les séjours, pas l'état du document des chambres : personne ne repasse
     * une chambre en « occupée » quand un client arrive, de sorte que cette page
     * disait « 0 % · 0 occupée » avec un client en maison et « 0 arrivée » avec
     * une arrivée au planning, puis en tirait « Occupation basse ». */
    const tonight = cuTonight();
    const today = cuToday();
    const stays = Array.from(cuAllStays().values()).filter((b) => b?.hotel && b.hotel.dayUse !== true);
    const arrivals = stays.filter((b) => b.hotel.checkIn === today && ['confirmed', 'checked_in', 'completed'].includes(b.status)).length;
    const dirty = rooms.filter((room) => cuRoomStatus(room).key === 'sale').length;
    const unavailable = rooms.filter((room) => room.status === 'hs').length;
    const total = rooms.length;
    const known = total > 0 && tonight.known;
    const occupied = tonight.sold;
    const occupancy = known ? Math.round(occupied / total * 100) : null;
    cuStripUnknown = total > 0 && !tonight.known;
    const openBalance = folios.reduce((sum, folio) => sum + folioTotal(folio), 0);
    const configuredRates = cuTypes().map((type) => type.rate == null ? st.baseRate : type.rate).filter((rate) => rate != null && Number.isFinite(+rate));
    const averageRate = configuredRates.length ? Math.round(configuredRates.reduce((sum, rate) => sum + +rate, 0) / configuredRates.length) : null;
    const activeChannels = cuChannelState.loaded ? cuChannelState.rows.filter((row) => row.status === 'active').length : null;
    const recommendations = [];
    if (!rooms.length) recommendations.push([tx('Configurer les chambres'), tx('Le plan, les séjours, le ménage et les prévisions ont besoin de chambres réelles.')]);
    if (rooms.length && averageRate == null) recommendations.push([tx('Définir les tarifs'), tx('Aucun revenu potentiel ne peut être calculé tant que le tarif général ou les tarifs par type sont vides.')]);
    if (dirty) recommendations.push([tx('Prioriser le ménage'), tx(dirty === 1 ? '{n} chambre ne peut pas être revendue immédiatement.' : '{n} chambres ne peuvent pas être revendues immédiatement.', { n: dirty, c: txn(dirty, 'chambre') })]);
    if (known && occupancy >= 80 && averageRate != null) recommendations.push([tx('Demande forte'), tx(occupied === 1 ? '{n} chambre vendue sur {t} ce soir ({p} %). Vérifiez les prochaines dates avant d’augmenter les tarifs, sans modifier les réservations existantes.' : '{n} chambres vendues sur {t} ce soir ({p} %). Vérifiez les prochaines dates avant d’augmenter les tarifs, sans modifier les réservations existantes.', { n: occupied, c: txn(occupied, 'chambre'), t: total, p: occupancy })]);
    if (known && occupancy < 40 && total > 0) recommendations.push([tx('Occupation basse ce soir'), tx(occupied === 1 ? '{n} chambre vendue sur {t} ({p} %). Travaillez d’abord la vente directe et les dates creuses plutôt qu’une remise générale.' : '{n} chambres vendues sur {t} ({p} %). Travaillez d’abord la vente directe et les dates creuses plutôt qu’une remise générale.', { n: occupied, c: txn(occupied, 'chambre'), t: total, p: occupancy })]);
    if (activeChannels === 0) recommendations.push([tx('Connecter les calendriers OTA'), tx('Booking.com et Airbnb doivent bloquer la même disponibilité que les réservations directes.')]);
    if (!recommendations.length) recommendations.push([tx('Aucune urgence opérationnelle'), tx('Les chambres, tarifs, folios et canaux ne montrent pas de blocage immédiat.')]);
    return `<div class="hx-page">
      <div class="hx-strip">
        <div class="hx-kpi"><div class="l">${tx('Occupation ce soir')}</div><div class="v">${occupancy == null ? '·' : ltr(occupancy + ' %')}</div><div class="d">${total === 0 ? tx('aucune chambre déclarée') : (known ? tx(occupied === 1 ? '{n} vendue sur {t}' : '{n} vendues sur {t}', { n: occupied, t: total }) + (unavailable ? ' · ' + tx('{n} hors-service', { n: unavailable }) : '') : tx('lecture des séjours…'))}</div></div>
        <div class="hx-kpi"><div class="l">${tx('Arrivées du jour')}</div><div class="v">${tonight.known ? arrivals : '·'}</div><div class="d">${tx('selon les réservations')}</div></div>
        <div class="hx-kpi"><div class="l">${tx('Folios ouverts')}</div><div class="v">${folios.length}</div><div class="d">${tx('{amount} à suivre', { amount: MAD(openBalance) })}</div></div>
        <div class="hx-kpi"><div class="l">${tx('Tarif moyen configuré')}</div><div class="v">${averageRate == null ? '·' : ltr(fmt(averageRate) + ' <small>MAD</small>')}</div><div class="d">${tx('moyenne des tarifs de vos types')}</div></div>
      </div>
      <div class="hx-h"><span class="t">${tx('Décisions du jour')}</span><span class="s">${tx('calculées uniquement avec les données visibles de cet établissement')}</span></div>
      <div class="block" style="padding:8px 14px;">
        <div class="hx-list">${recommendations.map(([title, detail], index) => `<div class="hx-arr"><span class="tm">${String(index + 1).padStart(2, '0')}</span><div class="who"><b>${esc(title)}</b><div class="sub">${esc(detail)}</div></div><span class="hx-pill ${index ? 'neutral' : 'ok'}">${index ? tx('À SUIVRE') : tx('PRIORITÉ')}</span></div>`).join('')}</div>
      </div>
      <div class="block" style="padding:16px 18px;margin-top:14px;"><div class="hx-h" style="margin:0;"><span class="t">${tx('Limite des données')}</span><span class="s">${tx('Kiwi n’affiche pas de prévision 12 mois ni de risque no-show : il faudrait un historique quotidien que Kiwi ne tient pas encore. L’occupation à venir (Tarifs &amp; occupation) compte vos réservations, elle ne prédit rien.')}</span></div></div>
      ${cuEconomatBody()}
    </div>`;
  }

  /* ═══════════════ ONBOARDING WIZARD · fork with the hotel trade ═══════════════
   * Override of interactive.js's 'onboard' handler — same wizard, plus
   * « Hôtel / Riad » as a 4th primary type. Kept in this file so the
   * hotel trade travels with the vertical rather than the core wizard. */
  function obOnboard() {
    const Kw = window.Kiwi;
    const trL = (o) => { const l = (window.KiwiI18n && window.KiwiI18n.getLang && window.KiwiI18n.getLang()) || 'fr'; return o == null ? '' : (o[l] ?? o.fr ?? o); };
    let picked = 'restaurant';
    /* Material Symbols (Outlined, 400, grade 0, grille 24), recopiés depuis
     * assets/icons/material/ — voir le README de ce dossier. Forme pleine,
     * viewBox natif 0 -960 960 960 : la CSS pilote `color`, pas `stroke`. */
    const mi = (d) => `<svg viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true"><path d="${d}"/></svg>`;
    /* La liste des métiers vit dans assets/trades.js — celle-ci n'est plus que
     * le filet. C'est ce fichier qui avait ajouté l'hôtel, sans que ni
     * l'inscription ni la fiche établissement ne l'apprennent : un riad
     * s'inscrivait en « Autre ». Une seule liste, tout le monde la lit. */
    var KT_OB = window.KiwiTrades;
    const TYPES_OB = (KT_OB && KT_OB.all().map(function (t) {
      return { id: t.id, base: t.base, primary: t.primary, label: KT_OB.label(t.id), icon: t.icon };
    })) || [
      { id: 'restaurant', base: 'restaurant', primary: true, label: 'Restaurant',          /* restaurant.svg */ icon: mi('M280-80v-366q-51-14-85.5-56T160-600v-280h80v280h40v-280h80v280h40v-280h80v280q0 56-34.5 98T360-446v366h-80Zm400 0v-320H560v-280q0-83 58.5-141.5T760-880v800h-80Z') },
      { id: 'boutique',   base: 'boutique',   primary: true, label: 'Boutique',            /* storefront.svg */ icon: mi('M841-518v318q0 33-23.5 56.5T761-120H201q-33 0-56.5-23.5T121-200v-318q-23-21-35.5-54t-.5-72l42-136q8-26 28.5-43t47.5-17h556q27 0 47 16.5t29 43.5l42 136q12 39-.5 71T841-518Zm-272-42q27 0 41-18.5t11-41.5l-22-140h-78v148q0 21 14 36.5t34 15.5Zm-180 0q23 0 37.5-15.5T441-612v-148h-78l-22 140q-4 24 10.5 42t37.5 18Zm-178 0q18 0 31.5-13t16.5-33l22-154h-78l-40 134q-6 20 6.5 43t41.5 23Zm540 0q29 0 42-23t6-43l-42-134h-76l22 154q3 20 16.5 33t31.5 13ZM201-200h560v-282q-5 2-6.5 2H751q-27 0-47.5-9T663-518q-18 18-41 28t-49 10q-27 0-50.5-10T481-518q-17 18-39.5 28T393-480q-29 0-52.5-10T299-518q-21 21-41.5 29.5T211-480h-4.5q-2.5 0-5.5-2v282Zm560 0H201h560Z') },
      { id: 'spa',        base: 'spa',        primary: true, label: trL({fr:'Spa / Bien-être', en:'Spa / Wellness', ar:'سبا / عافية'}),     /* spa.svg */ icon: mi('M480-80q-73-9-145-39.5T206.5-207Q150-264 115-351T80-560v-40h40q51 0 105 13t101 39q12-86 54.5-176.5T480-880q57 65 99.5 155.5T634-548q47-26 101-39t105-13h40v40q0 122-35 209t-91.5 144q-56.5 57-128 87.5T480-80Zm-2-82q-11-166-98.5-251T162-518q11 171 101.5 255T478-162Zm2-254q15-22 36.5-45.5T558-502q-2-57-22.5-119T480-742q-35 59-55.5 121T402-502q20 17 42 40.5t36 45.5Zm78 236q37-12 77-35t74.5-62.5q34.5-39.5 59-98.5T798-518q-94 14-165 62.5T524-332q12 32 20.5 70t13.5 82Zm-78-236Zm78 236Zm-80 18Zm46-170ZM480-80Z') },
      { id: 'hotel',      base: 'hotel',      primary: true, label: trL({fr:'Hôtel / Riad', en:'Hotel / Riad', ar:'فندق / رياض'}),          /* hotel.svg */ icon: mi('M40-200v-600h80v400h320v-320h320q66 0 113 47t47 113v360h-80v-120H120v120H40Zm155-275q-35-35-35-85t35-85q35-35 85-35t85 35q35 35 35 85t-35 85q-35 35-85 35t-85-35Zm325 75h320v-160q0-33-23.5-56.5T760-640H520v240ZM308.5-531.5Q320-543 320-560t-11.5-28.5Q297-600 280-600t-28.5 11.5Q240-577 240-560t11.5 28.5Q263-520 280-520t28.5-11.5ZM280-560Zm240-80v240-240Z') },
      { id: 'cafe',       base: 'restaurant',                label: trL({fr:'Café / Salon de thé', en:'Café / Tea room', ar:'مقهى / صالون شاي'}), /* local_cafe.svg */ icon: mi('M160-120v-80h640v80H160Zm160-160q-66 0-113-47t-47-113v-400h640q33 0 56.5 23.5T880-760v120q0 33-23.5 56.5T800-560h-80v120q0 66-47 113t-113 47H320Zm0-80h240q33 0 56.5-23.5T640-440v-320H240v320q0 33 23.5 56.5T320-360Zm400-280h80v-120h-80v120ZM320-360h-80 400-320Z') },
      { id: 'fastfood',   base: 'restaurant',                label: trL({fr:'Fast-food / Snack', en:'Fast food / Snack', ar:'وجبات سريعة / سناك'}),   /* lunch_dining.svg */ icon: mi('M160-120q-33 0-56.5-23.5T80-200v-120h800v120q0 33-23.5 56.5T800-120H160Zm0-120v40h640v-40H160Zm263-160q-21 20-77 20t-76-20q-20-20-56-20t-57 20q-21 20-77 20v-80q36 0 57-20t77-20q56 0 76 20t56 20q36 0 57-20t77-20q56 0 77 20t57 20q36 0 56-20t76-20q56 0 79 20t55 20v80q-56 0-75-20t-55-20q-36 0-58 20t-78 20q-56 0-77-20t-57-20q-36 0-57 20ZM80-560v-40q0-115 108.5-177.5T480-840q183 0 291.5 62.5T880-600v40H80Zm400-200q-124 0-207.5 31T166-640h628q-23-58-106.5-89T480-760Zm0 520Zm0-400Z') },
      { id: 'bakery',     base: 'restaurant',                label: trL({fr:'Boulangerie', en:'Bakery', ar:'مخبزة'}),         /* bakery_dining.svg */ icon: mi('M804-282q17 9 30-4t4-30l-58-108-42 108 66 34Zm-200-38h48l96-238q3-8-1.5-13.5T736-580l-80-32q-9-3-17.5 2T628-596l-24 276Zm-296 0h48l-24-276q-2-11-10.5-15t-17.5-1l-80 32q-8 3-11.5 8.5T212-558l96 238Zm-152 38 66-34-42-108-58 108q-9 17 4 30t30 4Zm280-38h88l30-338q2-9-4.5-15.5T534-680H426q-8 0-14.5 6.5T406-658l30 338ZM138-200q-42 0-70-31.5T40-306q0-12 3.5-23.5T52-352l88-168q-14-40 1-79t53-55l80-32q14-5 28-7t28 1q14-29 39-48.5t57-19.5h108q32 0 57 19.5t39 48.5q14-2 28-.5t28 6.5l80 32q40 16 56 55t-2 77l88 168q6 11 9 23t3 25q0 45-30.5 75.5T814-200q-11 0-22-2.5t-22-7.5l-62-30H250l-56 30q-13 7-27.5 8.5T138-200Zm342-280Z') },
      { id: 'pizzeria',   base: 'restaurant',                label: 'Pizzeria',            /* local_pizza.svg */ icon: mi('M480-80 80-680q85-72 186.5-116T480-840q112 0 213.5 43.5T880-680L480-80Zm0-144 292-438q-65-45-139-71.5T480-760q-79 0-152.5 26.5T188-662l292 438Zm-57.5-353.5Q440-595 440-620t-17.5-42.5Q405-680 380-680t-42.5 17.5Q320-645 320-620t17.5 42.5Q355-560 380-560t42.5-17.5Zm100 200Q540-395 540-420t-17.5-42.5Q505-480 480-480t-42.5 17.5Q420-445 420-420t17.5 42.5Q455-360 480-360t42.5-17.5ZM480-224Z') },
      { id: 'traiteur',   base: 'restaurant',                label: trL({fr:'Traiteur', en:'Caterer', ar:'خدمات تقديم الطعام'}),            /* room_service.svg */ icon: mi('M80-200v-80h800v80H80Zm40-120v-40q0-128 78.5-226T400-710v-10q0-33 23.5-56.5T480-800q33 0 56.5 23.5T560-720v10q124 26 202 124t78 226v40H120Zm82-80h556q-14-104-93-172t-185-68q-106 0-184.5 68T202-400Zm278 0Z') },
      { id: 'foodtruck',  base: 'restaurant',                label: 'Food truck',          /* local_shipping.svg */ icon: mi('M155-195q-35-35-35-85H40v-440q0-33 23.5-56.5T120-800h560v160h120l120 160v200h-80q0 50-35 85t-85 35q-50 0-85-35t-35-85H360q0 50-35 85t-85 35q-50 0-85-35Zm113.5-56.5Q280-263 280-280t-11.5-28.5Q257-320 240-320t-28.5 11.5Q200-297 200-280t11.5 28.5Q223-240 240-240t28.5-11.5ZM120-360h32q17-18 39-29t49-11q27 0 49 11t39 29h272v-360H120v360Zm628.5 108.5Q760-263 760-280t-11.5-28.5Q737-320 720-320t-28.5 11.5Q680-297 680-280t11.5 28.5Q703-240 720-240t28.5-11.5ZM680-440h170l-90-120h-80v120ZM360-540Z') },
      { id: 'epicerie',   base: 'boutique',                  label: trL({fr:'Épicerie', en:'Grocery', ar:'بقالة'}),            /* local_grocery_store.svg */ icon: mi('M223.5-103.5Q200-127 200-160t23.5-56.5Q247-240 280-240t56.5 23.5Q360-193 360-160t-23.5 56.5Q313-80 280-80t-56.5-23.5Zm400 0Q600-127 600-160t23.5-56.5Q647-240 680-240t56.5 23.5Q760-193 760-160t-23.5 56.5Q713-80 680-80t-56.5-23.5ZM246-720l96 200h280l110-200H246Zm-38-80h590q23 0 35 20.5t1 41.5L692-482q-11 20-29.5 31T622-440H324l-44 80h480v80H280q-45 0-68-39.5t-2-78.5l54-98-144-304H40v-80h130l38 80Zm134 280h280-280Z') },
      { id: 'pharmacie',  base: 'boutique',                  label: 'Pharmacie',           /* local_pharmacy.svg */ icon: mi('M120-120v-80l80-240-80-240v-80h508l58-160 94 34-46 126h106v80l-80 240 80 240v80H120Zm320-160h80v-120h120v-80H520v-120h-80v120H320v80h120v120Zm-236 80h552l-80-240 80-240H204l80 240-80 240Zm276-240Z') },
      { id: 'librairie',  base: 'boutique',                  label: trL({fr:'Librairie', en:'Bookshop', ar:'مكتبة'}),           /* menu_book.svg */ icon: mi('M560-564v-68q33-14 67.5-21t72.5-7q26 0 51 4t49 10v64q-24-9-48.5-13.5T700-600q-38 0-73 9.5T560-564Zm0 220v-68q33-14 67.5-21t72.5-7q26 0 51 4t49 10v64q-24-9-48.5-13.5T700-380q-38 0-73 9t-67 27Zm0-110v-68q33-14 67.5-21t72.5-7q26 0 51 4t49 10v64q-24-9-48.5-13.5T700-490q-38 0-73 9.5T560-454ZM260-320q47 0 91.5 10.5T440-278v-394q-41-24-87-36t-93-12q-36 0-71.5 7T120-692v396q35-12 69.5-18t70.5-6Zm260 42q44-21 88.5-31.5T700-320q36 0 70.5 6t69.5 18v-396q-33-14-68.5-21t-71.5-7q-47 0-93 12t-87 36v394Zm-40 118q-48-38-104-59t-116-21q-42 0-82.5 11T100-198q-21 11-40.5-1T40-234v-482q0-11 5.5-21T62-752q46-24 96-36t102-12q58 0 113.5 15T480-740q51-30 106.5-45T700-800q52 0 102 12t96 36q11 5 16.5 15t5.5 21v482q0 23-19.5 35t-40.5 1q-37-20-77.5-31T700-240q-60 0-116 21t-104 59ZM280-494Z') },
      { id: 'fleuriste',  base: 'boutique',                  label: trL({fr:'Fleuriste', en:'Florist', ar:'محل أزهار'}),           /* local_florist.svg */ icon: mi('M480-600q17 0 28.5-11.5T520-640q0-17-11.5-28.5T480-680q-17 0-28.5 11.5T440-640q0 17 11.5 28.5T480-600Zm-70.5 218.5Q378-403 364-438q-5 0-9 .5t-9 .5q-52 0-89-37t-37-89q0-21 7-40.5t21-36.5q-13-17-20-36.5t-7-40.5q0-52 36.5-89t88.5-37q5 0 9 .5t9 .5q14-35 45.5-56.5T480-920q39 0 70.5 21.5T596-842q5 0 9-.5t9-.5q52 0 88.5 37t36.5 89q0 21-6.5 40.5T712-640q13 17 20 36.5t7 40.5q0 52-36.5 89T614-437q-5 0-9-.5t-9-.5q-14 35-45.5 56.5T480-360q-39 0-70.5-21.5ZM480-80q0-74 28.5-139.5T586-334q49-49 114.5-77.5T840-440q0 74-28.5 139.5T734-186q-49 49-114.5 77.5T480-80Zm98-98q57-21 100-64t64-100q-57 21-100 64t-64 100Zm-98 98q0-74-28.5-139.5T374-334q-49-49-114.5-77.5T120-440q0 74 28.5 139.5T226-186q49 49 114.5 77.5T480-80Zm-98-98q-57-21-100-64t-64-100q57 21 100 64t64 100Zm196 0Zm-196 0Zm232-339q19 0 32.5-13.5T660-563q0-14-7.5-24.5T633-604l-35-17q-2 11-6 21.5t-9 19.5q-5 9-12 17t-15 15l32 23q5 4 11.5 6t14.5 2Zm-16-142 35-17q12-6 19-17t7-24q0-19-13-32.5T614-763q-8 0-14 2t-12 6l-33 23q8 7 15.5 15t12.5 17q5 9 9 19.5t6 21.5Zm-159-93q10-4 20-6t21-2q11 0 21 2t20 6l5-44q2-18-12.5-31T480-840q-19 0-33.5 13T434-796l5 44Zm41 312q19 0 33.5-13t12.5-31l-5-44q-10 4-20 6t-21 2q-11 0-21-2t-20-6l-5 44q-2 18 12.5 31t33.5 13ZM362-659q2-11 6-21.5t9-19.5q5-9 12-17t15-15l-32-23q-5-4-11.5-6t-14.5-2q-19 0-32.5 13.5T300-717q0 13 7.5 24t19.5 17l35 17Zm-16 141q8 0 14-1.5t12-6.5l33-22q-8-7-15.5-15T377-580q-5-9-9-19.5t-6-21.5l-35 17q-12 6-19 17t-7 24q1 19 13.5 32t31.5 13Zm237-62Zm0-120Zm-103-60Zm0 240ZM377-700Zm0 120Z') },
      { id: 'maison',     base: 'boutique',                  label: trL({fr:'Maison', en:'Home', ar:'المنزل'}), /* home_and_garden.svg */ icon: mi('M160-160v-375l-72 55-47-63 439-337 440 336-48 64-392-300-240 184v356h160v80H160Zm540 95q-42 29-92.5 24.5T521-81q-36-36-40.5-86.5T505-260q-29-42-24.5-92.5T521-439q36-36 86.5-40.5T700-455q42-29 92.5-24.5T879-439q36 36 40.5 86.5T895-260q29 42 24.5 92.5T879-81q-36 36-86.5 40.5T700-65Zm0-98 46 32q18 13 39 11t37-18q16-16 18-37t-11-39l-32-46 32-46q13-18 11-39t-18-37q-16-16-37-18t-39 11l-46 32-46-32q-18-13-39-11t-37 18q-16 16-18 37t11 39l32 46-32 46q-13 18-11 39t18 37q16 16 37 18t39-11l46-32Zm35.5-61.5Q750-239 750-260t-14.5-35.5Q721-310 700-310t-35.5 14.5Q650-281 650-260t14.5 35.5Q679-210 700-210t35.5-14.5ZM480-470Zm220 210Z') },
      { id: 'coiffure',   base: 'spa',                       label: trL({fr:'Salon de coiffure', en:'Hair salon', ar:'صالون حلاقة'}),   /* content_cut.svg */ icon: mi('M760-120 480-400l-94 94q8 15 11 32t3 34q0 66-47 113T240-80q-66 0-113-47T80-240q0-66 47-113t113-47q17 0 34 3t32 11l94-94-94-94q-15 8-32 11t-34 3q-66 0-113-47T80-720q0-66 47-113t113-47q66 0 113 47t47 113q0 17-3 34t-11 32l494 494v40H760ZM600-520l-80-80 240-240h120v40L600-520ZM296.5-663.5Q320-687 320-720t-23.5-56.5Q273-800 240-800t-56.5 23.5Q160-753 160-720t23.5 56.5Q207-640 240-640t56.5-23.5ZM494-466q6-6 6-14t-6-14q-6-6-14-6t-14 6q-6 6-6 14t6 14q6 6 14 6t14-6ZM296.5-183.5Q320-207 320-240t-23.5-56.5Q273-320 240-320t-56.5 23.5Q160-273 160-240t23.5 56.5Q207-160 240-160t56.5-23.5Z') },
      { id: 'sport',      base: 'spa',                       label: trL({fr:'Salle de sport', en:'Gym', ar:'صالة رياضية'}),      /* fitness_center.svg */ icon: mi('m536-84-56-56 142-142-340-340-142 142-56-56 56-58-56-56 84-84-56-58 56-56 58 56 84-84 56 56 58-56 56 56-142 142 340 340 142-142 56 56-56 58 56 56-84 84 56 58-56 56-58-56-84 84-56-56-58 56Z') },
    ];
    const moreCount = TYPES_OB.filter((t) => !t.primary).length;
    const fld = 'width:100%;padding:11px 13px;border:1px solid var(--n-200);border-radius:10px;font-family:var(--sans);font-size:14px;color:var(--ink);background:var(--surface);outline:none;box-sizing:border-box;';
    const lbl = 'display:block;font-size:12px;font-weight:500;color:var(--n-600);margin:16px 0 6px;';
    const m = Kw.modal({
      tag: trL({fr:'BIENVENUE SUR KIWI', en:'WELCOME TO KIWI', ar:'مرحبًا بك في Kiwi'}),
      title: trL({fr:'Configurez votre tableau de bord', en:'Set up your dashboard', ar:'اضبط لوحة التحكم'}),
      desc: trL({fr:'Une minute pour créer le vôtre, vide, prêt à se remplir avec vos vraies ventes.', en:'One minute to create yours, empty and ready to fill with your real sales.', ar:'دقيقة واحدة لإنشاء لوحتك، فارغة وجاهزة لتمتلئ بمبيعاتك الحقيقية.'}),
      width: 520,
      body: `
        <style>
          .ob-type{display:flex;flex-direction:column;align-items:center;gap:7px;padding:14px 8px;
            border:1px solid var(--n-200);border-radius:12px;background:var(--surface);cursor:pointer;
            font-family:var(--sans);font-size:12px;font-weight:500;color:var(--n-600);text-align:center;
            transition:border-color 140ms,background 140ms,color 140ms;}
          .ob-type svg{width:24px;height:24px;}
          .ob-type:hover{border-color: var(--n-400);}
          .ob-type.sel{border-color:var(--atlas);background:rgba(11,110,79,0.05);color:var(--atlas);}
          .ob-type.ob-more{display:none;}
          .ob-morebtn{margin-top:8px;width:100%;padding:9px;border:1px dashed var(--n-300);
            border-radius:10px;background:var(--surface);cursor:pointer;font-family:var(--sans);font-size:12.5px;
            font-weight:500;color:var(--n-600);transition:border-color 140ms,color 140ms;}
          .ob-morebtn:hover{border-color:var(--atlas);color:var(--atlas);}
          .ob-field:focus{border-color:var(--atlas)!important;}
        </style>
        <label style="${lbl}margin-top:4px;">${trL({fr:'Type d\'activité', en:'Business type', ar:'نوع النشاط'})}</label>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;">
          ${TYPES_OB.map((t) => `<button type="button" class="ob-type${t.id === picked ? ' sel' : ''}${t.primary ? '' : ' ob-more'}" data-ob-type="${t.id}">${t.icon}<span>${t.label}</span></button>`).join('')}
        </div>
        <button type="button" class="ob-morebtn" data-ob-more>${trL({fr:'+ Plus de types', en:'+ More types', ar:'+ أنواع أخرى'})} (${moreCount})</button>
        <label style="${lbl}">${trL({fr:'Nom de l\'activité', en:'Business name', ar:'اسم النشاط'})}</label>
        <input class="ob-field" data-ob-name placeholder="${trL({fr:'Ex. Café des Oudayas', en:'e.g. Café des Oudayas', ar:'مثال: مقهى الأوداية'})}" style="${fld}" maxlength="40"/>
        <label style="${lbl}">${trL({fr:'Ville', en:'City', ar:'المدينة'})}</label>
        <input class="ob-field" data-ob-city placeholder="${trL({fr:'Ex. Rabat', en:'e.g. Rabat', ar:'مثال: الرباط'})}" style="${fld}" maxlength="30"/>
        <label style="${lbl}">${trL({fr:'Objectif de chiffre d\'affaires par jour', en:'Daily revenue goal', ar:'هدف رقم المعاملات اليومي'})} <span style="color: var(--n-500);font-weight:400;">· ${trL({fr:'optionnel', en:'optional', ar:'اختياري'})}</span></label>
        <input class="ob-field" data-ob-goal type="number" dir="ltr" inputmode="numeric" placeholder="${trL({fr:'Ex. 5000 MAD', en:'e.g. 5000 MAD', ar:'مثال: 5000 MAD'})}" style="${fld}" min="0"/>
      `,
      foot: `<button class="kb atlas" data-ob-create type="button" style="width:100%;justify-content:center;padding:13px;font-size:15px;">${trL({fr:'Créer mon tableau de bord →', en:'Create my dashboard →', ar:'أنشئ لوحة التحكم ←'})}</button>`,
    });
    const nameInput = m.el.querySelector('[data-ob-name]');
    setTimeout(() => nameInput && nameInput.focus(), 320);
    m.el.querySelectorAll('[data-ob-type]').forEach((x) => x.classList.toggle('sel', x.dataset.obType === picked));
    let step1 = null;
    const doCreate = (answers) => {
      const { name, city, goal, def } = step1;
      let id = null;
      try {
        id = window.KiwiVenue?.createVenue?.({
          type: def.base, subtype: def.id,
          name, location: city, goal, profile: answers,
        });
      } catch (_) {}
      if (!id) { Kw.toast(trL({fr:'Création impossible', en:'Creation failed', ar:'تعذّر الإنشاء'}), { type: 'warn', force: true }); return; }
      m.close();
      try { window.KiwiVenue.setVenue(id); } catch (_) {}
      const todayPill = document.querySelector('[data-action="date-range"][data-range="aujourdhui"]');
      if (todayPill && !todayPill.classList.contains('on')) todayPill.click();
      Kw.confetti();
      Kw.toast(trL({fr:'Votre tableau de bord est prêt', en:'Your dashboard is ready', ar:'لوحة التحكم جاهزة'}), { type: 'success', force: true,
        desc: `${name}, ${answers
          ? trL({fr:'profil complété ✓ · enregistrez votre première vente.', en:'profile completed ✓ · record your first sale.', ar:'اكتمل الملف ✓ · سجّل أول عملية بيع.'})
          : trL({fr:'enregistrez votre première vente pour le voir prendre vie.', en:'record your first sale to see it come alive.', ar:'سجّل أول عملية بيع لتراها تنبض بالحياة.'})}` });
      if (def.id === 'hotel') {
        setTimeout(() => Kw.toast(trL({fr:'Votre hôtel est en place', en:'Your hotel is set up', ar:'فندقك جاهز'}), { type: 'info', force: true,
          desc: trL({fr:'Plan des chambres, réception, folios et ménage sont prêts, vendez votre première chambre en walk-in.', en:'Room rack, front desk, folios and housekeeping are ready, sell your first room as a walk-in.', ar:'مخطط الغرف والاستقبال والفواتير جاهزة، بِع أول غرفة walk-in.'}) }), 1700);
      }
    };
    const readAnswers = () => {
      const out = {};
      m.el.querySelectorAll('[data-ob-q]').forEach((i) => {
        const v = (i.value || '').trim();
        if (v) out[i.dataset.obQ] = v;
      });
      return Object.keys(out).length ? out : null;
    };
    m.el.addEventListener('click', (e) => {
      if (e.target.closest('[data-ob-more]')) {
        m.el.querySelectorAll('.ob-type.ob-more').forEach((x) => x.classList.remove('ob-more'));
        const btn = m.el.querySelector('[data-ob-more]');
        if (btn) btn.style.display = 'none';
        return;
      }
      const t = e.target.closest('[data-ob-type]');
      if (t) {
        picked = t.dataset.obType;
        m.el.querySelectorAll('[data-ob-type]').forEach((x) => x.classList.toggle('sel', x === t));
        return;
      }
      if (e.target.closest('[data-ob-create]')) {
        const name = (nameInput.value || '').trim();
        if (!name) { Kw.toast(trL({fr:'Donnez un nom à votre activité', en:'Give your business a name', ar:'أدخل اسم نشاطك التجاري'}), { type: 'warn', force: true }); nameInput.focus(); return; }
        const city = (m.el.querySelector('[data-ob-city]').value || '').trim();
        const goal = +(m.el.querySelector('[data-ob-goal]').value) || 0;
        const def = TYPES_OB.find((x) => x.id === picked) || TYPES_OB[0];
        step1 = { name, city, goal, def };
        const prof = window.KiwiVenue?.getSubtypeProfile?.(picked);
        if (!prof || !prof.questions || !prof.questions.length) { doCreate(null); return; }
        const optWord = trL({fr:'optionnel', en:'optional', ar:'اختياري'});
        m.el.querySelector('.kiwi-modal-body').innerHTML = `
          <style>.ob-field:focus{border-color:var(--atlas)!important;}</style>
          <div style="font-family:var(--mono);font-size:11px;letter-spacing:0.1em;color:var(--atlas);margin:2px 0 10px;">${trL({fr:'ÉTAPE 2 / 2 · TOUT EST OPTIONNEL', en:'STEP 2 / 2 · ALL OPTIONAL', ar:'الخطوة 2/2 · كل شيء اختياري'})}</div>
          <div style="font-size:17px;font-weight:600;letter-spacing:-0.01em;">${trL({fr:'Parlez-nous de votre activité', en:'Tell us about your business', ar:'حدثنا عن نشاطك'})} · ${def.label}</div>
          <p style="font-size:13px;color:var(--n-500);margin:6px 0 2px;line-height:1.5;">${trL({fr:'30 secondes, Kiwi personnalise vos indicateurs et vos modules. Modifiable plus tard dans Paramètres.', en:'30 seconds, Kiwi tailors your indicators and modules. Editable later in Settings.', ar:'30 ثانية, يخصص كيوي مؤشراتك ووحداتك. قابل للتعديل لاحقًا في الإعدادات.'})}</p>
          ${prof.questions.map((q) => `
            <label style="${lbl}">${trL(q.label)} <span style="color: var(--n-500);font-weight:400;">· ${optWord}</span></label>
            <input class="ob-field" data-ob-q="${q.k}" ${q.type === 'number' ? 'type="number" inputmode="numeric" min="0"' : 'maxlength="60"'} placeholder="${q.ph}" style="${fld}"/>
          `).join('')}`;
        const foot = m.el.querySelector('.kiwi-modal-foot');
        if (foot) foot.innerHTML = `
          <button class="kb ghost" data-ob-skip type="button" style="flex:1;justify-content:center;">${trL({fr:'Passer pour l\'instant', en:'Skip for now', ar:'تخطّ الآن'})}</button>
          <button class="kb atlas" data-ob-finish type="button" style="flex:1.4;justify-content:center;">${trL({fr:'Terminer →', en:'Finish →', ar:'إنهاء ←'})}</button>`;
        setTimeout(() => { const f = m.el.querySelector('[data-ob-q]'); if (f) f.focus(); }, 120);
        return;
      }
      if (e.target.closest('[data-ob-skip]')) { doCreate(null); return; }
      if (e.target.closest('[data-ob-finish]')) { doCreate(readAnswers()); return; }
    });
  }

  function register() {
    if (!window.Kiwi || !window.Kiwi.handlers || !window.Kiwi.appPage) { setTimeout(register, 80); return; }
    const { handlers, toast } = window.Kiwi;

    /* Read the tenant-scoped room document as soon as the hotel module is
     * operational. Venue switches reuse the same conflict-safe handle under
     * the new slug; the local copy still paints immediately while it loads. */
    bindCuCloud();
    try { window.KiwiVenue.subscribe(() => { bindCuCloud(); }); } catch (_) {}
    if (!cuReservationEventsBound) {
      cuReservationEventsBound = true;
      /* La première lecture des séjours remplace le « · » des bandeaux : une
       * seule fois (cuStripUnknown), jamais sous le curseur d'un champ. */
      window.addEventListener('kiwi-hotel-stays-loaded', () => {
        if (!cuStripUnknown || !isCustomHotel()) return;
        if (['reception', 'sejours', 'tarifs', 'hotelintel', 'chambres', 'menage', 'folios'].includes(openDrawer?.page)) rerender();
      });
      window.addEventListener('kiwi-reservations-changed', () => {
        if (isCustomHotel() && ['sejours', 'reception'].includes(openDrawer?.page)) rerender();
      });
      /* A language switch re-reads the open hotel page: title, context line,
       * breadcrumb, then the body. appPage() is not called again, so the
       * page keeps its scroll and the sidebar keeps its focus. The page host
       * outlives a return to the dashboard (hidden, still connected), so
       * « open » is also « <body> still shows a genpage »: otherwise the
       * hotel title landed in the dashboard's own « Home / Dashboard ». */
      window.addEventListener('kiwi:langchange', () => {
        const d = openDrawer;
        if (!d || !d.el || !d.el.isConnected || !document.body.classList.contains('page-genpage')) return;
        const title = String(d.titleFn ? d.titleFn() : '');
        const h1 = d.el.querySelector('.genpage-head h1');
        if (h1) h1.textContent = title;
        window.Kiwi?.breadcrumb?.(title);
        const p = d.el.querySelector('.genpage-head p');
        const sub = d.subFn ? d.subFn() : '';
        if (p && sub) {
          p.textContent = '';
          String(sub).split(' · ').forEach((seg, i) => {
            if (i) { const dot = document.createElement('i'); dot.className = 'dot'; dot.setAttribute('aria-hidden', 'true'); p.appendChild(dot); }
            const s = document.createElement('span'); s.className = 'seg'; s.textContent = seg; p.appendChild(s);
          });
        }
        rerender();
      });
    }

    /* The 0000 wizard now offers « Hôtel / Riad » — fork of
     * interactive.js's onboard handler (see obOnboard above). Re-asserted
     * after load like pages-pro's starter wraps, in case of re-registration. */
    handlers['onboard'] = obOnboard;

    /* — navigation (sidebar + cards) — custom (0000) hotels get their own
     * starter pages on the live rack/folio engine; the riad keeps its demo.
     * The Riad Yasmina demo is a showroom: a real session never paints it,
     * even before its venue type has caught up (KiwiEnv.isReal). Its seed
     * data stays French; every surface a real hotel sees reads tx(). */
    const cu = () => isCustomHotel() || !!window.KiwiEnv?.isReal?.();
    handlers['nav-reception'] = () => cu()
      ? (page('reception', () => tx('Réception'), () => vName() + ' · ' + tx('arrivées, départs et dossiers en maison'), cuReceptionBody), cuRefreshReception())
      : page('reception', () => tx('Réception'), 'Riad Yasmina · Médina, Marrakech · arrivées, départs, walk-ins, en un geste', receptionBody);
    handlers['nav-chambres'] = () => cu()
      ? page('chambres', () => tx('Plan des chambres'), () => roomCountLabel() + ' · ' + tx('toucher une chambre libre la vend en walk-in'), cuRackBody)
      : page('chambres', () => tx('Plan des chambres'), '24 chambres · 3 niveaux · toucher une chambre ouvre le client et son folio', rackBody);
    handlers['nav-sejours'] = () => cu()
      ? page('sejours', () => tx('Réservations & séjours'), () => vName() + ' · ' + tx('le tape chart se remplit avec vos réservations'), cuSejoursBody)
      : page('sejours', () => tx('Réservations & séjours'), 'Tape chart · chambres × dates · sources de réservation et ligne d\'occupation', tapeBody);
    handlers['nav-menage'] = () => cu()
      ? page('menage', () => tx('Ménage'), () => tx('Remise à blanc · chaque départ encaissé pousse sa chambre ici'), cuMenageBody)
      : page('menage', () => tx('Ménage'), 'File de remise à blanc · assignation · inspection gouvernante', menageBody);
    handlers['nav-tarifs'] = () => cu()
      ? page('tarifs', () => tx('Tarifs & occupation'), () => tx('Tarifs par type · occupation, ADR et RevPAR calculés sur vos séjours'), cuTarifsBody)
      : page('tarifs', () => tx('Tarifs & occupation'), 'ADR · RevPAR · calendrier tarifaire propriétaire + suggestions IA', tarifsBody);
    /* Backward-compatible alias for old bookmarks only. The hotel-specific
     * guest mock was removed from the sidebar; Hospitality+ is the real shared
     * client directory used by dashboard and reception caisse. */
    handlers['nav-hotes'] = () => cu() ? handlers['hx-commercial']() : handlers['clients-directory']?.();
    handlers['hx-commercial'] = () => {
      if (!cu()) return;
      const p = page('commercial', () => tx('Clients, agences & sociétés'), () => tx('Comptes de facturation · contrats · Cardex voyageurs'), cuCommercialBody);
      p.el.addEventListener('submit', e => {
        if (!e.target.matches('[data-hx-commercial-filter]')) return;
        e.preventDefault(); const fd = new FormData(e.target), st = cuCommercialState();
        st.kind = fd.get('kind'); st.search = fd.get('search'); rerender();
      });
      cuLoadCommercial();
    };
    handlers['hx-commercial-refresh'] = () => cuLoadCommercial();
    handlers['hx-production'] = () => {
      if (!cu()) return;
      const p = page('production', () => tx('Production mensuelle'), () => tx('Comptes & canaux · chambres-nuits réservées'), cuProductionBody);
      p.el.addEventListener('submit', e => {
        if (!e.target.matches('[data-hx-production-filter]')) return;
        e.preventDefault(); cuProductionState().month = new FormData(e.target).get('month'); cuLoadProduction();
      });
      cuLoadProduction();
    };
    handlers['hx-account-new'] = () => cuCommercialEditor('account');
    handlers['hx-account-edit'] = (el, id) => cuCommercialEditor('account', id);
    handlers['hx-account-stays'] = (el, id) => cuAccountStays(id);
    handlers['hx-contract-new'] = () => cuCommercialEditor('contract');
    handlers['hx-contract-edit'] = (el, id) => cuCommercialEditor('contract', id);
    handlers['nav-folios'] = () => cu()
      ? page('folios', () => tx('Notes clients · folios'), () => tx('Une note par séjour : nuits, formule repas et consommations de la chambre'), cuFoliosBody)
      : page('folios', () => tx('Notes clients · folios'), 'Chambres + restaurant + hammam + taxe de séjour, une seule note par séjour', foliosBody);
    handlers['nav-canaux'] = () => cu()
      ? (page('canaux', () => tx('Canaux & OTA'), () => tx('Calendriers importés et limites de synchronisation'), cuCanauxBody), setTimeout(()=>cuLoadChannels(false),0))
      : page('canaux', () => tx('Canaux & OTA'), 'Booking.com, Expedia, Airbnb, direct · commissions visibles, enfin', canauxBody);
    handlers['nav-hotelintel'] = () => cu()
      ? (page('hotelintel', () => tx('Intelligence hôtel'), () => tx('Prévisions, Économat et contrôle opérationnel'), cuIntelBody), setTimeout(() => cuLoadEconomat(false), 0))
      : page('hotelintel', () => tx('Intelligence hôtel'), 'Prévision d\'occupation · tarification · no-shows · où part l\'argent', intelBody);
    /* Points de vente: the clear entry for outlet configuration. Same shared
     * draft and registry as the Économat section — naming and till mapping
     * here is naming and till mapping there. nav-economat stays owned by
     * hotel-economat.js (stock/receiving workspace); this page links there
     * instead of duplicating it. */
    handlers['nav-points-vente'] = () => cu()
      ? (page('points-vente', () => tx('Points de vente'), () => tx('Restaurants, bars et caisses · un seul registre partagé'), cuPdvBody), setTimeout(() => cuLoadEconomat(false), 0))
      : null;
    /* Per-outlet menu: what this outlet's tills actually sell, read-only.
     * Prices come from the merchant catalogue — the same document every
     * till sells from — so there is nothing outlet-specific to drift. */
    handlers['hx-outlet-menu'] = async (el, arg) => {
      if (!isCustomHotel()) return;
      const unit = (cuEconomatState.draft?.units || cuEconomatState.registry.units || []).find((u) => u && u.id === String(arg));
      const name = unit?.name || tx('Point de vente');
      const m = K().modal({ tag: tx('POINT DE VENTE'), title: tx('Menu · {name}', { name }), desc: tx('Articles et prix de vente pratiqués par les caisses de ce point de vente.'), width: 620,
        body: `<div data-hx-outlet-menu role="status">${tx('Chargement du catalogue…')}</div>` });
      m.el.querySelector('.kiwi-modal')?.classList.add('hx-hotel-modal');
      m.el.__hxClose = m.close;
      const host = m.el.querySelector('[data-hx-outlet-menu]');
      // One catalogue for the whole hotel: editing a price here changes what
      // every till sells. Linked, never duplicated.
      const foot = `<p class="hx-outlet-shared">${tx('Prix partagés par tout l’hôtel : le catalogue est commun à tous les points de vente. Modifier un prix change ce que toutes les caisses vendent.')}</p><button type="button" class="hx-btn ghost" data-action="hx-outlet-edit-menu">${tx('Modifier dans le catalogue')}</button>`;
      try {
        const res = await fetch('/api/catalog?merchant=' + encodeURIComponent(cuMerchantSlug()), { credentials: 'same-origin' });
        const body = await res.json().catch(() => ({}));
        const products = res.ok && body && body.data && Array.isArray(body.data.products)
          ? body.data.products.filter((p) => p && p.id && p.name && !p.archived) : null;
        if (!res.ok || !products) { if (host) host.innerHTML = `<p class="hx-econ-empty">${tx('Catalogue indisponible pour le moment.')}</p>` + foot; return; }
        if (host) host.innerHTML = products.length
          ? `<div class="hx-outlet-menu">${products.slice(0, 200).map((p) => `<div><span>${esc(p.name)}</span><b>${MAD(Number(p.priceMAD) || 0)}</b></div>`).join('')}</div><small>${tx('{c} au catalogue de l’établissement.', { c: txn(products.length, 'article') })}</small>` + foot
          : `<p class="hx-econ-empty">${tx('Aucun article au catalogue pour le moment.')}</p>` + foot;
      } catch (_) { if (host) host.innerHTML = `<p class="hx-econ-empty">${tx('Catalogue indisponible pour le moment.')}</p>` + foot; }
    };
    /* From an outlet's menu into the existing authorized catalogue editor.
     * The modal closes first so the editor opens onto a clean page. */
    handlers['hx-outlet-edit-menu'] = (el) => {
      const back = el.closest('.kiwi-backdrop');
      const close = back && back.__hxClose;
      if (typeof close === 'function') { try { close(); } catch (_) {} }
      else if (back) back.remove();
      const nav = window.Kiwi && window.Kiwi.handlers && window.Kiwi.handlers['nav-inventory'];
      if (typeof nav === 'function') nav();
      else if (typeof toast === 'function') toast(tx('Catalogue indisponible'), { type: 'warn', desc: tx('Ouvrez l’inventaire depuis le tableau de bord.') });
    };

    handlers['hx-econ-refresh'] = () => { cuEconomatState.loaded = false; cuLoadEconomat(true); };
    handlers['hx-econ-add-unit'] = (el, arg) => { if (!cuEconomatState.draft) cuEconomatState.draft = cuEconomatDraft(cuEconomatState.registry); cuCaptureEconomatDraft(); cuEconomatState.draft.units.push(cuNewUnit(arg === 'department' ? 'department' : 'outlet')); rerender(); };
    handlers['hx-econ-add-terminal'] = () => { if (!cuEconomatState.draft) cuEconomatState.draft = cuEconomatDraft(cuEconomatState.registry); cuCaptureEconomatDraft(); cuEconomatState.draft.terminals.push({ terminalId: '', unitId: '' }); rerender(); };
    handlers['hx-econ-remove-terminal'] = (el, arg) => { if (!cuEconomatState.draft) return; cuCaptureEconomatDraft(); cuEconomatState.draft.terminals.splice(Math.max(0, parseInt(arg, 10) || 0), 1); rerender(); };
    handlers['hx-econ-save'] = (el) => cuSaveEconomat(el);
    handlers['hx-econ-shift'] = (el, arg) => cuLoadRoomShift(String(arg || ''));

  async function cuMonthlyClosingModal() {
    const slug = window.KiwiStore?.slugFor?.(cuVenueId()) || '';
    if (!slug) { toast(tx('Établissement non connecté'), { type: 'warn' }); return; }

    const now = new Date();
    const curY = now.getFullYear();
    const curM = now.getMonth() + 1;
    const defaultMonth = (now.getDate() <= 5)
      ? (curM === 1 ? `${curY - 1}-12` : `${curY}-${String(curM - 1).padStart(2, '0')}`)
      : `${curY}-${String(curM).padStart(2, '0')}`;

    let activeMonth = defaultMonth;
    const pendingReviewKeys = new Map();

    const m = K().modal({
      tag: tx('REVUE INTERNE'),
      title: tx('Contrôle mensuel interne'),
      desc: tx('Cohérence des séjours du mois · scellé horodaté à usage interne, sans valeur déclarative.'),
      width: 760,
      body: `<div data-hx-closing-container class="hx-close-loading">
        <span>${tx('Chargement des contrôles…')}</span>
      </div>`
    });

    openModal = { el: m.el, close: m.close };

    function serverExceptionsHtml(exceptions) {
      if (!Array.isArray(exceptions) || !exceptions.length) return '';
      const rows = exceptions.slice(0, 12).map((e) => {
        const where = [e.bookingCode, e.roomId].filter(Boolean).map((x) => esc(String(x))).join(' · ');
        return `<div class="hx-close-exc-row"><b>${esc(String(e.code || tx('anomalie')))}</b><span>${esc(String(e.label || ''))}</span>${where ? `<small>${where}</small>` : ''}</div>`;
      }).join('');
      return `<div class="hx-close-exc-list" role="alert">${rows}</div>`;
    }

    async function postReview(action, extra, btn) {
      const pin = prompt(tx('Code PIN Direction / Gérant (si non connecté avec le compte propriétaire) :')) || '';
      const intent = [action, activeMonth, String(extra?.rectificationReason || '')].join('|');
      let idempotencyKey = pendingReviewKeys.get(intent);
      if (!idempotencyKey) {
        idempotencyKey = 'hotel-review-' + crypto.randomUUID();
        pendingReviewKeys.set(intent, idempotencyKey);
      }
      btn.disabled = true;
      const errBox = m.el.querySelector('[data-hx-closing-error]');
      if (errBox) errBox.innerHTML = '';
      try {
        const resp = await fetch('/api/hotel/declarations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, merchant: slug, month: activeMonth, pin, idempotencyKey, ...(extra || {}) })
        });
        const resBody = await resp.json().catch(() => ({}));
        if (resp.ok || resp.status < 500) pendingReviewKeys.delete(intent);
        if (!resp.ok) {
          if (errBox) {
            errBox.innerHTML = `<div class="hx-close-err">${esc(resBody.detail || resBody.error || tx('Contrôle impossible pour ce mois.'))}${serverExceptionsHtml(resBody.exceptions)}</div>`;
          } else {
            toast(resBody.detail || resBody.error || tx('Contrôle impossible pour ce mois.'), { type: 'error' });
          }
        } else if (resBody.replayed) {
          toast(tx('Demande déjà scellée, révision existante rechargée'), { type: 'success' });
          load(activeMonth);
        } else {
          toast(action === 'finalize' ? tx('Mois {m} scellé en contrôle interne', { m: activeMonth }) : tx('Révision {n} enregistrée', { n: resBody.declaration?.revision }), { type: 'success' });
          load(activeMonth);
        }
      } catch (_) {
        if (errBox) errBox.innerHTML = `<div class="hx-close-err">${tx('Erreur réseau.')}</div>`;
        else toast(tx('Erreur réseau.'), { type: 'error' });
      } finally { btn.disabled = false; }
    }

    async function load(month) {
      activeMonth = month;
      const container = m.el.querySelector('[data-hx-closing-container]');
      if (!container) return;
      container.innerHTML = `<div class="hx-close-loading"><span>${tx('Calcul et vérification des règles…')}</span></div>`;

      try {
        const res = await fetch(`/api/hotel/declarations?merchant=${encodeURIComponent(slug)}&month=${encodeURIComponent(month)}`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          container.innerHTML = `<div class="hx-close-err">${esc(data.detail || data.error || tx('Lecture impossible.'))}</div>`;
          return;
        }
        const decls = data.declarations || [];
        const latest = decls[0] || null;

        const [yStr, mStr] = month.split('-');
        const y = parseInt(yStr, 10), mVal = parseInt(mStr, 10);
        const mStart = `${month}-01`;
        const mEnd = mVal === 12 ? `${y + 1}-01-01` : `${y}-${String(mVal + 1).padStart(2, '0')}-01`;

        let d1Stays = [];
        try {
          const sRes = await fetch(`/api/hotel/stays?merchant=${encodeURIComponent(slug)}&from=${encodeURIComponent(mStart)}&to=${encodeURIComponent(mEnd)}`);
          if (sRes.ok) {
            const sData = await sRes.json();
            if (Array.isArray(sData.stays)) d1Stays = sData.stays;
          }
        } catch (_) {}

        const allMonthStays = new Map();
        const doc = window.KiwiReservations?.get?.() || { bookings: [] };
        (doc.bookings || []).forEach((b) => { if (b && b.id) allMonthStays.set(b.id, b); });
        d1Stays.forEach((b) => { if (b && b.id) allMonthStays.set(b.id, b); });

        const monthStays = Array.from(allMonthStays.values()).filter((b) => b.hotel && b.status !== 'cancelled' && b.status !== 'no_show' && b.hotel.checkIn < mEnd && b.hotel.checkOut > mStart);

        const todayStr = new (globalThis.KiwiZoneLaw?.DateTimeFormat || Intl.DateTimeFormat)('en-CA', { timeZone: 'Africa/Casablanca', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

        const exceptions = [];
        monthStays.forEach((b) => {
          const errs = cuEvaluateStayExceptions(b, todayStr);
          if (errs.length) exceptions.push({ booking: b, errs });
        });

        const blockingCount = exceptions.filter((x) => x.errs.some((e) => e.severity === 'danger')).length;

        let statusBadge = '';
        if (latest) {
          statusBadge = `<span class="hx-close-badge closed">${tx('CONTRÔLÉ (Rév. {n})', { n: latest.revision })}</span>`;
        } else if (blockingCount > 0) {
          statusBadge = `<span class="hx-close-badge blocked">${tx('NON CONTRÔLÉ · {n} ANOMALIE(S)', { n: blockingCount })}</span>`;
        } else {
          statusBadge = `<span class="hx-close-badge ready">${tx('PRÊT POUR CONTRÔLE')}</span>`;
        }

        let summaryHtml = '';
        if (latest) {
          const p = latest.payload || {};
          summaryHtml = `<div class="hx-close-grid">
            <div class="hx-close-stat"><span>${tx('Arrivées')}</span><b>${p.totalArrivals || 0}</b></div>
            <div class="hx-close-stat"><span>${tx('Nuitées clients')}</span><b>${p.totalBedNights || 0}</b></div>
            <div class="hx-close-stat"><span>${tx('Nuits-chambres occupées')}</span><b>${p.occupiedRoomNightsCount || 0}</b></div>
            <div class="hx-close-stat"><span>${tx('Empreinte SHA-256')}</span><small class="hx-mono" dir="ltr">${esc((latest.canonicalHash || '').slice(0, 16))}...</small></div>
          </div>`;
        } else if (!monthStays.length) {
          summaryHtml = `<p class="hx-close-note">${tx('Aucun séjour sur ce mois, un mois sans activité peut être scellé tel quel.')}</p>`;
        }

        let historyHtml = '';
        if (decls.length > 0) {
          historyHtml = `<div class="hx-close-hist">
            <div class="hx-close-hist-title">${tx('HISTORIQUE DES RÉVISIONS')}</div>
            <div class="hx-close-hist-scroll">
              <table>
                <thead><tr><th>${tx('Rév.')}</th><th>${tx('Date')}</th><th>${tx('Responsable')}</th><th>${tx('Motif')}</th></tr></thead>
                <tbody>
                  ${decls.map((d) => `<tr>
                    <td><b>#${d.revision}</b> (${esc(d.state || '')})</td>
                    <td>${new Date(d.closedAt).toLocaleDateString(hxLocale())} ${new Date(d.closedAt).toLocaleTimeString(hxLocale(), { hour: '2-digit', minute: '2-digit' })}</td>
                    <td>${esc(d.closedBy?.name || tx('Direction'))}</td>
                    <td>${esc(d.rectificationReason || tx('Contrôle initial'))}</td>
                  </tr>`).join('')}
                </tbody>
              </table>
            </div>
          </div>`;
        }

        let actionBlock = '';
        if (!latest) {
          if (blockingCount > 0) {
            actionBlock = `<div class="hx-close-blocked">
              <b>${tx('Contrôle bloqué : {n} anomalie(s) bloquante(s)', { n: blockingCount })}</b>
              <p>${tx('Complétez les fiches voyageurs ou clôturez les départs dépassés avant de sceller le contrôle interne.')}</p>
            </div>`;
          } else {
            actionBlock = `<div class="hx-close-actions">
              <button class="hx-btn atlas hx-close-finalize">${tx('Valider le contrôle du mois (Réservé Direction)')}</button>
            </div>`;
          }
        } else {
          actionBlock = `<div class="hx-close-actions between">
            <span class="hx-close-note">${tx('Contrôle interne scellé. Toute correction se fait par révision motivée.')}</span>
            <button class="hx-btn warn hx-close-rectify">${tx('Déposer une révision corrective…')}</button>
          </div>`;
        }

        container.innerHTML = `
          <div class="hx-close-bar">
            <div>
              <label>${tx('Mois contrôlé :')}</label>
              <input type="month" dir="ltr" data-hx-closing-month value="${month}">
            </div>
            <div>${statusBadge}</div>
          </div>
          ${summaryHtml}
          <div data-hx-closing-error></div>
          ${actionBlock}
          ${historyHtml}
        `;

        const monthInput = container.querySelector('[data-hx-closing-month]');
        monthInput?.addEventListener('change', (e) => load(e.target.value));

        const finalizeBtn = container.querySelector('.hx-close-finalize');
        finalizeBtn?.addEventListener('click', () => postReview('finalize', null, finalizeBtn));

        const rectifyBtn = container.querySelector('.hx-close-rectify');
        rectifyBtn?.addEventListener('click', () => {
          const reason = prompt(tx('Motif de la révision corrective (au moins 10 caractères) :'));
          if (!reason || reason.trim().length < 10) { toast(tx('Un motif d’au moins 10 caractères est obligatoire.'), { type: 'warn' }); return; }
          postReview('rectify', { rectificationReason: reason.trim() }, rectifyBtn);
        });

      } catch (err) {
        container.innerHTML = `<div class="hx-close-err">${tx('Erreur : {reason}', { reason: esc(err.message) })}</div>`;
      }
    }

    load(activeMonth);
  }

  /* — custom-hotel controls — */
  /* Le sélecteur « Vue » annonce lui-même ce qu'il contient — « Départs (1) ».
   * Tant qu'il fallait ensuite appuyer sur « Afficher », la liste restait sur
   * la vue précédente : le compteur promettait un départ et la page répondait
   * « Aucun dossier dans cette vue ». Lire les contrôles est donc séparé de la
   * décision de recharger. */
  function cuReadReceptionControls(root) {
    const date = root.querySelector('[data-hx-daily-date]');
    if (!date?.value || !date.checkValidity()) { date?.reportValidity(); return null; }
    const filter = cuReceptionSelection();
    const previousDate = filter.date;
    filter.date = date.value;
    const view = root.querySelector('[data-hx-daily-view]')?.value;
    filter.view = ['arrivals', 'departures', 'inhouse', 'attention'].includes(view) ? view : 'arrivals';
    filter.q = String(root.querySelector('[data-hx-daily-search]')?.value || '').slice(0, 100);
    return { dateChanged: previousDate !== filter.date };
  }
  handlers['hx-daily-apply'] = (el) => {
    const root = el.closest('.hx-daily');
    if (!root || !isCustomHotel()) return;
    if (!cuReadReceptionControls(root)) return;
    cuRefreshReception();
  };
  if (!cuReceptionControlsBound) {
    cuReceptionControlsBound = true;
    /* Délégué au document : `rerender()` remplace tout le corps du tiroir, donc
     * un écouteur posé sur le <select> lui-même ne survivrait pas au premier
     * rafraîchissement. La recherche texte garde « Afficher » — elle ne doit
     * pas se relancer à chaque frappe. */
    document.addEventListener('change', (event) => {
      const dispo = event.target?.closest?.('[data-hx-dispo-page-select]');
      if (dispo && cuStayView === 'availability' && !dispo.closest('.kiwi-modal')) {
        cuDispoCat = String(dispo.value || 'all');
        rerender();
        return;
      }
      const control = event.target?.closest?.('[data-hx-daily-view], [data-hx-daily-date]');
      if (!control || !isCustomHotel()) return;
      const root = control.closest('.hx-daily');
      if (!root) return;
      const read = cuReadReceptionControls(root);
      if (!read) return;
      // Changer de vue relit des dossiers déjà chargés ; changer de date
      // demande un aller-retour serveur.
      if (read.dateChanged) cuRefreshReception(); else rerender();
    });
  }
  handlers['hx-stay-checkin'] = (el, arg) => { if (isCustomHotel()) cuMoveStayStatus(String(arg || ''), 'checked_in', el); };
  handlers['hx-stay-checkout'] = (el, arg) => { if (isCustomHotel()) cuMoveStayStatus(String(arg || ''), 'completed', el); };
  /* Une arrivée enregistrée sur le mauvais dossier se défait : la chambre est
     rendue et le séjour repart de « confirmé ». Sans ce geste, la réception
     n'avait qu'une sortie — clôturer un séjour qui n'a jamais commencé, et le
     facturer en entier. */
  handlers['hx-stay-undo-checkin'] = (el, arg) => { if (isCustomHotel()) cuMoveStayStatus(String(arg || ''), 'confirmed', el); };
  /* Le no-show passait par un enregistrement complet du dossier — donc par le
     risque d'effacer un champ non renvoyé. Il ne touche plus que le statut. */
  handlers['hx-stay-noshow'] = (el, arg) => { if (isCustomHotel()) cuMoveStayStatus(String(arg || ''), 'no_show', el); };
  /* Un dossier clos dont la matière de facturation a cassé n'était plus
     réparable : chambres listées, aucun chemin de facturation, aucune action.
     La réouverture rend le bloc commercial modifiable, puis on reclôture. */
  handlers['hx-stay-reopen'] = (el, arg) => { if (isCustomHotel()) cuMoveStayStatus(String(arg || ''), 'checked_in', el, true); };
  handlers['hx-daily-refresh'] = () => { if (isCustomHotel()) cuRefreshReception(); };
  handlers['hx-monthly-closing'] = () => { if (isCustomHotel()) cuMonthlyClosingModal(); };
  handlers['hx-tape-prev'] = async () => {
    cuTapeOffset -= 14;
    const today = new (globalThis.KiwiZoneLaw?.DateTimeFormat || Intl.DateTimeFormat)('en-CA', { timeZone: 'Africa/Casablanca', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const add = (ymd, n) => { const d = new Date(ymd + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
    const start = add(today, cuTapeOffset);
    const end = add(start, 14);
    if (cuTapeOffset < -3 || cuTapeOffset + 14 > 14) {
      await cuFetchStaysForWindow(start, end);
    }
    rerender();
  };
  handlers['hx-tape-next'] = async () => {
    cuTapeOffset += 14;
    const today = new (globalThis.KiwiZoneLaw?.DateTimeFormat || Intl.DateTimeFormat)('en-CA', { timeZone: 'Africa/Casablanca', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const add = (ymd, n) => { const d = new Date(ymd + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
    const start = add(today, cuTapeOffset);
    const end = add(start, 14);
    if (cuTapeOffset < -3 || cuTapeOffset + 14 > 14) {
      await cuFetchStaysForWindow(start, end);
    }
    rerender();
  };
  handlers['hx-tape-today'] = () => { cuTapeOffset = 0; rerender(); };
  /* Ticket #0008 · monthly free/occupied grid per category. */
  const cuDispoHost = (el) => el?.closest('.kiwi-modal')?.querySelector('[data-hx-dispo-body]') || document.querySelector('[data-hx-dispo-page-body]');
  const cuDispoRefreshPage = async () => {
    rerender();
    const days = cuDispoMonthDays(cuDispoMonth);
    await cuFetchStaysForWindow(days[0], cuDispoAddDays(days[days.length - 1], 1));
    if (cuStayView === 'availability') rerender();
  };
  handlers['hx-dispo'] = () => {
    if (!isCustomHotel()) return;
    cuStayView = 'availability';
    const today = new (globalThis.KiwiZoneLaw?.DateTimeFormat || Intl.DateTimeFormat)('en-CA', { timeZone: 'Africa/Casablanca', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    cuDispoMonth = today.slice(0, 7); cuDispoCat = 'all';
    cuDispoRefreshPage();
  };
  handlers['hx-dispo-back'] = () => { cuStayView = 'tape'; rerender(); };
  handlers['hx-dispo-prev'] = (el) => {
    const host = cuDispoHost(el); cuDispoMonth = cuDispoAddMonth(cuDispoMonth, -1);
    if (host?.closest('.kiwi-modal')) cuDispoPaint(host, true); else cuDispoRefreshPage();
  };
  handlers['hx-dispo-next'] = (el) => {
    const host = cuDispoHost(el); cuDispoMonth = cuDispoAddMonth(cuDispoMonth, 1);
    if (host?.closest('.kiwi-modal')) cuDispoPaint(host, true); else cuDispoRefreshPage();
  };
  handlers['hx-dispo-today'] = (el) => {
    const host = cuDispoHost(el); if (!host) return;
    cuDispoMonth = new (globalThis.KiwiZoneLaw?.DateTimeFormat || Intl.DateTimeFormat)('en-CA', { timeZone: 'Africa/Casablanca', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()).slice(0, 7);
    if (host.closest('.kiwi-modal')) cuDispoPaint(host, false); else rerender();
  };
  handlers['hx-dispo-refresh'] = (el) => { const host = cuDispoHost(el); if (host?.closest('.kiwi-modal')) cuDispoPaint(host, true); else cuDispoRefreshPage(); };
  handlers['hx-stay-new'] = () => { if (isCustomHotel()) cuStayEditor(null); };
  handlers['hx-group-new'] = () => { if (isCustomHotel()) cuGroupReservationModal({ resume: false }); };
  handlers['hx-group-resume'] = () => { if (isCustomHotel()) cuGroupReservationModal({ resume: true }); };
    /* "Configurer ce tarif" beside a missing-rate warning: open the room-type
     * editor stacked above the stay editor. The stay form DOM is untouched,
     * so the reservation draft survives; when the type editor closes, the
     * modal tracker is restored and the stay quote recomputes in place. */
    handlers['hx-configure-rate'] = (el, arg) => {
      if (!isCustomHotel()) return;
      // typeIds themselves contain colons (type:t1): split from the right.
      const parts = String(arg || '').split(':');
      const kind = parts.pop(), board = parts.pop(), typeId = parts.join(':');
      const form = el.closest('[data-hx-stay-form]');
      if (!form || !typeId) return;
      const prevModal = openModal;
      cuTypeEditor(typeId);
      const root = openModal?.el;
      const focusSel = kind === 'room' ? '[data-hx-type-rate]' : (board ? `[data-hx-type-board-${board}]` : '');
      const target = (focusSel && root?.querySelector(focusSel)) || root?.querySelector('[data-hx-type-name]');
      // After the modal's own focus trap settles, land on the missing field.
      setTimeout(() => { try { target?.focus?.(); } catch (_) {} }, 60);
      if (openModal && openModal !== prevModal) {
        const typeNode = openModal.el, stayForm = form;
        const obs = new MutationObserver(() => {
          if (typeNode.isConnected) return;
          obs.disconnect();
          openModal = prevModal;
          // Gate the refresh on the server acknowledgment: the pending state
          // appears only if the push takes longer than a beat, and the new
          // total is never shown as ready before the rooms document is out.
          cuTariffSyncCycle(stayForm, 400);
        });
        obs.observe(document.body, { childList: true });
      }
    };
    handlers['hx-tariff-retry'] = (el) => { const form = el.closest('[data-hx-stay-form]'); if (form) cuTariffRetry(form); };
    handlers['hx-dossier'] = (el,arg) => { const booking=cuAllStays().get(String(arg));if(booking?.hotel)cuOpenDossier(booking); };
  handlers['hx-stay-edit'] = (el, arg) => {
    if (!isCustomHotel() || String(arg).startsWith('folio:')) return;
    const booking = cuAllStays().get(String(arg));
    if (booking?.hotel) cuStayEditor(booking);
  };
  handlers['hx-stay-cancel'] = (el, arg) => {
    const booking = cuAllStays().get(String(arg));
    if (!booking) return;

      openModal?.close?.();
      const m = K().modal({ tag: tx('ANNULATION'), title: tx('Libérer cette chambre ?'), desc: esc(booking.customer.name) + ' · ' + esc(cuDay(booking.hotel.checkIn) + hxTo() + cuDay(booking.hotel.checkOut)), width: 460,
        body: `<p style="font-size:13px;line-height:1.6;color:var(--n-600);">${tx('Le séjour restera dans l’historique avec le statut annulé. La chambre redeviendra immédiatement réservable en direct et sur la saisie OTA.')}</p><div class="hx-room-form-actions"><button class="hx-btn ghost" data-action="hx-stay-cancel-close">${tx('Garder le séjour')}</button><button class="hx-btn warn" data-action="hx-stay-cancel-confirm" data-arg="${esc(booking.id)}">${tx('Annuler et libérer')}</button></div>` });
      openModal = { el: m.el, close: m.close };
    };
    handlers['hx-stay-cancel-close'] = () => { openModal?.close?.(); openModal = null; };
    handlers['hx-stay-cancel-confirm'] = (el, arg) => cuCancelStay(String(arg), el, openModal);
    handlers['hx-room-add'] = () => {
      if (!isCustomHotel()) return;
      cuRoomBatchEditor();
    };
    handlers['hx-room-add-floor'] = (el, arg) => {
      if (!isCustomHotel()) return;
      cuRoomBatchEditor(String(arg || ''));
    };
    handlers['hx-room-edit'] = (el, arg) => {
      if (!isCustomHotel()) return;
      cuRoomEditor(parseInt(arg, 10));
    };
    handlers['hx-room-batch-save'] = (el) => {
      if (!isCustomHotel()) return;
      const root = el.closest('.kiwi-modal');
      const raw = String(root?.querySelector('[data-hx-room-numbers]')?.value || '').trim();
      const numbers = cuParseRoomNumbers(raw);
      const typeId = String(root?.querySelector('[data-hx-room-type-id]')?.value || '');
      const floorId = String(root?.querySelector('[data-hx-room-floor-id]')?.value || '');
      const st = cuState();
      const floor = st.floors[floorId];
      if (!numbers.length) {
        toast(tx('Ajoutez les numéros de chambres'), { type: 'warn', desc: tx('Exemple : 101-108, 110, 112.') });
        root?.querySelector('[data-hx-room-numbers]')?.focus();
        return;
      }
      if (!st.roomTypes[typeId]) {
        toast(tx('Choisissez un type de chambre'), { type: 'warn', desc: tx('Vous pouvez créer vos propres types et tarifs.') });
        return;
      }
      if (!floor) {
        toast(tx('Choisissez une section'), { type: 'warn', desc: tx('Créez vos étages et ailes depuis le plan.') });
        return;
      }
      const duplicates = numbers.filter((n) => st.rooms[n]);
      if (duplicates.length) {
        toast(tx('Certaines chambres existent déjà'), { type: 'warn', desc: tx('Retirez : {list}', { list: duplicates.slice(0, 8).join(', ') + (duplicates.length > 8 ? '…' : '') }) });
        return;
      }
      const now = cuStamp();
      numbers.forEach((n, i) => {
        st.rooms[n] = {
          id: 'room:' + now.toString(36) + ':' + n, n, typeId,
          typeName: st.roomTypes[typeId].name, floorId, floor: floor.name, rate: null,
          status: 'libre', hk: 'clean', guest: null, meta: txk('Libre · propre'),
          view: null, characteristics: [], connectingRoomIds: [],
          updatedAt: now + i,
        };
      });
      cuSave(st);
      cuUpdateFloorsManagerModal();
      cuRefreshFloorSelectors();
      openModal?.close?.();
      toast(tx(numbers.length === 1 ? '{n} chambre ajoutée' : '{n} chambres ajoutées', { n: numbers.length, c: txn(numbers.length, 'chambre') }), {
        type: 'success', desc: st.roomTypes[typeId].name + ' · ' + floor.name + ' · ' + (numbers.length > 1 ? tx('{a} à {b}', { a: numbers[0], b: numbers[numbers.length - 1] }) : numbers[0]),
      });
      cuRackFilter.floor = floor.name;
      cuRackFilter.status = 'all';
      cuRackFilter.q = '';
      rerender();
    };
    handlers['hx-room-save'] = (el, arg) => {
      if (!isCustomHotel()) return;
      const root = el.closest('.kiwi-modal');
      const oldN = parseInt(arg, 10);
      const n = parseInt(root?.querySelector('[data-hx-room-number]')?.value || '', 10);
      const typeId = String(root?.querySelector('[data-hx-room-type-id]')?.value || '');
      const floorId = String(root?.querySelector('[data-hx-room-floor-id]')?.value || '');
      const statusEl = root?.querySelector('[data-hx-room-status]');
      const status = statusEl ? statusEl.value : 'libre';
      const st = cuState();
      const prior = st.rooms[oldN];
      if (!Number.isFinite(n) || n < 1 || n > 9999) {
        toast(tx('Numéro de chambre invalide'), { type: 'warn', desc: tx('Utilisez un numéro entre 1 et 9999.') });
        root?.querySelector('[data-hx-room-number]')?.focus();
        return;
      }
      if (oldN !== n && st.rooms[n]) {
        toast(tx('Ce numéro existe déjà'), { type: 'warn', desc: tx('Choisissez un numéro de chambre unique.') });
        root?.querySelector('[data-hx-room-number]')?.focus();
        return;
      }
      if (!st.roomTypes[typeId]) {
        toast(tx('Choisissez un type de chambre'), { type: 'warn' });
        return;
      }
      if (!st.floors[floorId]) {
        toast(tx('Choisissez une section'), { type: 'warn' });
        return;
      }
      if (!prior) return;
      const viewVal = root?.querySelector('[data-hx-room-view]')?.value;
      const view = viewVal !== undefined ? (String(viewVal).trim() || null) : (prior?.view || null);
      const characteristics = typeof root?.querySelectorAll === 'function'
        ? Array.from(root.querySelectorAll('[data-hx-room-char]:checked') || []).map((cb) => cb.getAttribute?.('data-hx-room-char') || cb.dataset?.hxRoomChar).filter(Boolean)
        : (prior?.characteristics || []);
      const connSelect = root?.querySelector('[data-hx-room-connecting]');
      const connectingRoomIds = connSelect
        ? Array.from(connSelect.selectedOptions || []).map((o) => o.value).filter(Boolean)
        : (prior?.connectingRoomIds || []);
      // Same-floor rule holds even when the floor itself was just changed:
      // prior liaisons are grandfathered, new cross-floor picks are refused.
      const keptLinked = new Set((prior?.connectingRoomIds || []).map(String));
      const newFloorKey = cuFloorKey({ floorId, floor: st.floors[floorId]?.name });
      const badNew = connectingRoomIds.filter((id) => {
        if (keptLinked.has(String(id))) return false;
        const o = Object.values(st.rooms).find((r) => String(r.id) === String(id));
        return !!o && cuFloorKey(o) !== newFloorKey;
      });
      if (badNew.length) {
        toast(tx('Liaison impossible entre étages'), { type: 'warn', desc: tx('Seules les chambres du même étage peuvent être reliées. Retirez la sélection hors étage.') });
        return;
      }
      const liveKey = cuRoomStatus(prior).key;
      const active = liveKey === 'occ' || liveKey === 'arrivee';
      const savedStatus = active ? prior.status : (['libre', 'sale', 'hs'].includes(status) ? status : 'libre');
      const now = cuStamp();
      const room = {
        ...prior, n, typeId, typeName: st.roomTypes[typeId].name,
        floorId, floor: st.floors[floorId].name, rate: null, status: savedStatus,
        view, characteristics,
        hk: savedStatus === 'sale' ? 'dirty' : savedStatus === 'libre' ? 'clean' : (prior?.hk || 'clean'),
        guest: prior?.guest || null,
        meta: active ? prior.meta : savedStatus === 'libre' ? txk('Libre · propre') : savedStatus === 'sale' ? txk('À remettre à blanc') : txk('Hors-service'),
        updatedAt: now,
      };
      if (oldN !== n) {
        delete st.rooms[oldN];
        if (st.folios[oldN]) {
          st.folios[n] = { ...st.folios[oldN], room: n, updatedAt: now };
          delete st.folios[oldN];
        }
      }
      st.rooms[n] = room;
      cuSetConnectingRooms(st, room, connectingRoomIds);
      cuSave(st);
      cuUpdateFloorsManagerModal();
      cuRefreshFloorSelectors();
      openModal?.close?.();
      toast(tx('Chambre {n} enregistrée', { n }), { type: 'success', desc: st.roomTypes[typeId].name + ' · ' + st.floors[floorId].name });
      rerender();
    };
    handlers['hx-room-types'] = () => { if (isCustomHotel()) cuTypesManager(); };
    handlers['hx-floors'] = () => { if (isCustomHotel()) cuFloorsManager(); };
    handlers['hx-floor-new'] = () => { if (isCustomHotel()) cuFloorEditor(null); };
    handlers['hx-floor-edit'] = (el, arg) => { if (isCustomHotel()) cuFloorEditor(String(arg || '')); };
    handlers['hx-floor-save'] = async (el, arg) => {
      if (!isCustomHotel() || cuFloorSaving) return;
      const root = el.closest('.kiwi-modal');
      const name = String(root?.querySelector('[data-hx-floor-name]')?.value || '').trim().slice(0, 60);
      const errEl = root?.querySelector('[data-hx-floor-error]');
      const fail = (message) => {
        if (errEl) { errEl.textContent = message; errEl.hidden = false; }
        toast(message, { type: 'error' });
      };
      if (!name) { fail(trL({fr:'Donnez un nom à cette section.',en:'Enter a section name.',ar:'أدخل اسم القسم.'})); return; }
      const scope = cuStateId();
      const st = cuHydrate(cuDocument(cuState()));
      const duplicate = Object.values(st.floors).find((f) => f.name.toLocaleLowerCase('fr') === name.toLocaleLowerCase('fr') && f.id !== arg);
      if (duplicate) { fail(trL({fr:'Cette section existe déjà.',en:'This section already exists.',ar:'هذا القسم موجود بالفعل.'})); return; }
      cuFloorSaving = true;
      el.disabled = true;
      try {
        const now = cuStamp();
        // Keep the same identity on retries, including an uncertain network reply.
        const id = arg === 'new' ? (el.__floorIntentId || (el.__floorIntentId = cuFloorId(name, now))) : String(arg);
        const order = arg === 'new' ? cuFloorRows().length : (st.floors[id]?.order || 0);
        st.floors[id] = { ...(st.floors[id] || {}), id, name, order, updatedAt: now };
        Object.values(st.rooms).filter((r) => r.floorId === id).forEach((r) => { r.floor = name; r.updatedAt = now; });
        await cuCommitDraft(st);
        if (scope !== cuStateId()) return;
        cuRackFilter.floor = 'all';
        cuUpdateFloorsManagerModal();
        cuRefreshFloorSelectors();
        openModal?.close?.();
        toast(tx('Section « {name} » enregistrée', { name }), {type:'success', desc:trL({fr:'Enregistrement serveur confirmé.',en:'Server save confirmed.',ar:'تم تأكيد الحفظ بالخادم.'})});
        rerender();
      } catch (error) { if (scope === cuStateId()) fail(error.message); }
      finally { el.disabled = false; cuFloorSaving = false; }
    };
    handlers['hx-floor-move'] = (el, arg) => {
      if (!isCustomHotel()) return;
      const value = String(arg || '');
      const cut = value.lastIndexOf(':');
      const id = value.slice(0, cut);
      const rawDelta = value.slice(cut + 1);
      const delta = parseInt(rawDelta, 10);
      const st = cuState();
      const list = cuFloorRows();
      const index = list.findIndex((f) => f.id === id);
      const target = index + delta;
      if (index < 0 || target < 0 || target >= list.length) return;
      const now = cuStamp();
      const a = list[index], b = list[target], old = a.order;
      a.order = b.order; b.order = old; a.updatedAt = now; b.updatedAt = now + 1;
      cuSave(st);
      cuUpdateFloorsManagerModal();
      cuRefreshFloorSelectors();
      rerender();
    };
    handlers['hx-floor-delete'] = (el, arg) => {
      if (!isCustomHotel()) return;
      const root = el.closest('.kiwi-modal');
      const st = cuState();
      const floor = st.floors[arg];
      if (!floor) return;
      const rooms = Object.values(st.rooms).filter((r) => r.floorId === arg);
      const targetId = String(root?.querySelector('[data-hx-floor-target]')?.value || '');
      if (rooms.length && !st.floors[targetId]) {
        toast(tx('Créez une autre section avant de supprimer celle-ci'), { type: 'warn', desc: tx('Aucune chambre ne sera supprimée automatiquement.') });
        return;
      }
      const now = cuStamp();
      if (rooms.length) rooms.forEach((r, index) => { r.floorId = targetId; r.floor = st.floors[targetId].name; r.updatedAt = now + index; });
      const tombstone = { ...floor, updatedAt: now, deletedAt: now };
      const records = st.floorRecords || (st.floorRecords = []);
      const i = records.findIndex((f) => f && f.id === arg);
      if (i >= 0) records[i] = tombstone; else records.push(tombstone);
      delete st.floors[arg];
      cuRackFilter.floor = 'all';
      cuSave(st);
      cuUpdateFloorsManagerModal();
      cuRefreshFloorSelectors();
      openModal?.close?.();
      toast(tx('Section supprimée'), { type: 'success', desc: rooms.length ? tx(rooms.length === 1 ? '{n} chambre déplacée vers « {name} ».' : '{n} chambres déplacées vers « {name} ».', { n: rooms.length, c: txn(rooms.length, 'chambre'), name: st.floors[targetId].name }) : tx('La section était vide.') });
      rerender();
    };
    handlers['hx-room-type-new'] = () => { if (isCustomHotel()) cuTypeEditor(null); };
    handlers['hx-room-type-edit'] = (el, arg) => { if (isCustomHotel()) cuTypeEditor(String(arg || '')); };
    handlers['hx-type-photo-pick'] = (el) => el.closest('.kiwi-modal')?.querySelector('[data-hx-type-photo-input]')?.click();
    handlers['hx-type-photo-remove'] = (el, arg) => {
      const root = el.closest('.kiwi-modal'), index = +arg;
      if (!root || !Number.isInteger(index) || !root.__hxPhotos?.[index]) return;
      root.__hxPhotos.splice(index, 1); cuRenderPhotoEditor(root);
    };
    handlers['hx-type-photo-move'] = (el, arg) => {
      const root = el.closest('.kiwi-modal'), [from, delta] = String(arg || '').split(':').map(Number), to = from + delta;
      if (!root || !root.__hxPhotos?.[from] || !root.__hxPhotos?.[to]) return;
      const photo = root.__hxPhotos.splice(from, 1)[0]; root.__hxPhotos.splice(to, 0, photo); cuRenderPhotoEditor(root);
    };
    handlers['hx-room-type-save'] = (el, arg) => {
      if (!isCustomHotel()) return;
      const root = el.closest('.kiwi-modal');
      const priorType = cuState().roomTypes[String(arg)] || {};
      const name = String(root?.querySelector('[data-hx-type-name]')?.value || '').trim();
      const rateRaw = String(root?.querySelector('[data-hx-type-rate]')?.value || '').trim();
      const descriptionEl = root?.querySelector('[data-hx-type-description]');
      const guestsEl = root?.querySelector('[data-hx-type-guests]');
      const bedsEl = root?.querySelector('[data-hx-type-beds]');
      const sizeEl = root?.querySelector('[data-hx-type-size]');
      const viewEl = root?.querySelector('[data-hx-type-view]');
      const amenitiesEl = root?.querySelector('[data-hx-type-amenities]');
      const publicEl = root?.querySelector('[data-hx-type-public]');
      const description = String(descriptionEl ? descriptionEl.value : (priorType.description || '')).trim();
      const guestsRaw = String(guestsEl ? guestsEl.value : (priorType.maxGuests || 2)).trim();
      const beds = String(bedsEl ? bedsEl.value : (priorType.beds || '')).trim();
      const sizeRaw = String(sizeEl ? sizeEl.value : (priorType.sizeM2 || '')).trim();
      const view = String(viewEl ? viewEl.value : (priorType.view || '')).trim();
      const amenities = String(amenitiesEl ? amenitiesEl.value : (priorType.amenities || []).join(',')).split(',')
        .map((v) => v.trim().slice(0, 40)).filter(Boolean).slice(0, 12);
      const isPublic = publicEl ? !!publicEl.checked : priorType.public !== false;
      const photos = (root?.__hxPhotos || priorType.photos || []).slice(0, 8).map((p, i) => cuSafePhoto(p, i, name || priorType.name || 'Chambre')).filter(Boolean);
      const st = cuState();
      if (!name) {
        toast(tx('Donnez un nom à ce type'), { type: 'warn', desc: 'Ex. Chambre Deluxe, Suite Atlas, Twin Patio.' });
        root?.querySelector('[data-hx-type-name]')?.focus();
        return;
      }
      if (rateRaw && (!Number.isFinite(+rateRaw) || +rateRaw < 0)) {
        toast(tx('Tarif invalide'), { type: 'warn' });
        root?.querySelector('[data-hx-type-rate]')?.focus();
        return;
      }
      const boardRates = {};
      let boardRateBad = null;
      for (const key of ['bb', 'hb_lunch', 'hb_dinner', 'full_board']) {
        const raw = String(root?.querySelector(`[data-hx-type-board-${key}]`)?.value ?? '').trim();
        if (!raw) { boardRates[key] = null; continue; }
        if (!Number.isFinite(+raw) || +raw < 0 || +raw > 100000) { boardRateBad = key; break; }
        boardRates[key] = Math.round(+raw * 100) / 100;
      }
      if (boardRateBad) {
        toast(tx('Supplément repas invalide'), { type: 'warn', desc: tx('Montant MAD par personne et par nuit, zéro ou plus.') });
        root?.querySelector(`[data-hx-type-board-${boardRateBad}]`)?.focus();
        return;
      }
      if (!Number.isFinite(+guestsRaw) || +guestsRaw < 1 || +guestsRaw > 12) {
        toast(tx('Capacité invalide'), { type: 'warn', desc: 'Indiquez entre 1 et 12 voyageurs.' });
        root?.querySelector('[data-hx-type-guests]')?.focus();
        return;
      }
      if (sizeRaw && (!Number.isFinite(+sizeRaw) || +sizeRaw < 1 || +sizeRaw > 999)) {
        toast('Surface invalide', { type: 'warn' });
        root?.querySelector('[data-hx-type-size]')?.focus();
        return;
      }
      const duplicate = Object.values(st.roomTypes).find((t) => t.name.toLocaleLowerCase('fr') === name.toLocaleLowerCase('fr') && t.id !== arg);
      if (duplicate) {
        toast(tx('Ce type existe déjà'), { type: 'warn', desc: tx('Modifiez « {name} » directement.', { name: duplicate.name }) });
        return;
      }
      const now = cuStamp();
      const id = arg === 'new' ? cuTypeId(name, now) : String(arg);
      st.roomTypes[id] = {
        ...(st.roomTypes[id] || {}), id, name: name.slice(0, 60),
        rate: rateRaw === '' ? null : Math.round(+rateRaw),
        boardRates: Object.values(boardRates).some((v) => v != null) ? boardRates : undefined,
        description: description.slice(0, 300), maxGuests: Math.round(+guestsRaw),
        beds: beds.slice(0, 80), sizeM2: sizeRaw === '' ? null : Math.round(+sizeRaw),
        view: view.slice(0, 80), amenities, photos, public: isPublic, updatedAt: now,
      };
      Object.values(st.rooms).filter((r) => r.typeId === id).forEach((r) => { r.typeName = name.slice(0, 60); r.updatedAt = now; });
      cuSave(st);
      openModal?.close?.();
      toast(tx('Type « {name} » enregistré', { name }), { type: 'success', desc: rateRaw === '' ? tx('Tarif général utilisé.') : tx('{amount} MAD par nuit.', { amount: fmt(+rateRaw) }) });
      rerender();
    };
    handlers['hx-room-type-delete'] = (el, arg) => {
      if (!isCustomHotel()) return;
      const st = cuState();
      const type = st.roomTypes[arg];
      if (!type) return;
      const used = Object.values(st.rooms).filter((r) => r.typeId === arg).length;
      if (used) {
        toast(tx(used === 1 ? 'Type utilisé par {n} chambre' : 'Type utilisé par {n} chambres', { n: used, c: txn(used, 'chambre') }), { type: 'warn', desc: tx('Changez d’abord le type de ces chambres.') });
        return;
      }
      const tombstone = { ...type, updatedAt: cuStamp(), deletedAt: cuStamp() };
      const records = st.typeRecords || (st.typeRecords = []);
      const i = records.findIndex((t) => t && t.id === arg);
      if (i >= 0) records[i] = tombstone; else records.push(tombstone);
      delete st.roomTypes[arg];
      cuSave(st);
      openModal?.close?.();
      toast(tx('Type supprimé'), { type: 'success' });
      rerender();
    };
    handlers['hx-room-filters-open'] = () => { if (isCustomHotel()) cuFiltersModal(); };
    handlers['hx-filter-modal-apply'] = (el) => {
      const root = el.closest('.kiwi-modal');
      if (!root) return;
      cuRackFilter.floors.clear();
      if (typeof root.querySelectorAll === 'function') {
        root.querySelectorAll('[data-hx-filter-floor]:checked').forEach((cb) => {
          cuRackFilter.floors.add(cb.getAttribute('data-hx-filter-floor'));
        });
      }
      if (cuRackFilter.floors.size > 0) cuRackFilter.floor = 'all';

      cuRackFilter.categories.clear();
      if (typeof root.querySelectorAll === 'function') {
        root.querySelectorAll('[data-hx-filter-cat]:checked').forEach((cb) => {
          cuRackFilter.categories.add(cb.getAttribute('data-hx-filter-cat'));
        });
      }

      const hasViewCb = root.querySelector('[data-hx-filter-hasview]');
      cuRackFilter.hasView = Boolean(hasViewCb && hasViewCb.checked);
      cuRackFilter.views.clear();
      if (typeof root.querySelectorAll === 'function') {
        root.querySelectorAll('[data-hx-filter-view]:checked').forEach((cb) => {
          cuRackFilter.views.add(cb.getAttribute('data-hx-filter-view'));
        });
      }

      cuRackFilter.characteristics.clear();
      if (typeof root.querySelectorAll === 'function') {
        root.querySelectorAll('[data-hx-filter-char]:checked').forEach((cb) => {
          cuRackFilter.characteristics.add(cb.getAttribute('data-hx-filter-char'));
        });
      }

      const connCb = root.querySelector('[data-hx-filter-connecting]');
      cuRackFilter.connectingOnly = Boolean(connCb && connCb.checked);
      cuRackFilter.minCapacity = Math.max(0, Math.min(12, parseInt(root.querySelector('[data-hx-filter-capacity]')?.value, 10) || 0));

      openModal?.close?.();
      rerender();
    };
    handlers['hx-filter-modal-reset'] = () => {
      cuResetRackFilter();
      openModal?.close?.();
      rerender();
    };
    handlers['hx-filter-remove'] = (el, arg) => {
      const parts = String(arg || '').split(':');
      const type = parts[0];
      const val = parts.slice(1).join(':');
      if (type === 'floor') cuRackFilter.floor = 'all';
      else if (type === 'floors') cuRackFilter.floors.delete(val);
      else if (type === 'categories') cuRackFilter.categories.delete(val);
      else if (type === 'status') cuRackFilter.status = 'all';
      else if (type === 'hasView') cuRackFilter.hasView = false;
      else if (type === 'views') cuRackFilter.views.delete(val);
      else if (type === 'characteristics') cuRackFilter.characteristics.delete(val);
      else if (type === 'connectingOnly') cuRackFilter.connectingOnly = false;
      else if (type === 'minCapacity') cuRackFilter.minCapacity = 0;
      else if (type === 'q') cuRackFilter.q = '';
      rerender();
    };
    handlers['hx-room-floor'] = (el, arg) => {
      const val = String(arg || 'all');
      cuRackFilter.floor = val;
      cuRackFilter.floors.clear();
      rerender();
    };
    handlers['hx-room-status'] = (el, arg) => {
      cuRackFilter.status = String(arg || 'all');
      rerender();
    };
    handlers['hx-room-search'] = (el) => {
      cuRackFilter.q = String(el.closest('.hx-room-search')?.querySelector('[data-hx-room-search]')?.value || '').trim();
      rerender();
    };
    handlers['hx-room-filter-reset'] = () => {
      cuResetRackFilter();
      rerender();
    };
    if (!window.__kiwiHotelRoomSearchWired) {
      window.__kiwiHotelRoomSearchWired = true;
      document.addEventListener('keydown', (event) => {
        if (!['Enter', ' ', 'Spacebar'].includes(event.key) || !event.target?.matches?.('[data-hx-room-card]')) return;
        // The shared shell has legacy keyboard routers. Handle this composite
        // card once, without routing a key from its nested native controls.
        event.preventDefault();
        event.stopImmediatePropagation();
        event.target.click();
      }, true);
      document.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' || !event.target?.matches?.('[data-hx-room-search]')) return;
        event.preventDefault();
        handlers['hx-room-search'](event.target);
      });
    }
    handlers['hx-room-select-toggle'] = () => {
      cuSelectionMode = !cuSelectionMode;
      if (!cuSelectionMode) cuSelectedRooms.clear();
      rerender();
    };
    handlers['hx-room-check'] = (el, arg) => {
      const n = parseInt(arg, 10);
      const id = R()[n]?.id;
      if (!id) return;
      if (el.checked) cuSelectedRooms.add(String(id));
      else cuSelectedRooms.delete(String(id));
      rerender();
    };
    handlers['hx-room-select-filtered'] = () => {
      Object.values(R()).forEach((r) => {
        if (cuRoomMatchesFilter(r)) cuSelectedRooms.add(String(r.id));
      });
      cuSelectionMode = true;
      rerender();
    };
    handlers['hx-room-select-none'] = () => {
      cuSelectedRooms.clear();
      rerender();
    };
    handlers['hx-room-select-cancel'] = () => {
      cuSelectedRooms.clear();
      cuSelectionMode = false;
      rerender();
    };
    handlers['hx-room-bulk-edit-open'] = () => {
      if (!isCustomHotel()) return;
      if (cuPendingBulk()) { handlers['hx-bulk-resume'](); return; }
      cuBulkEditModal();
    };
    handlers['hx-bulk-resume'] = () => {
      const plan = cuPendingBulk();
      if (!plan) return;
      cuBulkPlan = plan;
      cuBulkStaged = plan.changes;
      cuSelectionMode = true;
      cuSelectedRooms.clear();
      plan.targets.forEach((target) => cuSelectedRooms.add(String(target.id)));
      openModal?.close?.();
      cuBulkReviewModal(plan);
    };
    handlers['hx-bulk-cancel'] = () => {
      openModal?.close?.();
      cuBulkStaged = null;
    };
    handlers['hx-bulk-review'] = (el) => {
      const root = el.closest('.kiwi-modal');
      if (!root) return;
      const floorId = String(root.querySelector('[data-hx-bulk-floor-id]')?.value || '');
      const typeId = String(root.querySelector('[data-hx-bulk-type-id]')?.value || '');
      const viewVal = String(root.querySelector('[data-hx-bulk-view]')?.value || '');
      const charMode = String(root.querySelector('[data-hx-bulk-char-mode]')?.value || 'none');
      const checkedChars = typeof root.querySelectorAll === 'function'
        ? Array.from(root.querySelectorAll('[data-hx-bulk-char]:checked') || []).map((cb) => cb.getAttribute?.('data-hx-bulk-char') || cb.dataset?.hxBulkChar).filter(Boolean)
        : [];

      const hasChange = Boolean(floorId || typeId || viewVal || (charMode !== 'none'));
      if (!hasChange) {
        toast(trL({ fr: 'Aucune modification choisie', en: 'No changes selected', ar: 'لم يتم اختيار أي تعديل' }), {
          type: 'warn',
          desc: trL({ fr: 'Choisissez au moins un paramètre à modifier.', en: 'Select at least one parameter to change.', ar: 'اختر معياراً واحداً على الأقل للتعديل.' }),
        });
        return;
      }

      cuBulkStaged = {
        floorId: floorId || null,
        typeId: typeId || null,
        view: viewVal === '__CLEAR__' ? '' : (viewVal || null),
        charMode,
        characteristics: checkedChars,
      };

      const st = cuState();
      const venueId = cuVenueId();
      const merchant = cuMerchantSlug();
      const operationId = 'bulk_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
      const targets = [];
      for (const r of cuSelectedRows()) {
        if (r && !r.deletedAt) {
          targets.push({
            id: String(r.id),
            n: r.n,
            expectedUpdatedAt: +r.updatedAt || 0,
            before: {
              floorId: r.floorId,
              floor: r.floor,
              typeId: r.typeId,
              typeName: r.typeName,
              view: r.view || null,
              characteristics: Array.isArray(r.characteristics) ? [...r.characteristics] : [],
            },
          });
        }
      }
      if (!targets.length) {
        toast(trL({ fr: 'Aucune chambre valide sélectionnée', en: 'No valid rooms selected', ar: 'لم يتم تحديد أي غرف صالحة' }), { type: 'warn' });
        return;
      }
      targets.sort((a, b) => a.n - b.n);

      cuBulkPlan = {
        operationId,
        venueId,
        stateId: cuStateId(),
        merchant,
        baseRev: st.rev != null ? st.rev : 0,
        createdAt: cuStamp(),
        changes: { ...cuBulkStaged },
        targets,
      };

      openModal?.close?.();
      cuBulkReviewModal(cuBulkPlan);
    };
    handlers['hx-bulk-back'] = () => {
      if (cuBulkPlan?.submitted) return;
      openModal?.close?.();
      cuBulkEditModal(cuBulkStaged);
    };
    handlers['hx-bulk-confirm'] = async (el) => {
      const plan = cuBulkPlan;
      if (!isCustomHotel() || !plan || !plan.targets?.length || cuBulkSaving || plan.needsReview) return;
      if (plan.venueId !== cuVenueId() || plan.merchant !== cuMerchantSlug()) {
        toast(trL({fr:'Établissement changé · vérifiez à nouveau la sélection',en:'Property changed · review the selection again',ar:'تغيرت المنشأة · راجع التحديد مجدداً'}), { type: 'warn' });
        return;
      }
      cuBulkSaving = true;
      if (el) el.disabled = true;
      const stateId = plan.stateId || cuStateId();
      const draftKey = 'kiwi:hotel-bulk-draft:v1:' + stateId;
      try {
        // Preserve the intent, not an unconfirmed mutation of the room register.
        plan.submitted = true;
        localStorage.setItem(draftKey, JSON.stringify(plan));
        const back = openModal?.el?.querySelector('[data-action="hx-bulk-back"]');
        if (back) back.disabled = true;
        if (typeof fetch !== 'function') throw new Error('Connexion serveur indisponible');
        const controller = typeof AbortController === 'function' ? new AbortController() : null;
        const timer = controller ? setTimeout(() => controller.abort(), 20000) : null;
        let response, result;
        try {
          response = await fetch('/api/hotel/rooms-bulk', {
            method: 'POST', credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            ...(controller ? { signal: controller.signal } : {}),
            body: JSON.stringify({
              merchant: plan.merchant, operationId: plan.operationId,
              targets: plan.targets.map(({id,n,expectedUpdatedAt}) => ({id,n,expectedUpdatedAt})),
              changes: plan.changes,
            }),
          });
          result = await response.json();
        } finally { if (timer) clearTimeout(timer); }
        if (!response.ok || !result?.ok || !result.data) {
          const conflict = response.status === 409;
          // A rejected stale revision is safe to review afresh. Unknown outcomes
          // retain the original operation ID and can only be retried.
          if (conflict && result?.error !== 'operation-conflict') {
            plan.submitted = false;
            plan.needsReview = true;
            localStorage.setItem(draftKey, JSON.stringify(plan));
            const back = openModal?.el?.querySelector('[data-action="hx-bulk-back"]');
            if (back) back.disabled = false;
            if (hotelCloud?.pull) Promise.resolve(hotelCloud.pull(true)).catch(() => {});
          }
          throw new Error(conflict
            ? trL({fr:'Conflit serveur · actualisez les chambres et vérifiez à nouveau les modifications.',en:'Server conflict · refresh rooms and review the changes again.',ar:'تعارض بالخادم · حدّث الغرف وراجع التعديلات.'})
            : response.status === 401 || response.status === 403
              ? trL({fr:'Session expirée ou droits insuffisants.',en:'Session expired or insufficient permissions.',ar:'انتهت الجلسة أو الصلاحيات غير كافية.'})
              : trL({fr:'Enregistrement non confirmé · réessayez sans recréer cette opération.',en:'Save not confirmed · retry this operation without recreating it.',ar:'لم يتم تأكيد الحفظ · أعد محاولة العملية نفسها.'}));
        }
        // The reply belongs to its original property even if navigation changed.
        const acknowledged = cuHydrate(result.data);
        CUSTOM_HX[stateId] = acknowledged;
        const cached = cuWriteLocal(acknowledged, stateId);
        if (cached) localStorage.removeItem(draftKey);
        if (stateId !== cuStateId() || plan.merchant !== cuMerchantSlug()) return;
        if (hotelCloud?.pull) hotelCloud.pull(true);
        cuSelectedRooms.clear();
        cuSelectionMode = false;
        cuBulkStaged = null;
        cuBulkPlan = null;
        openModal?.close?.();
        cuUpdateFloorsManagerModal();
        cuRefreshFloorSelectors();
        toast(plan.targets.length + ' ' + trL({fr:'chambres mises à jour',en:'rooms updated',ar:'غرف تم تحديثها'}), {
          type: cached ? 'success' : 'warn',
          desc: cached
            ? trL({fr:'Modification confirmée par le serveur.',en:'Change confirmed by the server.',ar:'تم تأكيد التغيير من الخادم.'})
            : trL({fr:'Confirmé sur le serveur · cache local indisponible, gardez cette page ouverte.',en:'Saved on server · local cache unavailable; keep this page open.',ar:'حُفظ بالخادم · التخزين المحلي غير متاح؛ أبقِ الصفحة مفتوحة.'}),
        });
        rerender();
      } catch (error) {
        if (plan.venueId === cuVenueId()) {
          const message = trL({fr:'Enregistrement non confirmé',en:'Save not confirmed',ar:'لم يتم تأكيد الحفظ'});
          const detail = error?.message || String(error);
          const node = openModal?.el?.querySelector('[data-hx-bulk-error]');
          if (node) { node.hidden = false; node.textContent = detail; }
          toast(message, { type: 'error', desc: detail });
        }
      } finally {
        if (el) el.disabled = !!plan.needsReview;
        cuBulkSaving = false;
      }
    };
    handlers['hx-views-manage-open'] = () => { if (isCustomHotel()) cuViewsAndCharsManager(); };
    handlers['hx-views-manage-close'] = () => { openModal?.close?.(); };
    const saveRoomConfig = async (el, mutate, message) => {
      if (!isCustomHotel() || el?.disabled) return;
      const scope = cuStateId();
      const st = cuHydrate(cuDocument(cuState()));
      if (el) el.disabled = true;
      try {
        mutate(st);
        st.configUpdatedAt = cuStamp();
        await cuCommitDraft(st);
        if (scope !== cuStateId()) return;
        toast(message, { type: 'success' });
        openModal?.close?.();
        cuViewsAndCharsManager();
        rerender();
      } catch (error) {
        if (scope === cuStateId()) toast(error.message, { type:'error' });
      } finally { if (el) el.disabled = false; }
    };
    handlers['hx-view-add'] = async (el) => {
      const raw = String(el.closest('.kiwi-modal')?.querySelector('[data-hx-view-input]')?.value || '').trim().slice(0, 40);
      return saveRoomConfig(el, (st) => {
        if (!raw) throw new Error(trL({fr:'Indiquez un nom de vue',en:'Enter a view name',ar:'أدخل اسم الإطلالة'}));
        st.views = Array.isArray(st.views) ? st.views.slice() : DEFAULT_VIEWS.slice();
        if (st.views.some((v) => v.toLocaleLowerCase('fr') === raw.toLocaleLowerCase('fr'))) throw new Error(trL({fr:'Cette vue existe déjà',en:'This view already exists',ar:'هذه الإطلالة موجودة بالفعل'}));
        if (st.views.length >= 50) throw new Error(trL({fr:'Limite de 50 vues atteinte.',en:'Maximum of 50 views reached.',ar:'تم بلوغ الحد الأقصى البالغ 50 إطلالة.'}));
        st.views.push(raw);
      }, trL({fr:'Vue ajoutée',en:'View added',ar:'تمت إضافة الإطلالة'}));
    };
    handlers['hx-view-remove'] = async (el, arg) => saveRoomConfig(el, (st) => {
      const value = String(arg || '');
      if (Object.values(st.rooms).some((r) => r.view === value)) throw new Error(trL({fr:'Vue utilisée par des chambres. Modifiez ces chambres avant de la retirer.',en:'This view is used by rooms. Update those rooms before removing it.',ar:'تستخدم غرف هذه الإطلالة. عدّل الغرف قبل حذفها.'}));
      st.views = (st.views || []).filter((v) => v !== value);
    }, trL({fr:'Vue retirée',en:'View removed',ar:'تم حذف الإطلالة'}));
    handlers['hx-char-add'] = async (el) => {
      const raw = String(el.closest('.kiwi-modal')?.querySelector('[data-hx-char-input]')?.value || '').trim().slice(0, 50);
      return saveRoomConfig(el, (st) => {
        if (!raw) throw new Error(trL({fr:'Indiquez un nom d’équipement',en:'Enter an amenity name',ar:'أدخل اسم الميزة'}));
        if (cuAllCharacteristics().some((c) => cuCharLabel(c).toLocaleLowerCase('fr') === raw.toLocaleLowerCase('fr'))) throw new Error(trL({fr:'Cet équipement existe déjà',en:'This amenity already exists',ar:'هذه الميزة موجودة بالفعل'}));
        if ((st.customCharacteristics || []).length >= 50) throw new Error(trL({fr:'Limite de 50 équipements personnalisés atteinte.',en:'Maximum of 50 custom amenities reached.',ar:'تم بلوغ الحد الأقصى البالغ 50 ميزة مخصصة.'}));
        const id = el.__charIntentId || (el.__charIntentId = 'custom_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6));
        st.customCharacteristics = [...(st.customCharacteristics || []), {id, label:raw, labels:{fr:raw,en:raw,ar:raw}}];
      }, trL({fr:'Équipement ajouté',en:'Amenity added',ar:'تمت إضافة الميزة'}));
    };
    handlers['hx-char-remove'] = async (el, arg) => saveRoomConfig(el, (st) => {
      const id = String(arg || '');
      if (Object.values(st.rooms).some((r) => (r.characteristics || []).includes(id))) throw new Error(trL({fr:'Équipement utilisé par des chambres. Modifiez ces chambres avant de le retirer.',en:'This amenity is used by rooms. Update those rooms before removing it.',ar:'تستخدم غرف هذه الميزة. عدّل الغرف قبل حذفها.'}));
      st.customCharacteristics = (st.customCharacteristics || []).filter((c) => c.id !== id);
    }, trL({fr:'Équipement retiré',en:'Amenity removed',ar:'تم حذف الميزة'}));
    handlers['hx-room-delete-open'] = (el, arg) => {
      if (!isCustomHotel()) return;
      const n = parseInt(arg, 10);
      const st = cuState();
      const room = st.rooms[n];
      if (!room) return;
      if (st.folios[n] || ['occ', 'depart', 'arrivee'].includes(room.status)) {
        toast(tx('Suppression impossible'), { type: 'warn', desc: tx('Clôturez d’abord le séjour et le folio de cette chambre.') });
        return;
      }
      openModal?.close?.();
      const m = K().modal({
        tag: tx('SUPPRIMER UNE CHAMBRE'), title: tx('Supprimer la chambre {n} ?', { n }),
        desc: tx('Elle disparaîtra du plan, des disponibilités et du ménage.'), width: 440,
        body: `<p style="font-size:13px;line-height:1.55;color:var(--n-600);margin:0;">${tx('Cette action supprime {room}. Les ventes historiques restent intactes.', { room: `<b>${tx('Ch. {n}', { n })} · ${esc(room.typeName)}</b>` })}</p>
          <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:20px;"><button class="hx-btn warn" data-action="hx-room-delete" data-arg="${n}">${tx('Confirmer la suppression')}</button></div>`,
      });
      openModal = { el: m.el, close: m.close };
    };
    handlers['hx-room-delete'] = (el, arg) => {
      if (!isCustomHotel()) return;
      const n = parseInt(arg, 10);
      const st = cuState();
      const room = st.rooms[n];
      if (!room || st.folios[n]) return;
      const roomId = room.id;
      const now = cuStamp();
      Object.values(st.rooms).forEach((r) => {
        if (Array.isArray(r.connectingRoomIds) && r.connectingRoomIds.includes(roomId)) {
          r.connectingRoomIds = r.connectingRoomIds.filter((id) => id !== roomId);
          r.connectingMeta = { ...(r.connectingMeta || {}) };
          r.connectingMeta[roomId] = { at: now, linked: false };
          r.updatedAt = now;
        }
      });
      const tombstone = { ...room, updatedAt: now, deletedAt: now };
      const records = st.roomRecords || (st.roomRecords = []);
      const i = records.findIndex((r) => r && r.id === room.id);
      if (i >= 0) records[i] = tombstone; else records.push(tombstone);
      delete st.rooms[n];
      cuSelectedRooms.delete(String(room.id));
      cuSave(st);
      cuUpdateFloorsManagerModal();
      cuRefreshFloorSelectors();
      openModal?.close?.();
      toast(tx('Chambre {n} supprimée', { n }), { type: 'success', desc: tx('Le plan et les disponibilités ont été mis à jour.') });
      rerender();
    };
    handlers['hx-cb-rate-step'] = (el, arg) => {
      if (!isCustomHotel()) return;
      const st = cuState();
      st.baseRate = Math.max(150, (st.baseRate || 0) + parseInt(arg, 10));
      st.rateUpdatedAt = cuStamp();
      cuSave(st);
      rerender();
    };
    handlers['hx-cb-connect'] = (el, arg) => {
      if (arg === 'booking' || arg === 'airbnb' || arg === 'expedia' || arg === 'agoda') cuChannelEditor(String(arg));
    };
    handlers['hx-channel-close'] = () => { openModal?.close?.(); openModal=null; };
    handlers['hx-channel-guide'] = () => { if (isCustomHotel()) cuChannelGuide(); };
    handlers['hx-channel-sync'] = () => cuLoadChannels(true);
    handlers['hx-channel-save'] = async (el,arg) => {
      const root=el.closest('.kiwi-modal'), status=root?.querySelector('[data-hx-channel-status]');
      const label=String(root?.querySelector('[data-hx-channel-label]')?.value||'').trim(), roomId=String(root?.querySelector('[data-hx-channel-room]')?.value||''), feedUrl=String(root?.querySelector('[data-hx-channel-url]')?.value||'').trim();
      if(!label||!roomId||!feedUrl){if(status)status.textContent=tx('Complétez les trois champs.');return;}
      el.disabled=true;if(status)status.textContent=tx('Connexion et première vérification…');
      try{const res=await fetch('/api/hotel/channels',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'save',merchant:cuChannelMerchant(),channel:String(arg),label,roomId,feedUrl})}),body=await res.json().catch(()=>({}));if(!res.ok)throw new Error(body.error||'unavailable');cuChannelState.rows=body.channels||[];cuChannelState.loaded=true;openModal?.close?.();openModal=null;toast(tx('Calendrier connecté'),{type:'success',desc:tx('Les dates OTA sont maintenant dans le tape chart.')});rerender();}catch(error){if(status)status.textContent=error.message==='invalid-feed-url'?tx('Utilisez le lien iCal officiel fourni par la plateforme (voir « Où trouver le lien ? »).'):tx('Connexion impossible : {reason}',{reason:error.message});}finally{el.disabled=false;}
    };
    handlers['hx-channel-status'] = async (el,arg) => { const cut=String(arg).lastIndexOf(':'),id=String(arg).slice(0,cut),status=String(arg).slice(cut+1);el.disabled=true;try{const res=await fetch('/api/hotel/channels',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'status',merchant:cuChannelMerchant(),id,status})}),body=await res.json();if(res.ok){cuChannelState.rows=body.channels||[];rerender();}}finally{el.disabled=false;} };
    handlers['hx-channel-delete'] = async (el,id) => { if(!confirm(tx('Retirer ce calendrier ? Les séjours déjà importés restent dans l’historique.')))return;el.disabled=true;try{const res=await fetch('/api/hotel/channels',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({merchant:cuChannelMerchant(),id:String(id)})}),body=await res.json();if(res.ok){cuChannelState.rows=body.channels||[];rerender();}}finally{el.disabled=false;} };

    /* — folio — */
    handlers['hx-folio'] = (el, arg) => openFolio(parseInt(arg, 10));
    handlers['hx-room'] = (el, arg) => {
      const n = parseInt(arg, 10);
      if (cuSelectionMode) {
        const id = R()[n]?.id;
        if (!id) return;
        if (cuSelectedRooms.has(String(id))) {
          cuSelectedRooms.delete(String(id));
        } else {
          cuSelectedRooms.add(String(id));
        }
        rerender();
        return;
      }
      roomModal(n);
    };
    handlers['hx-add-charge'] = (el, arg) => {
      const body = el.closest('.kiwi-modal')?.querySelector('.kiwi-modal-body');
      if (body) body.innerHTML = addChargeHtml(parseInt(arg, 10));
    };
    handlers['hx-folio-back'] = (el, arg) => {
      const body = el.closest('.kiwi-modal')?.querySelector('.kiwi-modal-body');
      if (body) body.innerHTML = folioModalHtml(parseInt(arg, 10), true);
    };
    handlers['hx-post-charge'] = (el, arg) => {
      const [room, idx] = arg.split('|');
      const q = quickItems()[+idx];
      if (!q) return;
      postCharge(+room, q.label, q.amt, q.src);
      const body = el.closest('.kiwi-modal')?.querySelector('.kiwi-modal-body');
      if (body) body.innerHTML = folioModalHtml(+room, true);
    };
    handlers['hx-checkout-pay'] = (el, arg) => {
      const [roomArg, method] = String(arg || '').split('|');
      const room = parseInt(roomArg, 10);
      const f = F()[room];
      if (!f) return;
      const due = folioTotal(f) - folioPaid(f);
      if (isCustomHotel()) {
        if (!Number.isFinite(due) || due < 0 || (due > 0 && !recordSale(due, 'checkout-' + room + '-' + String(f.updatedAt || cuStamp()), 'Départ · Ch. ' + room, method))) {
          toast(tx('Clôture non enregistrée'), { type: 'warn', desc: tx('Le folio et la chambre sont conservés. Vérifiez la connexion et l’enregistrement du règlement avant de réessayer.') });
          return;
        }
        const closedAt = Math.max(cuStamp(), (+f.updatedAt || 0) + 1);
        const st = cuState();
        st.closedFolios = (st.closedFolios || []).filter((x) => +x.room !== room);
        st.closedFolios.push({ ...f, closedAt, updatedAt: closedAt, settlementAmount: due, settlementMethod: due > 0 ? method : null, settlementState: due > 0 ? 'queued' : 'previously-recorded' });
        /* le walk-in inscrit au registre y termine son séjour, comme une réservation.
           Le solde vient d'être encaissé ici même : le départ est confirmé (force),
           le serveur ne connaît pas encore le folio réglé et demanderait sinon
           confirmation d'un impayé qui n'existe plus. */
        if (f.stayId) cuStayStatus(f.stayId, 'completed', true);
        const r = R()[room];
        r.status = 'sale'; r.hk = 'dirty'; r.guest = null;
        r.meta = txk('Départ soldé · à remettre à blanc'); r.updatedAt = cuStamp();
        delete F()[room];
        cuSave();
        openModal?.close?.();
        toast(tx('Départ enregistré · Ch. {n}', { n: room }), { type: 'info', desc: due > 0 ? tx('Règlement ajouté à la file de synchronisation. Vérifiez sa confirmation dans les transactions.') : tx('Solde nul. Le dernier folio clôturé est conservé dans les données de la chambre.') });
        setTimeout(() => toast(tx('Ch. {n} → à remettre à blanc', { n: room }), { type: 'info', desc: tx('Marquez-la propre depuis Ménage pour la revendre ce soir.') }), 1400);
        rerender();
        return;
      }
      openModal?.close?.();
      toast('Folio Ch. ' + room + ' encaissé · ' + MAD(due), { type: 'success' });
      const dep = DEPARTURES.find((d) => d.room === room && !d.settled);
      if (dep) { dep.settled = true; dep.folio = folioTotal(f); }
      ROOMS[room].status = 'sale'; ROOMS[room].hk = 'dirty';
      ROOMS[room].meta = 'Départ soldé · ménage à assigner';
      if (!HK_QUEUE.find((q) => q.room === room)) HK_QUEUE.push({ room, st: 'attente', who: null, note: 'Départ soldé à l\'instant · arrivée 19h00', prio: false });
      delete FOLIOS[room];
      setTimeout(() => toast('Ch. ' + room + ' → file ménage', { type: 'info', desc: 'Arrivée Famille Lemoine prévue 19h00, remise à blanc prioritaire.' }), 1400);
      rerender();
    };

    /* — réception — */
    handlers['hx-checkin'] = (el, arg) => {
      const a = ARRIVALS.find((x) => x.id === arg);
      if (!a || a.done) return;
      a.done = true;
      const r = ROOMS[a.room];
      r.status = 'occ'; r.guest = a.guest; r.meta = SRC[a.src].label + ' · ' + a.nights + ' nuits · j1';
      if (!FOLIOS[a.room]) folio(a.room, a.guest, a.src, a.pax, a.nights, [
        { t: nowLabel(), label: 'Nuit 1 · ' + TYPES[r.type].name, qty: '×1', amt: TYPES[r.type].base, src: 'room' },
        { t: 'auto', label: `Taxe de séjour · ${a.pax} pers × 1 nuit`, qty: '', amt: TAX_PP_NIGHT * Math.min(a.pax, 2) , src: 'taxe' },
      ]);
      toast(a.guest + ' · Ch. ' + a.room + ', enregistrés', { type: 'success', desc: 'Folio ouvert · nuit 1 + taxe de séjour postées automatiquement.' });
      if (a.repeat) setTimeout(() => toast('Client fidèle reconnu', { type: 'info', desc: 'Marta & Diego Gómez · 2ᵉ séjour · préférences : suite étage haut, thé sans sucre.' }), 1300);
      rerender();
    };
    handlers['hx-checkout'] = (el, arg) => openFolio(parseInt(arg, 10));
    handlers['hx-walkin'] = () => {
      const custom = isCustomHotel();
      const free = Object.values(R()).filter((r) => r.status === 'libre');
      if (custom && free.length && !free.some((r) => roomTypeOf(r.n).base != null)) {
        toast(tx('Tarif non configuré'), { type: 'info', desc: tx('Définissez d’abord votre tarif de base dans Tarifs.') });
        return;
      }
      const m = K().modal({
        tag: 'WALK-IN', title: tx('Vendre une chambre ce soir'), desc: tx(free.length === 1 ? '{n} chambre libre et propre' : '{n} chambres libres et propres', { n: free.length, c: txn(free.length, 'chambre') }), width: 460,
        body: free.map((r) => `<div class="hx-fol-line" style="cursor:pointer;" data-action="hx-walkin-room" data-arg="${r.n}">
            <span><b style="font-family:var(--mono);">${tx('Ch. {n}', { n: r.n })}</b> · ${esc(roomTypeOf(r.n).name)}</span><span class="qt">${txn(1, 'nuit')}</span><span class="am">${roomTypeOf(r.n).base == null ? tx('Tarif à définir') : MAD(roomTypeOf(r.n).base)}</span>
          </div>`).join('') || `<div style="padding:14px;font-size:13px;color:var(--n-500);">${isCustomHotel() && totalRooms() === 0 ? tx('Aucune chambre configurée.') : tx('Complet ce soir, aucune chambre libre.')}</div>`,
      });
      openModal = { el: m.el, close: m.close };
    };
    handlers['hx-walkin-room'] = async (el, arg) => {
      const [roomArg, method] = String(arg || '').split('|');
      const n = parseInt(roomArg, 10);
      const r = R()[n];
      const cu = isCustomHotel();
      if (!r || r.status !== 'libre' || F()[n]) return;
      if (cu && roomTypeOf(n).base == null) {
        toast(tx('Tarif non configuré'), { type: 'info', desc: tx('Ajoutez un tarif à cette chambre ou définissez le tarif général dans Tarifs.') });
        return;
      }
      /* Le règlement d'avance se fait en espèces ou en carte : on le demande. */
      if (cu && method !== 'cash' && method !== 'card') {
        const body = el && el.closest ? el.closest('.kiwi-modal')?.querySelector('.kiwi-modal-body') : null;
        if (!body) return;
        const amount = MAD(roomTypeOf(n).base);
        body.innerHTML = `<div style="font-size:13px;color:var(--n-500);margin-bottom:10px;">${tx('Ch. {n} · {type} · 1 nuit', { n, type: esc(roomTypeOf(n).name) })}</div>
          <div style="font-weight:600;font-size:14px;margin-bottom:12px;">${tx('Comment le client règle-t-il ?')}</div>
          <div style="display:flex;gap:10px;flex-wrap:wrap;">
            <button class="hx-btn atlas" data-action="hx-walkin-room" data-arg="${n}|cash">${tx('Espèces · {amount}', { amount })}</button>
            <button class="hx-btn atlas" data-action="hx-walkin-room" data-arg="${n}|card">${tx('Carte · {amount}', { amount })}</button>
          </div>`;
        return;
      }
      if (cu && el && el.closest) { el.closest('.kiwi-modal-body')?.querySelectorAll('button').forEach((b) => { b.disabled = true; }); }
      const guest = cu ? tx('Client sans nom') : 'Walk-in · M. Idrissi';
      const rate = roomTypeOf(n).base;
      const stamp = cuStamp();
      /* Le séjour entre au registre AVANT que la chambre passe occupée : le
         serveur refuserait une chambre que le plan poussé dit déjà prise. */
      const stay = cu ? await cuRegisterWalkin(n, guest, 'walkin-' + n + '-' + stamp) : null;
      if (cu && (R()[n] !== r || r.status !== 'libre' || F()[n])) return;
      if (cu && !recordSale(rate, 'walkin-' + n + '-' + stamp, 'Walk-in · Ch. ' + n, method)) {
        if (stay) cuStayCancel(stay.id);
        toast(tx('Walk-in non enregistré'), { type: 'warn', desc: tx('La chambre reste libre. L’enregistrement du règlement est indisponible.') });
        return;
      }
      r.status = 'occ'; r.guest = guest; r.meta = txk('Walk-in · 1 nuit · réglé d\'avance');
      F()[n] = { room: n, guest, src: 'walkin', pax: 1, nights: 1, stayId: stay ? stay.id : null, lines: [
        { t: nowLabel(), label: tx('Nuit 1 · {type}', { type: roomTypeOf(n).name }), qty: '×1', amt: rate, src: 'room', paid: true },
        { t: 'auto', label: tx('Taxe de séjour · 1 pers × 1 nuit'), qty: '', amt: TAX_PP_NIGHT, src: 'taxe' },
      ], updatedAt: stamp };
      if (cu) { r.updatedAt = stamp; cuState().sold += 1; cuSave(); }
      openModal?.close?.();
      if (cu && !stay) setTimeout(() => toast(tx('Séjour non inscrit au registre'), { type: 'warn', desc: tx('La vente est enregistrée. L’occupation de l’Accueil comptera cette chambre une fois la connexion revenue et le séjour saisi dans Séjours.') }), 1400);
      toast(tx('Ch. {n} vendue · {amount}', { n, amount: MAD(rate) }), { type: 'success', desc: tx('Walk-in enregistré · occupation ce soir {a} / {b}', { a: counts().occToNight, b: totalRooms() }) + (cu ? ' · ' + tx('vente réelle au compteur.') : '.') });
      rerender();
    };

    /* — ménage — */
    handlers['hx-hk-assign'] = (el, arg) => {
      const room = parseInt(arg, 10);
      const m = K().modal({
        tag: 'MÉNAGE', title: 'Assigner la chambre ' + room, desc: 'La remise passe « en file » pour la personne choisie.', width: 440,
        body: HK_STAFF.filter((s) => s.id !== 'khadija').map((s) => `<div class="hx-hk" style="cursor:pointer;" data-action="hx-hk-assign-to" data-arg="${room}|${s.name.split(' ')[0]} ${s.name.split(' ')[1][0]}.">
            <span class="hx-av ${s.cls}">${s.av}</span>
            <div><div style="font-weight:600;font-size:13px;">${s.name}</div><div style="font-size:11.5px;color:var(--n-500);">${s.today}</div></div>
            <span class="hx-pill neutral">ASSIGNER</span>
          </div>`).join(''),
      });
      openModal = { el: m.el, close: m.close };
    };
    handlers['hx-hk-assign-to'] = (el, arg) => {
      const [room, who] = arg.split('|');
      const q = HK_QUEUE.find((x) => x.room === +room);
      if (q) { q.who = who; q.st = 'file'; }
      openModal?.close?.();
      toast('Ch. ' + room + ' assignée à ' + who, { type: 'success', desc: 'Notifiée sur son téléphone · la file ménage est à jour.' });
      rerender();
    };
    handlers['hx-hk-done'] = (el, arg) => {
      const room = parseInt(arg, 10);
      if (isCustomHotel()) {
        const r = R()[room];
        if (r) { r.status = 'libre'; r.hk = 'clean'; r.guest = null; r.meta = txk('Libre · propre'); r.updatedAt = cuStamp(); cuSave(); }
        openModal?.close?.();
        toast(tx('Ch. {n} remise à blanc', { n: room }), { type: 'success', desc: tx('Propre et relouable, visible « libre » sur le plan des chambres.') });
        rerender();
        return;
      }
      const i = HK_QUEUE.findIndex((x) => x.room === room);
      if (i >= 0) {
        const it = HK_QUEUE.splice(i, 1)[0];
        HK_DONE.unshift({ room, at: nowLabel(), by: it.who || '·', inspected: false, note: 'En attente d\'inspection · Khadija notifiée' });
        const r = ROOMS[room];
        const arrival = ARRIVALS.find((a) => a.room === room && !a.done);
        r.status = arrival ? 'arrivee' : 'libre';
        r.hk = 'inspect';
        r.meta = arrival ? SRC[arrival.src].label + ' · ETA ' + arrival.t : 'Libre ce soir';
        if (arrival) r.guest = arrival.guest;
      }
      toast('Ch. ' + room + ' remise à blanc', { type: 'success', desc: 'Inspection gouvernante demandée · tourné 38 min (cible 35).' });
      rerender();
    };
    handlers['hx-hk-open'] = () => { openModal?.close?.(); handlers['nav-menage'](); };
    handlers['hx-hs-fix'] = (el, arg) => {
      const n = parseInt(arg, 10);
      ROOMS[n].status = 'sale'; ROOMS[n].meta = 'Réparée · remise à blanc avant relouage'; ROOMS[n].hk = 'dirty';
      HK_QUEUE.push({ room: n, st: 'attente', who: null, note: 'Sortie de hors-service · grand ménage', prio: false });
      openModal?.close?.();
      toast('Ch. ' + n + ' réparée', { type: 'success', desc: 'Ajoutée à la file ménage pour remise à blanc complète.' });
      rerender();
    };

    /* — tarifs — */
    handlers['hx-apply-ai'] = () => {
      aiApplied = true;
      Object.values(RATES).forEach((r) => r.ai.forEach((v, i) => { if (v) r.base[i] = v; }));
      toast('Suggestions IA appliquées', { type: 'success', desc: '+4 280 MAD de revenu projeté sur 7 jours · weekend 13-14 revalorisé.' });
      rerender();
    };
    handlers['hx-rate-cell'] = (el, arg) => {
      const [ty, di] = arg.split('|');
      const r = RATES[ty];
      const m = K().modal({
        tag: 'TARIF', title: TYPES[ty].name + ' · ' + RATE_DAYS[+di], desc: 'Le tarif s\'applique aux nouvelles réservations.', width: 400,
        body: `<div style="display:flex;align-items:center;justify-content:center;gap:18px;padding:8px 0 4px;">
            <button class="hx-btn ghost" data-action="hx-rate-step" data-arg="${ty}|${di}|-50">−50</button>
            <div style="font-family:var(--mono);font-size:28px;font-weight:600;" data-hx-rate>${fmt(r.base[+di])}</div>
            <button class="hx-btn ghost" data-action="hx-rate-step" data-arg="${ty}|${di}|50">+50</button>
          </div>
          <div style="text-align:center;font-size:11.5px;color:var(--n-500);">${r.ai[+di] ? 'Suggestion IA : ' + fmt(r.ai[+di]) + ' MAD' : 'Pas de suggestion IA ce jour'}</div>
          <div style="display:flex;justify-content:flex-end;margin-top:16px;"><button class="hx-btn atlas" data-action="hx-rate-save" data-arg="${ty}|${di}">Enregistrer</button></div>`,
      });
      openModal = { el: m.el, close: m.close };
    };
    handlers['hx-rate-step'] = (el, arg) => {
      const [ty, di, step] = arg.split('|');
      RATES[ty].base[+di] = Math.max(300, RATES[ty].base[+di] + +step);
      const v = el.closest('.kiwi-modal')?.querySelector('[data-hx-rate]');
      if (v) v.textContent = fmt(RATES[ty].base[+di]);
    };
    handlers['hx-rate-save'] = (el, arg) => {
      const [ty, di] = arg.split('|');
      openModal?.close?.();
      toast('Tarif mis à jour', { type: 'success', desc: TYPES[ty].name + ' · ' + RATE_DAYS[+di] + ' → ' + MAD(RATES[ty].base[+di]) + ' / nuit.' });
      rerender();
    };

    /* — divers — */
    handlers['hx-stay'] = (el, arg) => {
      const [r, g, n, src] = arg.split('|');
      const fee = SRC[src].fee;
      const rev = TYPES[typeOf(+r)].base * +n;
      K().toast(g + ' · Ch. ' + r, { type: 'info', desc: `${n} nuit${+n > 1 ? 's' : ''} · ${SRC[src].label} · ~${MAD(rev)}${fee ? ' · commission −' + MAD(rev * fee) : ' · 0 commission'}` });
    };
    handlers['hx-guest'] = (el, arg) => guestModal(arg);
    handlers['hx-guest-direct'] = () => { openModal?.close?.(); toast('Offre directe envoyée', { type: 'success', desc: 'Lien de réservation direct −10 % envoyé par WhatsApp · 0 % commission.' }); };
    handlers['hx-guest-msg'] = () => { openModal?.close?.(); toast('Conversation WhatsApp ouverte', { type: 'info', desc: 'Modèle « préparation de séjour » prérempli.' }); };
    handlers['hx-direct-push'] = () => toast('Relance directe activée', { type: 'success', desc: '22 clients fidèles ciblés · jusqu\'à 4 100 MAD de commission économisée / mois.' });
    handlers['hx-noshow-secure'] = (el, arg) => toast('Prépaiement demandé · ' + arg, { type: 'success', desc: 'Lien de paiement Kiwi envoyé · la réservation passe « garantie » au règlement.' });
    handlers['hx-taxe-export'] = () => toast('Registre taxe de séjour exporté', { type: 'success', desc: 'CSV juin 2026 · 14 350 MAD · prêt pour la déclaration communale.' });

    /* — LE MOMENT DÉMO · thé + hammam → folio — */
    handlers['hx-demo-folio'] = () => {
      openModal?.close?.();
      toast('Restaurant · table terrasse', { type: 'info', desc: 'Thé à la menthe ×2, le serveur encaisse sur la chambre 7.' });
      setTimeout(() => postCharge(7, 'Thé à la menthe', 60, 'resto', true), 900);
      setTimeout(() => K().toast('Thé à la menthe ×2 → folio Ch. 7', { type: 'success', desc: 'Restaurant · POS · 60 MAD postés sur la note de chambre.' }), 950);
      setTimeout(() => postCharge(7, 'Rituel hammam + massage duo · demain 17h', 980, 'spa', true), 2100);
      setTimeout(() => K().toast('Hammam réservé → folio Ch. 7', { type: 'success', desc: 'Rituel duo demain 17h · 980 MAD postés sur la même note.' }), 2150);
      setTimeout(() => {
        openFolio(7, true);
        setTimeout(() => K().toast('Une seule note. Un seul système.', { type: 'info', desc: 'Chambres + restaurant + hammam + taxe de séjour, encaissés en un geste au départ.' }), 800);
      }, 3300);
    };
  }
  /* Small model surface for the POS/hotel shells and the regression harness.
   * Mutations still go through the handlers above; consumers receive copies. */
  window.KiwiHotelRooms = Object.freeze({
    housekeeping: () => cuHousekeeping(),
    tonight: () => { if (!isCustomHotel()) return null; cuWarmStays(); return cuTonight(); },
    warm: () => cuWarmStays(),
    current: () => cuDocument(cuState()),
    merge: (mine, theirs) => cuMerge(mine, theirs),
    hydrate: (doc) => {
      const id = cuStateId();
      if (id) {
        CUSTOM_HX[id] = cuHydrate(doc);
        cuWriteLocal(CUSTOM_HX[id], id);
        return CUSTOM_HX[id];
      }
      return cuHydrate(doc);
    },
    filter: cuRackFilter,
    characteristics: () => HOTEL_CHARACTERISTICS.slice(),
    selection: {
      get selected() { return cuSelectedNumbers(); },
      get mode() { return cuSelectionMode; },
      setMode: (m) => { cuSelectionMode = Boolean(m); },
      select: (n) => { if (R()[Number(n)]?.id) cuSelectedRooms.add(String(R()[Number(n)].id)); },
      deselect: (n) => { if (R()[Number(n)]?.id) cuSelectedRooms.delete(String(R()[Number(n)].id)); },
      clear: () => { cuSelectedRooms.clear(); },
    },
    resetFilter: cuResetRackFilter,
    matchesFilter: cuRoomMatchesFilter,
    allViews: cuAllViews,
    allCharacteristics: cuAllCharacteristics,
    connectingAvail: cuConnectingAvail,
    bulkPlan: () => cuBulkPlan,
    linkConnecting: (a, b) => {
      const st = cuState();
      const rA = Object.values(st.rooms).find((r) => r.n === a || r.id === a);
      const rB = Object.values(st.rooms).find((r) => r.n === b || r.id === b);
      if (rA && rB) {
        cuLinkConnectingRooms(st, rA, rB);
        cuSave(st);
      }
    },
    unlinkConnecting: (a, b) => {
      const st = cuState();
      const rA = Object.values(st.rooms).find((r) => r.n === a || r.id === a);
      const rB = Object.values(st.rooms).find((r) => r.n === b || r.id === b);
      if (rA && rB) {
        cuUnlinkConnectingRooms(st, rA, rB);
        cuSave(st);
      }
    },
    nationalities: () => cuNationalities.slice(),
    matchNationality: (input) => cuMatchNationality(input),
    nationalityLabel: (val, lang) => cuNationalityLabel(val, lang),
    nationalitySelectorHtml: (guest, index) => cuNationalitySelectorHtml(guest, index),
    parseDelimitedLine: (line) => cuParseDelimitedLine(line),
    directQuote: (input) => cuDirectQuote(input),
    birthDisplay: (iso) => cuBirthDisplay(iso),
    birthIso: (raw) => cuBirthIso(raw),
  });

  register();
  /* Same insurance as pages-pro's starter wraps: modules that re-install
   * handlers at load+setTimeout(0) must not clobber the wizard override. */
  window.addEventListener('load', () => setTimeout(() => {
    if (window.Kiwi && window.Kiwi.handlers) window.Kiwi.handlers['onboard'] = obOnboard;
  }, 200));
})();
