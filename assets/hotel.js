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

  /* ═══════════════ HELPERS ═══════════════ */
  const fmt = (n) => Math.round(n).toLocaleString('fr-FR');
  const MAD = (n) => fmt(n) + ' MAD';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
  /* Editors are declared outside register(), so they cannot see the
   * register-local `toast` destructuring. Always resolve the shared UI helper
   * at call time; this keeps reservation and OTA actions usable without
   * duplicating notification code in each workflow. */
  const toast = (message, options) => window.Kiwi?.toast?.(message, options);
  const TAX_PP_NIGHT = 25; // taxe de séjour (TPT + taxe communale) · MAD / adulte / nuit

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
  const srcPill = (s) => `<span class="hx-src ${s}">${SRC[s] ? SRC[s].label.split(' ')[0].replace('.com', '.com') : s}</span>`;
  const SRC_LBL = { room: 'Chambre', resto: 'Restaurant · POS', spa: 'Hammam & spa', taxe: 'Taxe de séjour', fee: 'Frais' };
  const SRC_DOT = { room: 'room', resto: 'resto', spa: 'spa', taxe: 'taxe', fee: 'taxe' };

  let openDrawer = null;   // { el, page }
  let openModal = null;
  let cuTapeOffset = 0;
  let cuReservationEventsBound = false;
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
      cuStayLoads.set(cuStayScope(), { loading: false, error: 'Hôtel non connecté au serveur : liste non vérifiée.' });
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
      if (data.stays.length >= 1000) load.error = 'Limite de lecture atteinte : cette liste peut être incomplète. Réduisez la période.';
      return data.stays;
    } catch (_) {
      load.error = 'Actualisation indisponible. Les données affichées peuvent être anciennes ; réessayez avant de confirmer une disponibilité.';
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
      { id: 'type:chambre', name: 'Chambre', rate: null, description: '', maxGuests: 2, beds: '1 grand lit', sizeM2: null, view: '', amenities: [], photos: [], public: true, updatedAt: now },
      { id: 'type:suite', name: 'Suite', rate: null, description: '', maxGuests: 2, beds: '1 grand lit', sizeM2: null, view: '', amenities: [], photos: [], public: true, updatedAt: now },
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
      id: 'room:' + n, n, typeId: 'type:chambre', typeName: 'Chambre',
      floor: count > 8 ? 'Niveau ' + (Math.floor((n - 1) / 8) + 1) : 'Vos chambres',
      rate: null, status: 'libre', hk: 'clean', guest: null, meta: 'Libre · propre', updatedAt: now,
    };
    const floorNames = [...new Set(Object.values(rooms).map((r) => r.floor))];
    if (!floorNames.length) floorNames.push('Vos chambres');
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
        meta: String(x.meta || (x.status === 'sale' ? 'À remettre à blanc' : 'Libre · propre')).slice(0, 180),
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
    if (scope !== cuStateId()) throw new Error('Établissement changé');
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
      name: type?.name || r.typeName || 'Chambre',
      maxGuests: type?.maxGuests || 2,
      base: type ? (type.rate == null ? st.baseRate : type.rate) : (r.rate == null ? st.baseRate : r.rate),
    };
  };
  const totalRooms = () => (isCustomHotel() ? cuState().count : 24);
  const roomCountLabel = () => totalRooms() + ' chambre' + (totalRooms() === 1 ? '' : 's');
  const vName = () => ((window.KiwiVenue && window.KiwiVenue.getCurrentVenueData && window.KiwiVenue.getCurrentVenueData()) || {}).name || 'Votre établissement';
  /* A custom hotel's encaissements are REAL — feed the merchant sales store
   * so the hero, KPI band and feed recompute from them (same pipeline as
   * the POS «Nouvelle vente»). */
  function recordSale(amount, identity, label) {
    if (!isCustomHotel() || !(amount > 0)) return false;
    const live = window.KiwiLive;
    if (!live?.isOn?.() || !live?.postSale) return false;
    const key = String(identity || ('hotel-' + Date.now())).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 54);
    const result = live.postSale({
      id: 'hotel-' + key, amount: Math.round(amount * 100) / 100, method: 'card',
      label: String(label || 'Encaissement hôtel').slice(0, 80), ref: key,
      time: new Date(), channel: 'hotel'
    });
    return result?.ok === true;
  }

  function page(pageKey, title, subtitle, bodyFn) {
    const p = K().appPage(pageKey, { title, subtitle, body: bodyFn() });
    openDrawer = { el: p.el, page: pageKey, bodyFn, close: p.close };
    return p;
  }
  function rerender() {
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
  function folioModalHtml(room, highlightNew) {
    const f = F()[room];
    if (!f) return '<div style="padding:20px;color:var(--n-500);font-size:13px;">Aucun folio ouvert pour cette chambre.</div>';
    const total = folioTotal(f);
    const paid = folioPaid(f);
    const groups = ['room', 'resto', 'spa', 'fee', 'taxe'];
    const gHtml = groups.map((g) => {
      const lines = f.lines.filter((l) => l.src === g);
      if (!lines.length) return '';
      return `<div class="hx-fol-grp">
        <div class="gh"><span class="hx-srcdot ${SRC_DOT[g]}"></span>${SRC_LBL[g]}<span style="margin-left:auto;font-weight:600;color:var(--ink);">${MAD(folioBySrc(f, g))}</span></div>
        ${lines.map((l) => `<div class="hx-fol-line${l.isNew && highlightNew ? ' new' : ''}">
          <span><span class="tm">${l.t}</span>${l.label}${l.paid ? ' <span class="hx-pill ok" style="margin-left:6px;">RÉGLÉ</span>' : ''}</span>
          <span class="qt">${l.qty || ''}</span>
          <span class="am">${MAD(l.amt)}</span>
        </div>`).join('')}
      </div>`;
    }).join('');
    const commission = SRC[f.src].fee > 0
      ? `<div class="hx-fol-meta warn"><span>Commission ${SRC[f.src].label} (${Math.round(SRC[f.src].fee * 100)} %) · facturée au riad en fin de mois</span><span style="font-family:var(--mono);">−${MAD(folioBySrc(f, 'room') * SRC[f.src].fee)}</span></div>`
      : `<div class="hx-fol-meta"><span>Réservation directe, aucune commission OTA</span><span class="hx-pill ok">0 MAD</span></div>`;
    return `
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:4px;">
        ${srcPill(f.src)}
        <span style="font-size:12px;color:var(--n-500);">${f.pax} pers · séjour ${f.nights} nuits · ${roomTypeOf(room).name}</span>
      </div>
      ${gHtml}
      <div class="hx-fol-tot"><span>Total folio</span><span class="am">${MAD(total)}</span></div>
      ${paid > 0 ? `<div class="hx-fol-meta"><span>Dont déjà réglé</span><span style="font-family:var(--mono);">${MAD(paid)}</span></div>` : ''}
      ${commission}
      <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:18px;flex-wrap:wrap;">
        <button class="hx-btn ghost" data-action="hx-add-charge" data-arg="${room}">+ Ajouter une charge</button>
        <button class="hx-btn atlas" data-action="hx-checkout-pay" data-arg="${room}">Encaisser au check-out · ${MAD(total - paid)}</button>
      </div>`;
  }
  function openFolio(room, highlightNew) {
    const f = F()[room];
    const m = K().modal({
      tag: 'FOLIO · CH. ' + room,
      title: f ? f.guest : 'Chambre ' + room,
      desc: 'Chambres + restaurant + hammam + taxe de séjour, une seule note.',
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
  function quickItems() {
    if (!isCustomHotel()) return QUICK_ITEMS;
    const p = ((window.KiwiVenue.getCurrentVenueData() || {}).profileInfo) || {};
    const items = [];
    if (p.resto || p.resto === undefined) items.push(
      { label: 'Petit-déjeuner', amt: 80, src: 'resto' },
      { label: 'Dîner · couvert', amt: 240, src: 'resto' },
    );
    if (p.spa) items.push({ label: 'Soin spa / hammam', amt: 300, src: 'spa' });
    items.push({ label: 'Minibar', amt: 45, src: 'resto' }, { label: 'Late check-out', amt: 150, src: 'fee' });
    return items;
  }
  function addChargeHtml(room) {
    const intro = isCustomHotel()
      ? `Votre caisse, la charge se poste directement sur la note de la chambre ${room}.`
      : `Caisse restaurant et hammam du riad, la charge se poste directement sur la note de la chambre ${room}.`;
    return `
      <div style="font-size:12px;color:var(--n-500);margin-bottom:10px;">${intro}</div>
      ${quickItems().map((q, i) => `<div class="hx-fol-line" style="cursor:pointer;" data-action="hx-post-charge" data-arg="${room}|${i}">
        <span><span class="hx-srcdot ${SRC_DOT[q.src]}" style="margin-right:7px;"></span>${q.label}</span>
        <span class="qt">${q.src === 'resto' ? 'POS' : q.src === 'spa' ? 'SPA' : 'FRAIS'}</span>
        <span class="am">${MAD(q.amt)}</span>
      </div>`).join('')}
      <div style="display:flex;justify-content:flex-end;margin-top:16px;">
        <button class="hx-btn ghost" data-action="hx-folio-back" data-arg="${room}">← Retour au folio</button>
      </div>`;
  }

  function nowLabel() {
    const sim = window.KiwiDemoClock?.getSimState?.();
    if (!isCustomHotel() && sim) return sim.simHourLabel.replace('h', 'h') + String(sim.simMinute).padStart(2, '0');
    return new Intl.DateTimeFormat('fr-FR', { timeZone: 'Africa/Casablanca', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date());
  }
  function postCharge(room, label, amt, src, silent) {
    const f = F()[room];
    if (!f) return;
    f.lines.push({ t: nowLabel(), serviceAt: Date.now(), label, qty: '', amt, src, isNew: true });
    f.updatedAt = cuStamp();
    if (isCustomHotel()) cuSave();
    if (!silent) K().toast(label + ' → folio Ch. ' + room, { type: 'success', desc: (src === 'resto' ? 'Restaurant · POS' : 'Hammam & spa') + ' · ' + MAD(amt) + ' postés sur la note de chambre.' });
  }

  /* ═══════════════ PAGE · RÉCEPTION ═══════════════ */
  function counts() {
    if (isCustomHotel()) {
      const rs = Object.values(R());
      return {
        occToNight: rs.filter((r) => r.status === 'occ').length,
        toClean: rs.filter((r) => r.status === 'sale').length,
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
        <div class="hx-kpi"><div class="l">Occupation ce soir</div><div class="v">${c.occToNight} / 24</div><div class="d up">${(c.occToNight / 24 * 100).toFixed(1).replace('.', ',')} % · +2,4 pts vs hier</div></div>
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
      return 'Disponibilité non vérifiée (dates requises)';
    }
    const doc = window.KiwiReservations?.get?.();
    if (!doc || !Array.isArray(doc.bookings)) {
      return 'Disponibilité non vérifiée (réservations non chargées)';
    }
    if (typeof window.KiwiReservations.resourceFree !== 'function') {
      return 'Disponibilité non vérifiée';
    }
    const parseTime = (v) => typeof v === 'number' ? v : Date.parse(v);
    const start = parseTime(dates.startAt), end = parseTime(dates.endAt);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 'Disponibilité non vérifiée (dates invalides)';
    let isFree;
    try { isFree = window.KiwiReservations.resourceFree(doc, cr.id, start, end); }
    catch (_) { return 'Disponibilité non vérifiée'; }
    if (!isFree) {
      return 'Occupée / réservée sur ces dates';
    }
    return cr.status === 'libre' ? 'Disponible pour ces dates' : crStatus.label;
  }
  function roomModal(n, opts) {
    const r = R()[n];
    if ((r.status === 'occ' || r.status === 'depart') && F()[n]) return openFolio(n);
    if (r.status === 'arrivee' && F()[n]) return openFolio(n);
    const dates = (opts && opts.startAt && opts.endAt) ? { startAt: +opts.startAt, endAt: +opts.endAt } : null;
    const stLbl = { arrivee: 'Arrivée attendue', libre: 'Libre · propre', sale: 'Libre · sale, en remise', hs: 'Hors-service' };
    const m = K().modal({
      tag: 'CH. ' + n + ' · ' + roomTypeOf(n).name.toUpperCase(),
      title: r.guest || stLbl[r.status] || 'Chambre ' + n,
      desc: r.meta || '',
      width: 480,
      body: `
        <div style="display:flex;flex-direction:column;gap:10px;font-size:13px;">
          <div style="display:flex;justify-content:space-between;"><span style="color:var(--n-500);">Statut</span><b>${stLbl[r.status] || r.status}</b></div>
          <div style="display:flex;justify-content:space-between;"><span style="color:var(--n-500);">Tarif de base</span><b style="font-family:var(--mono);">${MAD(roomTypeOf(n).base)} / nuit</b></div>
          ${r.view ? `<div style="display:flex;justify-content:space-between;"><span style="color:var(--n-500);">Vue</span><b>Vue ${esc(cuViewLabel(r.view))}</b></div>` : ''}
          ${(r.characteristics && r.characteristics.length) ? `<div style="display:flex;justify-content:space-between;"><span style="color:var(--n-500);">Équipements</span><b>${esc(r.characteristics.map((c) => cuCharLabel(c)).join(', '))}</b></div>` : ''}
          ${(r.connectingRoomIds && r.connectingRoomIds.length) ? `
          <div style="display:flex;flex-direction:column;gap:4px;padding:8px 10px;border-radius:8px;background:var(--n-50,#f7f8f7);margin-top:4px;">
            <span style="color:var(--n-500);font-size:11.5px;font-weight:600;">Portes communicantes</span>
            <div style="display:flex;flex-direction:column;gap:3px;font-size:12px;">
              ${r.connectingRoomIds.map((cid) => {
                const cr = Object.values(R()).find((x) => x.id === cid);
                if (!cr) return '';
                const availLabel = cuConnectingAvail(cr, dates);
                return `<span><b>Ch. ${cr.n}</b> (${esc(roomTypeOf(cr.n).name)}) · ${esc(availLabel)}</span>`;
              }).filter(Boolean).join('')}
            </div>
            <small style="color:var(--n-500);font-size:10.5px;">Chambre communicante vendue séparément. Non réservée automatiquement.</small>
          </div>` : ''}
          ${r.status === 'sale' ? `<div style="display:flex;justify-content:space-between;"><span style="color:var(--n-500);">Ménage</span><b>${isCustomHotel() ? 'à remettre à blanc' : ((HK_QUEUE.find((q) => q.room === n) || {}).who || 'à assigner')}</b></div>` : ''}
        </div>
        <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:20px;flex-wrap:wrap;">
          ${r.status === 'libre' ? `<button class="hx-btn atlas" data-action="hx-walkin-room" data-arg="${n}">Vendre ce soir · walk-in</button>` : ''}
          ${r.status === 'sale' ? (isCustomHotel()
            ? `<button class="hx-btn atlas" data-action="hx-hk-done" data-arg="${n}">Marquer propre · relouable</button>`
            : `<button class="hx-btn atlas" data-action="hx-hk-open">Ouvrir la file ménage</button>`) : ''}
          ${r.status === 'hs' ? `<button class="hx-btn ghost" data-action="hx-hs-fix" data-arg="${n}">Marquer réparée</button>` : ''}
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
  function menageBody() {
    const stPill = { encours: '<span class="hx-pill pend">EN COURS</span>', file: '<span class="hx-pill neutral">EN FILE</span>', attente: '<span class="hx-pill late">APRÈS DÉPART</span>', inspect: '<span class="hx-pill pend">À INSPECTER</span>' };
    const q = HK_QUEUE.map((it) => `
      <div class="hx-q">
        <i class="dot" style="background:${it.prio ? 'var(--danger)' : 'var(--warning)'};"></i>
        <div><div class="nm">Ch. ${it.room} · ${TYPES[ROOMS[it.room].type].name}</div><div class="nt">${it.note}</div></div>
        ${stPill[it.st] || ''}
        ${it.st === 'encours'
          ? `<button class="hx-btn ghost" data-action="hx-hk-done" data-arg="${it.room}">Terminer → inspection</button>`
          : it.who
            ? `<span style="font-size:12px;font-family:var(--mono);color:var(--n-500);">${it.who}</span>`
            : `<button class="hx-btn atlas" data-action="hx-hk-assign" data-arg="${it.room}">Assigner</button>`}
      </div>`).join('');
    const done = HK_DONE.map((d) => `
      <div class="hx-q">
        <i class="dot" style="background:var(--mint);"></i>
        <div><div class="nm">Ch. ${d.room} · remise ${d.at}</div><div class="nt">${d.by} · ${d.note}</div></div>
        <span class="hx-pill ok">INSPECTÉE ✓</span><span></span>
      </div>`).join('');
    const staff = HK_STAFF.map((s) => `
      <div class="hx-hk">
        <span class="hx-av ${s.cls}">${s.av}</span>
        <div><div style="font-weight:600;font-size:13px;color:var(--ink);">${s.name}</div><div style="font-size:11.5px;color:var(--n-500);">${s.role}</div></div>
        <span style="font-size:11.5px;color:var(--n-500);text-align:right;">${s.today}</span>
      </div>`).join('');
    return `<div class="hx-page">
      <div class="hx-strip">
        <div class="hx-kpi"><div class="l">En file</div><div class="v">${HK_QUEUE.length}</div><div class="d">dont 1 prioritaire · arrivée 17h00</div></div>
        <div class="hx-kpi"><div class="l">Remises aujourd'hui</div><div class="v">${HK_DONE.length}</div><div class="d up">relouées ce soir</div></div>
        <div class="hx-kpi"><div class="l">Tourné moyen</div><div class="v">42 <small>min</small></div><div class="d warn">cible 35 min · −7 à gagner</div><div class="hx-turn-bar"><i style="width:${Math.round(35 / 42 * 100)}%;"></i></div></div>
        <div class="hx-kpi"><div class="l">Inspections</div><div class="v">2 / 2</div><div class="d up">Khadija · gouvernante</div></div>
      </div>
      <div class="hx-h"><span class="t">File de remise à blanc</span><span class="s">sale → en cours → à inspecter → inspectée · la chambre repasse « libre propre »</span></div>
      <div class="block" style="padding:6px 14px;">${q || '<div style="padding:14px;font-size:13px;color:var(--n-500);">File vide, toutes les chambres sont prêtes.</div>'}</div>
      <div class="hx-h"><span class="t">Remises terminées · aujourd'hui</span></div>
      <div class="block" style="padding:6px 14px;">${done}</div>
      <div class="hx-h"><span class="t">Équipe ménage · 4</span><span class="a" data-action="nav-equipe">Gérer l'équipe →</span></div>
      <div class="block" style="padding:6px 14px;">${staff}</div>
    </div>`;
  }

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
      desc: `${g.stays} séjour${g.stays > 1 ? 's' : ''} · dernier : ${g.last}`,
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
  function foliosBody() {
    const open = Object.values(FOLIOS).filter((f) => ROOMS[f.room].guest);
    const totalOpen = open.reduce((a, f) => a + folioTotal(f), 0);
    const rows = open.sort((a, b) => folioTotal(b) - folioTotal(a)).map((f) => {
      const r = ROOMS[f.room];
      const resto = folioBySrc(f, 'resto'), spa = folioBySrc(f, 'spa');
      return `<div class="hx-folio-row" data-action="hx-folio" data-arg="${f.room}">
        <div>
          <div style="font-weight:600;color:var(--ink);font-size:13.5px;">Ch. ${f.room} · ${f.guest} ${r.status === 'depart' ? '<span class="hx-pill late">DÉPART EN RETARD</span>' : ''}</div>
          <div style="font-size:11.5px;color:var(--n-500);margin-top:3px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
            ${srcPill(f.src)} ${f.nights} nuits · ${f.pax} pers
            ${resto ? `<span><span class="hx-srcdot resto"></span> resto ${MAD(resto)}</span>` : ''}
            ${spa ? `<span><span class="hx-srcdot spa"></span> hammam ${MAD(spa)}</span>` : ''}
            <span><span class="hx-srcdot taxe"></span> taxe incluse</span>
          </div>
        </div>
        <div class="amt">${MAD(folioTotal(f))}</div>
      </div>`;
    }).join('');
    return `<div class="hx-page">
      <div class="hx-strip">
        <div class="hx-kpi"><div class="l">Folios ouverts</div><div class="v">${open.length}</div><div class="d">chambres + resto + hammam unifiés</div></div>
        <div class="hx-kpi"><div class="l">En-cours total</div><div class="v">${fmt(totalOpen)} <small>MAD</small></div><div class="d up">encaissé au check-out · T+1</div></div>
        <div class="hx-kpi"><div class="l">Taxe de séjour · juin</div><div class="v">14 350 <small>MAD</small></div><div class="d">25 MAD / adulte / nuit</div></div>
        <div class="hx-kpi"><div class="l">Déclaration</div><div class="v" style="font-size:15px;">avant le 10 juil.</div><div class="d up">mai : 24 600 MAD déclarés ✓</div></div>
      </div>
      <div class="hx-h"><span class="t">Notes clients en cours</span><span class="s">un séjour = une note · le restaurant et le hammam postent dessus en direct</span>
        <button class="hx-btn ghost" data-action="hx-taxe-export">Exporter le registre taxe (CSV)</button>
      </div>
      <div class="block" style="padding:6px 14px;">${rows}</div>
      <div class="block" style="padding:16px;background:var(--mint-soft);border-color:var(--atlas);">
        <div style="font-size:13px;color:var(--riad);line-height:1.65;">
          <b>C'est ça, le pitch Kiwi.</b> Un thé commandé en terrasse, un hammam réservé à l'accueil, trois nuits en Suite Yasmina,
          tout atterrit sur la même note, taxe de séjour calculée, encaissée en un geste au départ. Aucun PMS étranger ne fait
          caisse + spa + chambres nativement pour un riad marocain.
        </div>
      </div>
    </div>`;
  }

  /* ═══════════════ PAGE · CANAUX & OTA ═══════════════ */
  function canauxBody() {
    const totFee = CHANNELS.reduce((a, c) => a + c.fee, 0);
    const donutParts = CHANNELS.map((c) => ({ pct: c.pct, color: c.color }));
    const rows = CHANNELS.map((c) => `<div class="r">
      <span class="sw" style="background:${c.color};"></span>
      <span>${c.label}<div style="font-size:10.5px;color:var(--n-500);">${c.nights} nuitées · ${MAD(c.rev)}</div></span>
      <span class="pc">${c.pct} %</span>
      <span class="am">${c.fee ? '−' + MAD(c.fee) : '0 MAD'}</span>
    </div>`).join('');
    const trend = DIRECT_TREND.map((v, i) => `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;">
      <div style="width:100%;max-width:34px;height:${v * 2.6}px;background:${i === DIRECT_TREND.length - 1 ? 'var(--atlas)' : 'var(--n-200)'};border-radius:6px 6px 0 0;align-self:center;"></div>
      <span style="font-size:9.5px;font-family:var(--mono);color:var(--n-500);">${['J', 'F', 'M', 'A', 'M', 'J'][i]}</span>
    </div>`).join('');
    return `<div class="hx-page">
      <div class="hx-row r-21">
        <div class="block" style="padding:16px;">
          <div class="hx-h" style="margin:0 0 12px;"><span class="t">Mix canaux · nuitées 30 jours</span><span class="s">547 nuitées vendues</span></div>
          <div class="hx-donut-wrap">
            <div class="hx-donut" style="${donutCss(donutParts)}"><div class="ctr"><b>54 %</b><span>BOOKING</span></div></div>
            <div class="hx-dlg">${rows}
              <div class="r" style="border-top:1px solid var(--n-200);padding-top:8px;margin-top:2px;">
                <span></span><span style="font-weight:600;color:var(--ink);">Commissions payées · 30 j</span><span></span>
                <span class="am" style="color:var(--danger);">−${MAD(totFee)}</span>
              </div>
            </div>
          </div>
        </div>
        <div class="hx-bleed">
          <div class="lbl">LA MORSURE BOOKING · 30 JOURS</div>
          <div class="big">−${MAD(56180)}</div>
          <div class="sub">17 % de commission sur 295 nuitées. La même Confort Médina à 950 MAD vous laisse
            <b style="color:var(--paper);">788,50 MAD via Booking</b>, et <b style="color:var(--mint);">950 MAD en direct</b>.</div>
          <div style="margin-top:14px;">
            <div class="hx-bleed-row"><div>1 séjour direct de 3 nuits<div class="nt">au lieu de Booking</div></div><span class="am" style="color:var(--mint);">+484 MAD</span></div>
            <div class="hx-bleed-row"><div>22 clients fidèles encore sur OTA<div class="nt">relance « revenez en direct −10 % »</div></div><span class="am" style="color:var(--mint);">+4 100 MAD / mois</span></div>
          </div>
          <button class="hx-btn" style="margin-top:14px;background:var(--mint);color:var(--riad);width:100%;" data-action="hx-direct-push">Activer la relance directe WhatsApp</button>
        </div>
      </div>
      <div class="hx-row r-2">
        <div class="block" style="padding:16px;">
          <div class="hx-h" style="margin:0 0 10px;"><span class="t">Part du direct · 6 mois</span><span class="s">18 % → 25 % depuis la relance Kiwi</span></div>
          <div style="display:flex;align-items:flex-end;gap:8px;height:80px;">${trend}</div>
        </div>
        <div class="block" style="padding:16px;">
          <div class="hx-h" style="margin:0 0 10px;"><span class="t">Règles par canal</span></div>
          <div style="font-size:12.5px;color:var(--n-500);line-height:1.9;">
            <div style="display:flex;justify-content:space-between;"><span>Booking.com, annulation flexible</span><b style="color:var(--ink);">no-show : 1ʳᵉ nuit retenue</b></div>
            <div style="display:flex;justify-content:space-between;"><span>Expedia, prépaiement virtuel (VCC)</span><b style="color:var(--ink);">encaissé à l'arrivée</b></div>
            <div style="display:flex;justify-content:space-between;"><span>Airbnb, versement J+1 après arrivée</span><b style="color:var(--ink);">frais hôte 3 %</b></div>
            <div style="display:flex;justify-content:space-between;"><span>Direct, acompte 30 % WhatsApp Pay</span><b style="color:var(--atlas);">0 % commission</b></div>
          </div>
        </div>
      </div>
    </div>`;
  }

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
    const c = counts();
    const total = totalRooms();
    const free = Object.values(R()).filter((r) => r.status === 'libre').length;
    const pct = total ? (c.occToNight / total * 100).toFixed(1).replace('.', ',') : '0,0';
    return `<div class="hx-strip">
      <div class="hx-kpi"><div class="l">Occupation ce soir</div><div class="v">${c.occToNight} / ${total}</div><div class="d">${pct} % · se met à jour à chaque vente</div></div>
      <div class="hx-kpi"><div class="l">Libres · propres</div><div class="v">${free}</div><div class="d">prêtes à vendre</div></div>
      <div class="hx-kpi"><div class="l">À remettre à blanc</div><div class="v">${c.toClean}</div><div class="d">${c.toClean ? 'voir Ménage' : 'tout est propre ✓'}</div></div>
      <div class="hx-kpi"><div class="l">Tarif de base</div><div class="v">${cuState().baseRate == null ? '·' : fmt(cuState().baseRate) + ' <small>MAD</small>'}</div><div class="d">réglable dans Tarifs</div></div>
    </div>`;
  }
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
        label: 'Départ dépassé non clôturé',
        detail: 'Départ prévu le ' + cout,
      });
    }

    // In-house missing guest manifest
    if (b.status === 'checked_in') {
      if (guests.length < partySize) {
        errs.push({
          code: 'missing_manifest',
          severity: 'warn',
          label: 'Fiche incomplète (' + guests.length + '/' + partySize + ' pers.)',
          detail: 'Voyageurs physiques non enregistrés',
        });
      }
      guests.forEach((g, idx) => {
        const num = idx + 1;
        if (!g.idDocNumber || !g.idDocType) {
          errs.push({
            code: 'missing_identity',
            severity: 'danger',
            label: 'Pièce d’identité manquante (Voyageur ' + num + ')',
            detail: g.name || 'Nom non renseigné',
          });
        }
        if (!g.nationality) {
          errs.push({
            code: 'missing_nationality',
            severity: 'danger',
            label: 'Nationalité manquante (Voyageur ' + num + ')',
            detail: g.name || 'Nom non renseigné',
          });
        }
        if (!g.residenceCountry) {
          errs.push({
            code: 'missing_residence',
            severity: 'warn',
            label: 'Pays de résidence manquant (Voyageur ' + num + ')',
            detail: g.name || 'Nom non renseigné',
          });
        }
      });
    } else if ((b.status === 'confirmed' || b.status === 'requested') && cin <= today) {
      if (!guests.length) {
        errs.push({
          code: 'unconfirmed_arrival',
          severity: 'info',
          label: 'Arrivée & fiche en attente',
          detail: 'Arrivée prévue le ' + cin,
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
    const views = { arrivals: 'Arrivées', departures: 'Départs', inhouse: 'En maison maintenant', attention: 'Retards à vérifier' };
    const labels = { requested: 'Demandée', confirmed: 'Confirmée', checked_in: 'En maison', completed: 'Terminée' };
    const channels = { direct: 'Direct', booking: 'Booking.com', expedia: 'Expedia', airbnb: 'Airbnb', walkin: 'Walk-in', other: 'Autre' };
    const normalized = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const q = normalized(filter.q);
    const rooms = Object.values(R());
    const rows = (buckets[filter.view] || buckets.arrivals).filter((b) => {
      const room = rooms.find((r) => r.id === b.resourceId);
      return normalized([b.customer?.name, b.code, b.hotel.externalRef, room?.n, channels[b.hotel.channel]].join(' ')).includes(q);
    }).sort((a, b) => String(a.customer?.name || '').localeCompare(String(b.customer?.name || ''), 'fr'));
    const load = cuStayLoads.get(cuStayScope());
    return `<section class="block hx-daily" aria-label="Journal de réception">
      <div class="hx-daily-head"><div><span class="hx-kicker">JOURNAL DE RÉCEPTION</span><h3>${views[filter.view] || views.arrivals} · ${rows.length}</h3><p>Dates de séjour à l’heure du Maroc. Ouvrez un dossier pour modifier ses détails.</p></div><div class="hx-commercial-tools"><button type="button" class="hx-btn ghost" data-action="hx-commercial">Clients, agences & sociétés</button><button type="button" class="hx-btn ghost" data-action="hx-group-new">+ Réservation de groupe</button><button type="button" class="hx-btn atlas" data-action="hx-stay-new">+ Réservation</button></div></div>
      <div class="hx-daily-controls">
        <label>Date des mouvements<input type="date" data-hx-daily-date value="${esc(day)}"></label>
        <label>Vue<select data-hx-daily-view>${Object.entries(views).map(([key, label]) => `<option value="${key}" ${filter.view === key ? 'selected' : ''}>${label} (${buckets[key].length})</option>`).join('')}</select></label>
        <label class="hx-daily-search">Rechercher<input type="search" data-hx-daily-search value="${esc(filter.q)}" placeholder="Client, chambre, référence"></label>
        <button class="hx-btn ghost" data-action="hx-daily-apply">Afficher</button>
        <button class="hx-btn ghost" data-action="hx-daily-refresh" ${load?.loading ? 'disabled' : ''}>${load?.loading ? 'Actualisation…' : 'Actualiser'}</button>
      </div>
      ${load?.error ? `<p class="hx-daily-warning" role="status">${esc(load.error)}</p>` : ''}
      ${['inhouse', 'attention'].includes(filter.view) ? '<p class="hx-daily-note">Cette vue suit les statuts actuels, indépendamment de la date des mouvements choisie.</p>' : ''}
      <div class="hx-daily-list">${rows.map((b) => {
        const room = rooms.find((r) => r.id === b.resourceId);
        return `<article class="hx-daily-row"><div class="hx-daily-room">${room ? 'Ch. ' + esc(room.n) : 'Non attribuée'}</div><div class="hx-daily-guest"><b>${esc(b.customer?.name || 'Client')}</b><span>${esc(b.code || '')} · ${esc(channels[b.hotel.channel] || 'Autre')} ${b.hotel.externalRef ? '· ' + esc(b.hotel.externalRef) : ''}</span><span>${esc(b.hotel.checkIn)} → ${esc(b.hotel.checkOut)} · ${esc(b.partySize || 1)} pers. · ${esc(b.hotel.roomTypeName || '')}</span>${b.note ? `<span class="hx-daily-note">${esc(b.note)}</span>` : ''}</div><span class="hx-daily-status">${esc(labels[b.status] || b.status)}</span><button class="hx-btn ghost" data-action="hx-stay-edit" data-arg="${esc(b.id)}" aria-label="${esc('Ouvrir le dossier ' + (b.code || b.customer?.name || 'client'))}">Ouvrir le dossier</button></article>`;
      }).join('') || '<p class="hx-empty">Aucun dossier dans cette vue. Vérifiez la date, les filtres et l’état de l’actualisation.</p>'}</div>
      <p class="hx-daily-note">Les walk-ins encaissés séparément restent accessibles dans le plan des chambres et les folios. Cette liste présente les dossiers de réservation.</p>
    </section>`;
  }
  async function cuRefreshReception() {
    const scope = cuStayScope();
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Casablanca', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
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
      load.error = 'Liste en maison non vérifiée. Actualisez avant de vous fier aux effectifs.';
      cuStayLoads.set(scope, load);
    }
  }
  function cuReceptionBody() {
    const allStaysMap = cuAllStays();
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Casablanca', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

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
        const roomLabel = room ? ('Ch. ' + room.n) : (b.hotel.roomTypeName || 'Chambre');
        const badgesHtml = errs.map((e) => `<span class="hx-exc-badge ${e.severity}" title="${esc(e.detail)}">${esc(e.label)}</span>`).join('');
        return `<div class="hx-exc-row">
          <div>
            <div class="hx-exc-meta"><b>${esc(roomLabel)}</b> · ${esc(b.customer?.name || 'Client')} <span>(${b.hotel.checkIn} → ${b.hotel.checkOut})</span></div>
            <div class="hx-exc-badges">${badgesHtml}</div>
          </div>
          <button class="hx-btn ghost hx-btn-sm" data-action="hx-stay-edit" data-arg="${esc(b.id)}">Compléter fiche →</button>
        </div>`;
      }).join('');

      auditCard = `<div class="block hx-audit ${criticalCount ? 'danger' : 'warn'}">
        <div class="hx-audit-head">
          <div>
            <span class="hx-kicker hx-audit-kicker ${criticalCount ? 'danger' : 'warn'}">CONTRÔLE RÉCEPTION · REVUE INTERNE</span>
            <h3 class="hx-audit-title">
              ${criticalCount ? (criticalCount + ' dossier(s) à régulariser avant départ') : (warningCount + ' dossier(s) à compléter')}
            </h3>
            <p class="hx-audit-sub">Cohérence des fiches voyageurs et des départs — contrôle interne, sans valeur déclarative.</p>
          </div>
          <button class="hx-btn atlas hx-btn-sm" data-action="hx-monthly-closing">Contrôle mensuel</button>
        </div>
        <div class="hx-audit-list">
          ${itemsHtml}
        </div>
      </div>`;
    } else {
      auditCard = `<div class="block hx-audit ok">
        <div class="hx-audit-head">
          <div>
            <span class="hx-kicker hx-audit-kicker ok">CONTRÔLE RÉCEPTION · REVUE INTERNE</span>
            <div class="hx-audit-title">${activeStays.length > 0 ? 'Dossiers en maison cohérents (0 anomalie bloquante)' : 'Aucun séjour actif — le contrôle mensuel reste disponible'}</div>
          </div>
          <button class="hx-btn ghost hx-btn-sm" data-action="hx-monthly-closing">Contrôle mensuel</button>
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
    return cuTypes().map((t) => `<option value="${esc(t.id)}" ${t.id === selected ? 'selected' : ''}>${esc(t.name)}${t.rate == null ? '' : ' · ' + fmt(t.rate) + ' MAD'}</option>`).join('');
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
      tag: 'CONFIGURATION RAPIDE', title: 'Ajouter plusieurs chambres',
      desc: 'Une seule configuration pour tout un étage, une aile ou une catégorie.', width: 680,
      body: `<div class="hx-batch-intro">
          <span class="hx-batch-mark">01</span>
          <div><b>Indiquez simplement les numéros.</b><span>Une plage, des numéros séparés, ou les deux.</span></div>
          <code>101–108, 110, 112</code>
        </div>
        <div class="hx-room-form hx-room-form-batch">
          <label class="hx-room-form-wide hx-room-number-field"><span>Numéros des chambres</span><input data-hx-room-numbers inputmode="numeric" autocomplete="off" placeholder="101-108, 110, 112"><small>Kiwi créera chaque numéro sans doublon.</small></label>
          <label><span>Type de chambre</span><select data-hx-room-type-id>${cuTypeOptions(firstType)}</select><small>Même catégorie et tarif pour ce lot.</small></label>
          <label><span>Étage, aile ou section</span><select data-hx-room-floor-id>${floors.map((f) => `<option value="${esc(f.id)}" ${f.id === selectedFloorId ? 'selected' : ''}>${esc(f.name)}</option>`).join('')}</select><small>Gérez les noms et l’ordre depuis le plan.</small></label>
        </div>
        <div class="hx-batch-foot">
          <button class="hx-link-btn" type="button" data-action="hx-room-types">Gérer les types et tarifs</button>
          <button class="hx-btn atlas" type="button" data-action="hx-room-batch-save">Ajouter les chambres</button>
        </div>`,
    });
    m.el.querySelector('.kiwi-modal')?.classList.add('hx-hotel-modal', 'hx-batch-modal');
    openModal = { el: m.el, close: m.close };
  }
  function cuRoomEditor(n) {
    const room = cuState().rooms[+n];
    if (!room) return;
    const locked = ['occ', 'depart', 'arrivee'].includes(room.status);
    const status = room.status || 'libre';
    const m = K().modal({
      tag: 'CHAMBRE ' + room.n, title: 'Modifier la chambre',
      desc: 'Changez uniquement ce qui distingue cette chambre.', width: 560,
      body: `<div class="hx-room-form">
        <label><span>Numéro</span><input data-hx-room-number type="number" inputmode="numeric" min="1" max="9999" value="${room.n}"></label>
        <label><span>Type</span><select data-hx-room-type-id>${cuTypeOptions(room.typeId)}</select></label>
        <label><span>Étage / aile</span><select data-hx-room-floor-id>${cuFloorRows().map((f) => `<option value="${esc(f.id)}" ${f.id === room.floorId ? 'selected' : ''}>${esc(f.name)}</option>`).join('')}</select></label>
        <label><span>Vue</span><select data-hx-room-view>
          <option value="">Non spécifiée</option>
          ${cuAllViews().map((v) => `<option value="${esc(v)}" ${room.view === v ? 'selected' : ''}>Vue ${esc(cuViewLabel(v))}</option>`).join('')}
        </select></label>
        <label><span>État</span><select data-hx-room-status ${locked ? 'disabled' : ''}>
          <option value="libre" ${status === 'libre' ? 'selected' : ''}>Libre · propre</option>
          <option value="sale" ${status === 'sale' ? 'selected' : ''}>Libre · à nettoyer</option>
          <option value="hs" ${status === 'hs' ? 'selected' : ''}>Hors-service</option>
          ${locked ? `<option value="${status}" selected>${status === 'occ' ? 'Occupée' : status === 'depart' ? 'Départ du jour' : 'Arrivée attendue'}</option>` : ''}
        </select>${locked ? '<small>Le statut du séjour se gère depuis le folio.</small>' : ''}</label>
        <div class="hx-room-form-wide">
          <label><span>Caractéristiques & équipements</span>
            <div class="hx-char-checkboxes">
              ${cuAllCharacteristics().map((c) => `<label class="hx-char-label"><input type="checkbox" data-hx-room-char="${c.id}" ${(room.characteristics || []).includes(c.id) ? 'checked' : ''}> ${esc(cuCharLabel(c))}</label>`).join('')}
            </div>
          </label>
        </div>
        <div class="hx-room-form-wide">
          <label><span>Portes communicantes <small>· liaison réciproque directe</small></span>
            <select data-hx-room-connecting multiple size="3">
              ${Object.values(cuState().rooms || {}).filter((r) => r.n !== room.n).sort((a, b) => a.n - b.n).map((o) => `<option value="${esc(o.id)}" ${(room.connectingRoomIds || []).includes(o.id) ? 'selected' : ''}>Ch. ${o.n} · ${esc(roomTypeOf(o.n).name)} (${esc(o.floor)})</option>`).join('')}
            </select>
            <small>Maintenu automatiquement dans les deux sens.</small>
          </label>
        </div>
      </div>
      <div class="hx-room-form-actions">
        <button class="hx-btn warn" data-action="hx-room-delete-open" data-arg="${room.n}">Supprimer</button>
        <button class="hx-btn atlas" data-action="hx-room-save" data-arg="${room.n}">Enregistrer</button>
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
        <span class="hx-type-copy"><b>${esc(t.name)}</b><small>${count} chambre${count === 1 ? '' : 's'}</small></span>
        <span class="hx-type-rate">${t.rate == null ? 'Tarif général' : fmt(t.rate) + ' MAD'}<small>par nuit</small></span>
        <span class="hx-type-arrow">›</span>
      </button>`;
    }).join('');
    const m = K().modal({
      tag: 'CATÉGORIES', title: 'Types de chambres',
      desc: 'Vos noms et tarifs maison. Toute modification s’applique aux chambres de ce type.', width: 620,
      body: `<div class="hx-type-summary"><span>${cuTypes().length}</span><div><b>Catégories actives</b><small>Un seul réglage met à jour toutes les chambres concernées.</small></div></div>
        <div class="hx-type-list">${rows}</div>
        <button class="hx-type-add" type="button" data-action="hx-room-type-new">+ Créer un type de chambre</button>`,
    });
    m.el.querySelector('.kiwi-modal')?.classList.add('hx-hotel-modal', 'hx-types-modal');
    openModal = { el: m.el, close: m.close };
  }
  function cuPhotoEditorMarkup(photos) {
    return photos.length ? photos.map((p, i) => `<div class="hx-type-photo"><img src="${esc(p.url)}" alt="${esc(p.alt || '')}"><span>${i === 0 ? 'PHOTO PRINCIPALE' : (i + 1) + ' / ' + photos.length}</span><div><button type="button" data-action="hx-type-photo-move" data-arg="${i}:-1" ${i === 0 ? 'disabled' : ''} aria-label="Déplacer avant">←</button><button type="button" data-action="hx-type-photo-move" data-arg="${i}:1" ${i === photos.length - 1 ? 'disabled' : ''} aria-label="Déplacer après">→</button><button type="button" data-action="hx-type-photo-remove" data-arg="${i}" aria-label="Retirer la photo">×</button></div></div>`).join('') : '<div class="hx-type-photo-empty"><b>Aucune photo</b><span>Le visuel Kiwi reste affiché tant que vous n’ajoutez rien.</span></div>';
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
    if (!queue.length) { if (status) status.textContent = 'Choisissez une image JPG, PNG, WebP, GIF ou AVIF.'; return; }
    const uploader = window.KiwiPlatformOps?.uploads;
    if (!uploader?.upload) { if (status) status.textContent = 'Le stockage photo n’est pas disponible sur cet appareil.'; return; }
    for (let i = 0; i < queue.length; i++) {
      if (status) status.textContent = 'Préparation de la photo ' + (i + 1) + ' / ' + queue.length + '…';
      try {
        const ready = await cuShrinkHotelPhoto(queue[i]);
        const uploaded = await uploader.upload(ready, { merchant: window.KiwiStore?.slugFor?.(cuVenueId()) || '', scope: 'hotel-room', progress: (pct) => { if (status) status.textContent = 'Envoi ' + (i + 1) + ' / ' + queue.length + ' · ' + pct + ' %'; } });
        const photo = cuSafePhoto({ url: uploaded.url, alt: typeName + ' · photo ' + ((root.__hxPhotos || []).length + 1), updatedAt: cuStamp() }, (root.__hxPhotos || []).length, typeName);
        if (photo) root.__hxPhotos.push(photo);
        cuRenderPhotoEditor(root);
      } catch (error) {
        const code = error?.code || error?.message;
        if (status) status.textContent = code === 'too-large' ? 'Photo trop lourde même après compression.' : code === 'bad-type' ? 'Format photo non accepté.' : 'Envoi interrompu. Les autres photos restent intactes.';
        return;
      }
    }
    if (status) status.textContent = queue.length + ' photo' + (queue.length > 1 ? 's ajoutées' : ' ajoutée') + ' · enregistrez le type pour publier.';
  }
  function cuTypeEditor(id) {
    const type = id ? cuState().roomTypes[id] : null;
    const amenities = (type?.amenities || []).join(', ');
    const m = K().modal({
      tag: type ? 'TYPE DE CHAMBRE' : 'NOUVEAU TYPE',
      title: type ? 'Modifier « ' + esc(type.name) + ' »' : 'Créer un type',
      desc: 'Décrivez ce que le client verra sur votre lien de réservation.', width: 680,
      body: `<div class="hx-room-form hx-type-form">
        <label class="hx-room-form-wide"><span>Nom affiché</span><input data-hx-type-name maxlength="60" value="${esc(type?.name || '')}" placeholder="Ex. Suite Atlas"></label>
        <label class="hx-room-form-wide"><span>Tarif par nuit <small>· MAD · optionnel</small></span><input data-hx-type-rate type="number" inputmode="decimal" min="0" step="1" value="${type?.rate == null ? '' : type.rate}" placeholder="Utiliser le tarif général"></label>
        <div class="hx-room-form-wide"><span style="font-size:12px;font-weight:600;">Suppléments repas <small style="font-weight:400;">· MAD par personne et par nuit · optionnel · servent aux voyageurs sans compte commercial</small></span>
          <div class="hx-room-form hx-type-form" style="margin-top:6px;">
            <label><span>Petit-déjeuner</span><input data-hx-type-board-bb type="number" inputmode="decimal" min="0" step="1" value="${type?.boardRates?.bb ?? ''}" placeholder="—"></label>
            <label><span>Demi-pension · déjeuner</span><input data-hx-type-board-hb_lunch type="number" inputmode="decimal" min="0" step="1" value="${type?.boardRates?.hb_lunch ?? ''}" placeholder="—"></label>
            <label><span>Demi-pension · dîner</span><input data-hx-type-board-hb_dinner type="number" inputmode="decimal" min="0" step="1" value="${type?.boardRates?.hb_dinner ?? ''}" placeholder="—"></label>
            <label><span>Pension complète</span><input data-hx-type-board-full_board type="number" inputmode="decimal" min="0" step="1" value="${type?.boardRates?.full_board ?? ''}" placeholder="—"></label>
          </div>
        </div>
        <label class="hx-room-form-wide"><span>Description publique</span><textarea data-hx-type-description maxlength="300" rows="3" placeholder="Une chambre calme et lumineuse, idéale pour…">${esc(type?.description || '')}</textarea></label>
        <label><span>Voyageurs maximum</span><input data-hx-type-guests type="number" inputmode="numeric" min="1" max="12" value="${type?.maxGuests || 2}"></label>
        <label><span>Couchage</span><input data-hx-type-beds maxlength="80" value="${esc(type?.beds || '')}" placeholder="1 grand lit"></label>
        <label><span>Surface <small>· m²</small></span><input data-hx-type-size type="number" inputmode="numeric" min="1" max="999" value="${type?.sizeM2 || ''}" placeholder="24"></label>
        <label><span>Vue</span><input data-hx-type-view maxlength="80" value="${esc(type?.view || '')}" placeholder="Patio, médina, montagne…"></label>
        <label class="hx-room-form-wide"><span>Équipements <small>· séparés par des virgules</small></span><input data-hx-type-amenities maxlength="500" value="${esc(amenities)}" placeholder="Wi-Fi, climatisation, petit-déjeuner"></label>
        <section class="hx-type-photos hx-room-form-wide"><div class="hx-type-photos-head"><div><b>Galerie publique</b><span>8 photos maximum · la première devient la couverture</span></div><button class="hx-btn ghost" type="button" data-action="hx-type-photo-pick">+ Ajouter des photos</button><input data-hx-type-photo-input type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" multiple hidden></div><div class="hx-type-photo-grid" data-hx-type-photos></div><p data-hx-type-photo-status></p></section>
        <label class="hx-room-form-wide"><span><input data-hx-type-public type="checkbox" ${type?.public === false ? '' : 'checked'}> Visible sur le lien de réservation</span></label>
      </div>
      <div class="hx-room-form-actions">
        ${type ? `<button class="hx-btn warn" data-action="hx-room-type-delete" data-arg="${esc(type.id)}">Supprimer</button>` : '<span></span>'}
        <button class="hx-btn atlas" data-action="hx-room-type-save" data-arg="${esc(type?.id || 'new')}">Enregistrer</button>
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
        <span class="hx-floor-manager-copy"><b>${esc(f.name)}</b><small>${count} chambre${count === 1 ? '' : 's'}</small></span>
        <span class="hx-floor-manager-order">
          <button data-action="hx-floor-move" data-arg="${esc(f.id)}:-1" ${index === 0 ? 'disabled' : ''} aria-label="Monter">↑</button>
          <button data-action="hx-floor-move" data-arg="${esc(f.id)}:1" ${index === list.length - 1 ? 'disabled' : ''} aria-label="Descendre">↓</button>
        </span>
        <button class="hx-floor-manager-edit" data-action="hx-floor-edit" data-arg="${esc(f.id)}">Modifier</button>
      </div>`;
    }).join('');
    const m = K().modal({
      tag: 'ORGANISATION', title: 'Étages, ailes & sections',
      desc: 'Renommez, réordonnez ou supprimez vos sections sans perdre les chambres.', width: 620,
      body: `<div class="hx-floor-manager-list">${rows || '<p>Aucune section.</p>'}</div>
        <div style="display:flex;gap:10px;margin-top:12px;flex-wrap:wrap;">
          <button class="hx-type-add" type="button" data-action="hx-floor-new">+ ${trL({ fr: 'Créer une section', en: 'Create section', ar: 'إنشاء قسم' })}</button>
          <button class="hx-btn ghost" type="button" data-action="hx-views-manage-open">${trL({ fr: 'Vues & caractéristiques', en: 'Views & amenities', ar: 'الإطلالات والمميزات' })}</button>
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
      tag: 'CONFIGURATION',
      title: trL({ fr: 'Vues & caractéristiques', en: 'Views & amenities', ar: 'الإطلالات والمميزات' }),
      desc: trL({
        fr: 'Personnalisez les types de vues et les équipements proposés pour vos chambres.',
        en: 'Customize view types and amenities offered for your rooms.',
        ar: 'تخصيص أنواع الإطلالات والمميزات المتوفرة لغرفك.',
      }),
      width: 580,
      body: `<div style="display:flex;flex-direction:column;gap:18px;font-size:13px;color:var(--ink);">
        <section>
          <b style="display:block;margin-bottom:6px;">${trL({ fr: 'Types de vues', en: 'View types', ar: 'أنواع الإطلالات' })}</b>
          <div class="hx-views-config-list" style="margin-bottom:10px;">
            ${views.map((v) => `
              <span class="hx-view-config-chip">
                Vue ${esc(cuViewLabel(v))}
                <button type="button" data-action="hx-view-remove" data-arg="${esc(v)}" aria-label="${trL({ fr: 'Supprimer', en: 'Delete', ar: 'حذف' })}">×</button>
              </span>`).join('')}
          </div>
          <div style="display:flex;gap:8px;">
            <input data-hx-view-input type="text" maxlength="40" placeholder="${trL({ fr: 'Ex. Piscine intérieure, Montagne…', en: 'e.g. Mountain, Courtyard…', ar: 'مثال: جبل، فناء…' })}" style="flex:1;">
            <button class="hx-btn atlas" type="button" data-action="hx-view-add">${trL({ fr: '+ Ajouter une vue', en: '+ Add view', ar: '+ إضافة إطلالة' })}</button>
          </div>
        </section>
        <section>
          <b style="display:block;margin-bottom:6px;">${trL({ fr: 'Équipements & caractéristiques personnalisés', en: 'Custom amenities & characteristics', ar: 'تجهيزات ومميزات مخصصة' })}</b>
          <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:10px;">
            ${customs.length ? customs.map((c) => `
              <div class="hx-config-char-row">
                <span><b>${esc(cuCharLabel(c))}</b></span>
                <button class="hx-btn ghost" type="button" data-action="hx-char-remove" data-arg="${esc(c.id)}" style="color:var(--danger,#b91c1c);padding:2px 8px;font-size:12px;">${trL({ fr: 'Supprimer', en: 'Delete', ar: 'حذف' })}</button>
              </div>`).join('') : `<p style="margin:0;font-size:12px;color:var(--n-500);">${trL({ fr: 'Aucun équipement personnalisé. Les 8 équipements standards sont toujours disponibles.', en: 'No custom amenities. The 8 standard amenities are always available.', ar: 'لا توجد تجهيزات مخصصة. التجهيزات الـ 8 الأساسية متوفرة دائماً.' })}</p>`}
          </div>
          <div style="display:flex;gap:8px;">
            <input data-hx-char-input type="text" maxlength="50" placeholder="${trL({ fr: 'Ex. Jacuzzi privatif, Machine Nespresso…', en: 'e.g. Private hot tub, Espresso machine…', ar: 'مثال: جاكوزي خاص، آلة قهوة…' })}" style="flex:1;">
            <button class="hx-btn atlas" type="button" data-action="hx-char-add">${trL({ fr: '+ Ajouter un équipement', en: '+ Add amenity', ar: '+ إضافة ميزة' })}</button>
          </div>
        </section>
      </div>
      <div class="hx-room-form-actions">
        <button class="hx-btn ghost" data-action="hx-views-manage-close">${trL({ fr: 'Fermer', en: 'Close', ar: 'إغلاق' })}</button>
      </div>`,
    });
    m.el.querySelector('.kiwi-modal')?.classList.add('hx-hotel-modal');
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
        <span class="hx-floor-manager-copy"><b>${esc(f.name)}</b><small>${count} chambre${count === 1 ? '' : 's'}</small></span>
        <span class="hx-floor-manager-order">
          <button data-action="hx-floor-move" data-arg="${esc(f.id)}:-1" ${index === 0 ? 'disabled' : ''} aria-label="Monter">↑</button>
          <button data-action="hx-floor-move" data-arg="${esc(f.id)}:1" ${index === list.length - 1 ? 'disabled' : ''} aria-label="Descendre">↓</button>
        </span>
        <button class="hx-floor-manager-edit" data-action="hx-floor-edit" data-arg="${esc(f.id)}">Modifier</button>
      </div>`;
    }).join('');
    listEl.innerHTML = rows || '<p>Aucune section.</p>';
  }
  function cuRefreshFloorSelectors() {
    if (typeof document === 'undefined' || !document.querySelectorAll) return;
    const floors = cuFloorRows();
    document.querySelectorAll('select[data-hx-room-floor-id], select[data-hx-bulk-floor-id]').forEach((sel) => {
      const currentVal = sel.value;
      const isBulk = sel.hasAttribute('data-hx-bulk-floor-id');
      const prefix = isBulk ? '<option value="">Ne pas modifier</option>' : '';
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
      tag: floor ? 'SECTION' : 'NOUVELLE SECTION', title: floor ? 'Modifier « ' + esc(floor.name) + ' »' : 'Créer une section',
      desc: floor ? count + ' chambre' + (count === 1 ? '' : 's') + ' dans cette section.' : 'Ex. 1er étage, Patio, Aile Atlas…', width: 500,
      body: `<div class="hx-room-form"><label class="hx-room-form-wide"><span>Nom affiché</span><input data-hx-floor-name maxlength="60" value="${esc(floor?.name || '')}" placeholder="Ex. 1er étage"></label></div>
        <p class="hx-floor-error" data-hx-floor-error style="color:var(--danger,#b91c1c);font-size:12px;margin:8px 0 0;" hidden></p>
        ${floor && count && others.length ? `<label class="hx-floor-delete-target"><span>En cas de suppression, déplacer les chambres vers</span><select data-hx-floor-target>${others.map((f) => `<option value="${esc(f.id)}">${esc(f.name)}</option>`).join('')}</select></label>` : ''}
        <div class="hx-room-form-actions">
          ${floor ? `<button class="hx-btn warn" data-action="hx-floor-delete" data-arg="${esc(floor.id)}" ${count && !others.length ? 'disabled title="Créez une autre section avant de supprimer celle-ci"' : ''}>Supprimer</button>` : '<span></span>'}
          <button class="hx-btn atlas" data-action="hx-floor-save" data-arg="${esc(floor?.id || 'new')}">Enregistrer</button>
        </div>`,
    });
    m.el.querySelector('.kiwi-modal')?.classList.add('hx-hotel-modal');
    openModal = { el: m.el, close: m.close };
  }
  function cuFloors() {
    const st = cuState();
    return cuFloorRows().map((f) => ({ id: f.id, lbl: f.name, rooms: Object.keys(st.rooms).map(Number).filter((n) => st.rooms[n].floorId === f.id).sort((a, b) => a - b) }));
  }
  function cuRoomStatus(room) {
    if (room.status === 'occ') return { key: 'occ', label: 'Occupée' };
    if (room.status === 'depart') return { key: 'occ', label: 'Départ aujourd’hui' };
    if (room.status === 'arrivee') return { key: 'arrivee', label: 'Arrivée attendue' };
    if (room.status === 'sale') return { key: 'sale', label: 'À nettoyer' };
    if (room.status === 'hs') return { key: 'hs', label: 'Hors-service' };
    return { key: 'libre', label: 'Libre · propre' };
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
        r.guest,
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
      chips.push(`<span class="hx-filter-chip"><span>Section : ${esc(cuRackFilter.floor)}</span><button type="button" data-action="hx-filter-remove" data-arg="floor:${esc(cuRackFilter.floor)}" aria-label="Retirer ce filtre">×</button></span>`);
    }
    for (const fid of cuRackFilter.floors) {
      const name = st.floors[fid]?.name || fid;
      chips.push(`<span class="hx-filter-chip"><span>Section : ${esc(name)}</span><button type="button" data-action="hx-filter-remove" data-arg="floors:${esc(fid)}" aria-label="Retirer ce filtre">×</button></span>`);
    }
    for (const cid of cuRackFilter.categories) {
      const name = st.roomTypes[cid]?.name || cid;
      chips.push(`<span class="hx-filter-chip"><span>Type : ${esc(name)}</span><button type="button" data-action="hx-filter-remove" data-arg="categories:${esc(cid)}" aria-label="Retirer ce filtre">×</button></span>`);
    }
    if (cuRackFilter.status !== 'all') {
      const statusLabels = { libre: 'Libre · propre', occ: 'Occupée / Départ', arrivee: 'Arrivée attendue', sale: 'À nettoyer', hs: 'Hors-service' };
      const lbl = statusLabels[cuRackFilter.status] || cuRackFilter.status;
      chips.push(`<span class="hx-filter-chip"><span>État : ${esc(lbl)}</span><button type="button" data-action="hx-filter-remove" data-arg="status:${esc(cuRackFilter.status)}" aria-label="Retirer ce filtre">×</button></span>`);
    }
    if (cuRackFilter.hasView) {
      chips.push(`<span class="hx-filter-chip"><span>Avec vue</span><button type="button" data-action="hx-filter-remove" data-arg="hasView" aria-label="Retirer ce filtre">×</button></span>`);
    }
    for (const v of cuRackFilter.views) {
      chips.push(`<span class="hx-filter-chip"><span>Vue ${esc(v)}</span><button type="button" data-action="hx-filter-remove" data-arg="views:${esc(v)}" aria-label="Retirer ce filtre">×</button></span>`);
    }
    for (const c of cuRackFilter.characteristics) {
      const lbl = cuCharLabel(c);
      chips.push(`<span class="hx-filter-chip"><span>${esc(lbl)}</span><button type="button" data-action="hx-filter-remove" data-arg="characteristics:${esc(c)}" aria-label="Retirer ce filtre">×</button></span>`);
    }
    if (cuRackFilter.connectingOnly) {
      chips.push(`<span class="hx-filter-chip"><span>Communicantes</span><button type="button" data-action="hx-filter-remove" data-arg="connectingOnly" aria-label="Retirer ce filtre">×</button></span>`);
    }
    if (cuRackFilter.minCapacity > 0) chips.push(`<span class="hx-filter-chip"><span>≥ ${cuRackFilter.minCapacity} ${trL({fr:'voyageurs',en:'guests',ar:'ضيوف'})}</span><button type="button" data-action="hx-filter-remove" data-arg="minCapacity" aria-label="Retirer ce filtre">×</button></span>`);
    if (cuRackFilter.q) {
      chips.push(`<span class="hx-filter-chip"><span>« ${esc(cuRackFilter.q)} »</span><button type="button" data-action="hx-filter-remove" data-arg="q" aria-label="Retirer ce filtre">×</button></span>`);
    }

    return `<div class="hx-filter-chips-wrap">
      <div class="hx-filter-chips">${chips.join('')}</div>
      <button type="button" class="hx-filter-reset-btn" data-action="hx-room-filter-reset">Effacer les filtres</button>
      <span class="hx-room-matching-count">${matchingCount} chambre${matchingCount > 1 ? 's' : ''} affichée${matchingCount > 1 ? 's' : ''} sur ${totalCount}</span>
    </div>`;
  }
  function cuRackBody() {
    cuEnsureFilterVenue();
    const pendingBulk = cuPendingBulk();
    const all = Object.values(R());
    const counts = {
      all: all.length,
      libre: all.filter((r) => r.status === 'libre').length,
      occ: all.filter((r) => ['occ', 'depart'].includes(r.status)).length,
      arrivee: all.filter((r) => r.status === 'arrivee').length,
      sale: all.filter((r) => r.status === 'sale').length,
      hs: all.filter((r) => r.status === 'hs').length,
    };
    const compactProperty = all.length <= 20;
    const floorRows = cuFloors();

    const floorTabs = [`<button class="${(!cuRackFilter.floor || cuRackFilter.floor === 'all') && cuRackFilter.floors.size === 0 ? 'on' : ''}" data-action="hx-room-floor" data-arg="all">Tous les étages <b>${counts.all}</b></button>`]
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
            <div><b>${esc(f.lbl)}</b><span>0 chambre</span></div>
            <div class="hx-floor-head-actions">
              <button data-action="hx-floor-edit" data-arg="${esc(f.id)}">Gérer</button>
              <button data-action="hx-room-add-floor" data-arg="${esc(f.id)}">+ Ajouter des chambres</button>
            </div>
          </div>
          <div class="hx-room-empty-section-hint">Cette section ne contient encore aucune chambre.</div>
        </section>`);
        return;
      }

      if (matchedRooms.length === 0) {
        if (cuRackFilter.floor !== 'all' || cuRackFilter.floors.size > 0) {
          renderedSections.push(`<section class="hx-floor-section" data-hx-floor-section>
            <div class="hx-floor-head">
              <div><b>${esc(f.lbl)}</b><span>0 affichée</span></div>
              <div class="hx-floor-head-actions">
                <button data-action="hx-floor-edit" data-arg="${esc(f.id)}">Gérer</button>
                <button data-action="hx-room-add-floor" data-arg="${esc(f.id)}">+ Ajouter ici</button>
              </div>
            </div>
            <div class="hx-room-empty-section-hint">Aucune chambre ne correspond aux filtres dans cette section.</div>
          </section>`);
        }
        return;
      }

      const roomCards = matchedRooms.map((r) => {
        const status = cuRoomStatus(r);
        const type = roomTypeOf(r.n);
        const doc = window.KiwiReservations?.get?.() || { bookings: [] };
        const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Casablanca', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
        const roomStay = (doc.bookings || []).find((b) => b.resourceId === r.id && b.status === 'checked_in');
        const roomErrs = roomStay ? cuEvaluateStayExceptions(roomStay, today) : [];
        const exChip = roomErrs.length ? `<span class="hx-exc-chip" title="${esc(roomErrs.map((e) => e.label).join(' · '))}">Incomplet</span>` : '';
        const isSelected = cuSelectedRooms.has(String(r.id));

        const viewBadge = r.view ? `<span class="hx-room-view-badge" title="Vue ${esc(r.view)}">Vue ${esc(r.view)}</span>` : '';
        const connBadge = (r.connectingRoomIds && r.connectingRoomIds.length) ? `<span class="hx-room-conn-badge" title="Portes communicantes (${r.connectingRoomIds.length})">⇌</span>` : '';

        const selectCb = cuSelectionMode ? `<label class="hx-room-select-cb"><input type="checkbox" data-action="hx-room-check" data-arg="${r.n}" ${isSelected ? 'checked' : ''} aria-label="Sélectionner la chambre ${r.n}"></label>` : '';

        return `<div class="hx-room st-${r.status} ${isSelected ? 'selected' : ''} ${cuSelectionMode ? 'selection-mode' : ''}" role="button" tabindex="0" aria-label="Chambre ${r.n}" data-action="hx-room" data-arg="${r.n}" data-hx-room-card>
          ${selectCb}
          ${cuSelectionMode ? '' : `<button class="hx-room-edit" type="button" data-action="hx-room-edit" data-arg="${r.n}" aria-label="Modifier la chambre ${r.n}" title="Modifier">✎</button>`}
          <div class="hx-room-top"><span class="no">${r.n}</span><span class="hx-room-state ${status.key}">${esc(status.label)}</span>${exChip}${connBadge}</div>
          <div class="ty" style="display:flex;align-items:center;justify-content:space-between;gap:6px;"><span>${esc(type.name)}</span>${viewBadge}</div>
          <div class="hx-room-bottom"><span class="gu">${esc(r.guest || (r.status === 'libre' ? 'Prête à vendre' : r.meta || status.label))}</span><span class="hx-room-price">${type.base == null ? '·' : fmt(type.base)}<small>${type.base == null ? '' : ' MAD'}</small></span></div>
        </div>`;
      }).join('');

      renderedSections.push(`<section class="hx-floor-section" data-hx-floor-section>
        <div class="hx-floor-head">
          <div><b>${esc(f.lbl)}</b><span>${matchedRooms.length} affichée${matchedRooms.length === 1 ? '' : 's'}</span></div>
          <div class="hx-floor-head-actions">
            <button data-action="hx-floor-edit" data-arg="${esc(f.id)}">Gérer</button>
            <button data-action="hx-room-add-floor" data-arg="${esc(f.id)}">+ Ajouter ici</button>
          </div>
        </div>
        <div class="hx-rack">${roomCards}</div>
      </section>`);
    });

    const floorSections = renderedSections.join('');

    if (!totalRooms()) return `<div class="hx-page hx-room-workspace">
      <div class="hx-room-empty">
        <div class="hx-room-empty-art"><span>101</span><span>102</span><span>103</span></div>
        <div class="hx-room-empty-copy"><span class="hx-eyebrow">CONFIGURATION EN 2 MINUTES</span><h3>Construisez votre hôtel par étage.</h3>
          <p>Créez vos types une fois, puis ajoutez 10, 50 ou 100 chambres avec les mêmes réglages.</p>
          <div class="hx-room-empty-actions"><button class="hx-btn atlas" data-action="hx-room-add">Ajouter plusieurs chambres</button><button class="hx-btn ghost" data-action="hx-room-types">Configurer les types</button></div>
          <div class="hx-room-empty-notes"><span>✓ Numéros par plage</span><span>✓ Tarifs par type</span><span>✓ Connecté au ménage</span></div>
        </div>
      </div>
    </div>`;

    const noMatch = !floorSections ? `<div class="hx-room-no-match"><b>Aucune chambre ne correspond.</b><span>Changez l’étage, le statut, les caractéristiques ou la recherche.</span><button class="hx-link-btn" data-action="hx-room-filter-reset">Réinitialiser les filtres</button></div>` : '';

    const kpis = [
      ['all', '', 'Total', 'inventaire'], ['libre', 'ready', 'Prêtes', 'à vendre'],
      ['occ', 'occupied', 'Occupées', 'en maison'], ['arrivee', 'arrival', 'Arrivées', 'attendues'],
      ['sale', 'dirty', 'À nettoyer', 'ménage'], ['hs', 'offline', 'Hors-service', 'maintenance'],
    ].filter(([key]) => !compactProperty || ['all', 'libre', 'occ', 'sale'].includes(key) || counts[key] > 0);

    const filterCount = cuActiveFilterCount();
    const chipsHtml = cuFilterChipsMarkup(matchingTotal, all.length);

    const selectedList = cuSelectedNumbers();
    const visibleSelected = selectedList.filter((n) => cuRoomMatchesFilter(R()[n])).length;
    const hiddenSelected = selectedList.length - visibleSelected;

    let bulkBar = '';
    if (cuSelectionMode || selectedList.length > 0) {
      bulkBar = `<div class="hx-room-bulk-bar" role="region" aria-label="Sélection groupée">
        <div class="hx-room-bulk-info">
          <b>${selectedList.length} chambre${selectedList.length > 1 ? 's' : ''} sélectionnée${selectedList.length > 1 ? 's' : ''}</b>
          ${hiddenSelected > 0 ? `<small>(${hiddenSelected} masquée${hiddenSelected > 1 ? 's' : ''} par les filtres)</small>` : ''}
        </div>
        <div class="hx-room-bulk-actions">
          <button class="hx-btn ghost" data-action="hx-room-select-filtered">Sélectionner les résultats filtrés</button>
          <button class="hx-btn ghost" data-action="hx-room-select-none" ${selectedList.length === 0 ? 'disabled' : ''}>Tout désélectionner</button>
          <button class="hx-btn atlas" data-action="hx-room-bulk-edit-open" ${selectedList.length === 0 ? 'disabled' : ''}>Modifier</button>
          <button class="hx-btn ghost" data-action="hx-room-select-cancel">Annuler</button>
        </div>
      </div>`;
    }

    return `<div class="hx-page hx-room-workspace ${compactProperty ? 'hx-room-compact-property' : ''}">
      <div class="hx-room-section-tabs" role="tablist" aria-label="Espaces hôtel">
        <button class="on" role="tab" aria-selected="true" data-action="nav-chambres"><span>Plan</span><small>${counts.all} chambres</small></button>
        <button role="tab" aria-selected="false" data-action="nav-menage"><span>Ménage</span><small>${counts.sale} à nettoyer</small></button>
        <button role="tab" aria-selected="false" data-action="nav-tarifs"><span>Tarifs</span><small>par catégorie</small></button>
      </div>
      <div class="hx-room-kpis" style="--hx-kpi-count:${kpis.length}">${kpis.map(([key, cls, label, note]) => `<button class="${cls} ${cuRackFilter.status === key ? 'on' : ''}" data-action="hx-room-status" data-arg="${key}"><span>${label}</span><b>${counts[key]}</b><small>${note}</small></button>`).join('')}</div>
      <div class="hx-room-toolbar">
        ${compactProperty ? '<div class="hx-room-compact-hint">Touchez une chambre pour la vendre ou ouvrir son folio.</div>' : `<label class="hx-room-search"><span>⌕</span><input data-hx-room-search value="${esc(cuRackFilter.q)}" placeholder="Rechercher une chambre, un client, vue…"><button data-action="hx-room-search">Rechercher</button></label>`}
        <div class="hx-room-toolbar-actions">
          <button class="hx-btn ghost" data-action="hx-room-filters-open">Filtres ${filterCount ? `<b>(${filterCount})</b>` : ''}</button>
          <button class="hx-btn ${cuSelectionMode ? 'atlas' : 'ghost'}" data-action="hx-room-select-toggle">${cuSelectionMode ? 'Quitter la sélection' : 'Sélectionner'}</button>
          <button class="hx-btn ghost" data-action="hx-floors">Gérer les sections</button>
          <button class="hx-btn ghost" data-action="hx-room-types">Gérer les catégories</button>
          <button class="hx-btn atlas" data-action="hx-room-add">+ Ajouter des chambres</button>
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
      tag: 'FILTRES',
      title: 'Filtrer le plan des chambres',
      desc: trL({fr:'Combinez les critères : plusieurs étages ou vues, et tous les équipements cochés.',en:'Combine criteria: any selected floor or view, and all selected amenities.',ar:'اجمع المعايير: أي طابق أو إطلالة محددة، وجميع الميزات المحددة.'}),
      width: 580,
      body: `<div class="hx-room-form">
        <fieldset class="hx-filter-group hx-room-form-wide">
          <legend>Sections & étages</legend>
          <div class="hx-filter-checkbox-grid">
            ${floors.map((f) => `<label class="hx-filter-check-label"><input type="checkbox" data-hx-filter-floor="${esc(f.id)}" ${cuRackFilter.floors.has(f.id) || cuRackFilter.floor === f.lbl ? 'checked' : ''}> ${esc(f.name)}</label>`).join('')}
          </div>
        </fieldset>
        <fieldset class="hx-filter-group hx-room-form-wide">
          <legend>Catégories & types</legend>
          <div class="hx-filter-checkbox-grid">
            ${types.map((t) => `<label class="hx-filter-check-label"><input type="checkbox" data-hx-filter-cat="${esc(t.id)}" ${cuRackFilter.categories.has(t.id) ? 'checked' : ''}> ${esc(t.name)}</label>`).join('')}
          </div>
        </fieldset>
        <fieldset class="hx-filter-group hx-room-form-wide">
          <legend>Vues</legend>
          <div style="margin-bottom:8px;">
            <label class="hx-filter-check-label"><input type="checkbox" data-hx-filter-hasview ${cuRackFilter.hasView ? 'checked' : ''}> <b>Toutes les chambres avec vue</b></label>
          </div>
          <div class="hx-filter-checkbox-grid">
            ${views.map((v) => `<label class="hx-filter-check-label"><input type="checkbox" data-hx-filter-view="${esc(v)}" ${cuRackFilter.views.has(v) ? 'checked' : ''}> Vue ${esc(cuViewLabel(v))}</label>`).join('')}
          </div>
        </fieldset>
        <fieldset class="hx-filter-group hx-room-form-wide">
          <legend>Caractéristiques & équipements (tous requis)</legend>
          <div class="hx-filter-checkbox-grid">
            ${cuAllCharacteristics().map((c) => `<label class="hx-filter-check-label"><input type="checkbox" data-hx-filter-char="${esc(c.id)}" ${cuRackFilter.characteristics.has(c.id) ? 'checked' : ''}> ${esc(cuCharLabel(c))}</label>`).join('')}
          </div>
        </fieldset>
        <fieldset class="hx-filter-group hx-room-form-wide">
          <legend>Agencement & portes</legend>
          <label class="hx-filter-check-label"><input type="checkbox" data-hx-filter-connecting ${cuRackFilter.connectingOnly ? 'checked' : ''}> <b>Uniquement chambres communicantes</b></label>
        </fieldset>
      </div>
      <label class="hx-room-form-field">${trL({fr:'Capacité minimale',en:'Minimum capacity',ar:'الحد الأدنى للسعة'})}<input type="number" min="0" max="12" step="1" data-hx-filter-capacity value="${cuRackFilter.minCapacity || 0}"></label>
      <div class="hx-room-form-actions">
        <button class="hx-btn ghost" data-action="hx-filter-modal-reset">Effacer tout</button>
        <button class="hx-btn atlas" data-action="hx-filter-modal-apply">Appliquer les filtres</button>
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
      K().toast('Aucune chambre sélectionnée', { type: 'warn' });
      return;
    }
    draft = draft || cuBulkStaged || {};
    const st = cuState();
    const floors = cuFloorRows();
    const types = cuTypes();
    const views = cuAllViews();
    const characteristics = cuAllCharacteristics();

    const m = K().modal({
      tag: 'MODIFICATION EN BLOC',
      title: 'Modifier ' + selectedNumbers.length + ' chambres',
      desc: 'Seuls les champs avec une modification sélectionnée seront mis à jour.',
      width: 580,
      body: `<div class="hx-room-form">
        <label><span>Section / Étage</span>
          <select data-hx-bulk-floor-id>
            <option value="">Ne pas modifier</option>
            ${floors.map((f) => `<option value="${esc(f.id)}" ${draft.floorId === f.id ? 'selected' : ''}>${esc(f.name)}</option>`).join('')}
          </select>
        </label>
        <label><span>Catégorie / Type</span>
          <select data-hx-bulk-type-id>
            <option value="">Ne pas modifier</option>
            ${types.map((t) => `<option value="${esc(t.id)}" ${draft.typeId === t.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}
          </select>
        </label>
        <label><span>Vue</span>
          <select data-hx-bulk-view>
            <option value="">Ne pas modifier</option>
            <option value="__CLEAR__" ${draft.view === '' ? 'selected' : ''}>Retirer la vue</option>
            ${views.map((v) => `<option value="${esc(v)}" ${draft.view === v ? 'selected' : ''}>Vue ${esc(cuViewLabel(v))}</option>`).join('')}
          </select>
        </label>
        <label><span>Action sur les équipements</span>
          <select data-hx-bulk-char-mode>
            <option value="none" ${(!draft.charMode || draft.charMode === 'none') ? 'selected' : ''}>Ne pas modifier</option>
            <option value="add" ${draft.charMode === 'add' ? 'selected' : ''}>Ajouter les équipements cochés</option>
            <option value="remove" ${draft.charMode === 'remove' ? 'selected' : ''}>Retirer les équipements cochés</option>
            <option value="replace" ${draft.charMode === 'replace' ? 'selected' : ''}>Remplacer par les équipements cochés</option>
          </select>
        </label>
        <div class="hx-room-form-wide">
          <label><span>Équipements concernés</span>
            <div class="hx-char-checkboxes">
              ${characteristics.map((c) => `<label class="hx-char-label"><input type="checkbox" data-hx-bulk-char="${c.id}" ${(draft.characteristics || []).includes(c.id) ? 'checked' : ''}> ${esc(cuCharLabel(c))}</label>`).join('')}
            </div>
          </label>
        </div>
        <p style="font-size:11.5px;color:var(--n-500);margin:8px 0 0;" class="hx-room-form-wide">
          Note : Les portes communicantes se configurent chambre par chambre pour garantir la réciprocité physique des accès.
        </p>
      </div>
      <div class="hx-room-form-actions">
        <button class="hx-btn ghost" data-action="hx-bulk-cancel">Annuler</button>
        <button class="hx-btn atlas" data-action="hx-bulk-review">Vérifier avant d’appliquer…</button>
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
      summaryItems.push(`<li>Déplacer vers la section <b>${esc(st.floors[changes.floorId]?.name || changes.floorId)}</b></li>`);
    }
    if (changes.typeId) {
      summaryItems.push(`<li>Changer de type vers <b>${esc(st.roomTypes[changes.typeId]?.name || changes.typeId)}</b></li>`);
    }
    if (changes.view != null) {
      summaryItems.push(changes.view === '' ? `<li>Retirer la vue</li>` : `<li>Définir la vue à <b>Vue ${esc(cuViewLabel(changes.view))}</b></li>`);
    }
    if (changes.charMode && changes.charMode !== 'none') {
      const labels = (changes.characteristics || []).map((cid) => cuCharLabel(cid)).join(', ');
      const modeLabel = changes.charMode === 'add' ? 'Ajouter' : changes.charMode === 'remove' ? 'Retirer' : 'Remplacer par';
      summaryItems.push(`<li>Équipements : <b>${modeLabel}</b> ${labels ? `(${esc(labels)})` : '(aucun)'}</li>`);
    }

    const m = K().modal({
      tag: 'CONFIRMATION',
      title: 'Confirmer la modification de ' + selectedNumbers.length + ' chambres',
      desc: 'Vérifiez attentivement les modifications avant enregistrement.',
      width: 540,
      body: `<div style="display:flex;flex-direction:column;gap:14px;font-size:13px;color:var(--ink);">
        <div style="padding:12px 14px;background:var(--n-50,#f7f8f7);border-radius:10px;">
          <b>${selectedNumbers.length} chambres concernées :</b>
          <p style="margin:4px 0 0;color:var(--n-600);font-family:var(--mono);font-size:12px;line-height:1.5;">
            ${selectedNumbers.map((n) => 'Ch. ' + n).join(', ')}
          </p>
        </div>
        <div>
          <b>Modifications qui seront appliquées :</b>
          <ul style="margin:6px 0 0 18px;padding:0;line-height:1.6;">
            ${summaryItems.join('')}
          </ul>
        </div>
        <p style="margin:0;font-size:11.5px;color:var(--n-500);line-height:1.5;padding:10px 12px;background:var(--surface,#fff);border:1px solid var(--n-200);border-radius:8px;">
          Cette modification corrige l’organisation des chambres. Elle ne déplace aucun client et ne modifie aucun folio, séjour ou tarif existant.
        </p>
      </div>
      <div class="hx-room-form-actions">
        <p data-hx-bulk-error role="alert" hidden></p>
        <button class="hx-btn ghost" data-action="hx-bulk-back" ${plan?.submitted ? 'disabled' : ''}>Retour</button>
        <button class="hx-btn atlas" data-action="hx-bulk-confirm" ${plan?.needsReview ? 'disabled' : ''}>Confirmer et appliquer</button>
      </div>`,
    });
    m.el.querySelector('.kiwi-modal')?.classList.add('hx-hotel-modal');
    openModal = { el: m.el, close: m.close };
  }
  function cuMenageBody() {
    const dirty = Object.values(R()).filter((r) => r.status === 'sale');
    const clean = Object.values(R()).filter((r) => r.status === 'libre').length;
    const occupied = Object.values(R()).filter((r) => ['occ', 'depart'].includes(r.status)).length;
    const offline = Object.values(R()).filter((r) => r.status === 'hs').length;
    const rows = dirty.map((r) => `
      <div class="hx-q">
        <i class="dot" style="background:var(--warning);"></i>
        <div><div class="nm">Ch. ${r.n} · ${esc(roomTypeOf(r.n).name)}</div><div class="nt">${esc(r.floor)} · ${esc(r.meta || 'À remettre à blanc')}</div></div>
        <span class="hx-pill late">À FAIRE</span>
        <button class="hx-btn ghost" data-action="hx-hk-done" data-arg="${r.n}">Marquer propre</button>
      </div>`).join('');
    return `<div class="hx-page hx-room-workspace">
      <div class="hx-room-section-tabs" role="tablist" aria-label="Espaces hôtel">
        <button role="tab" aria-selected="false" data-action="nav-chambres"><span>Plan</span><small>${Object.values(R()).length} chambres</small></button>
        <button class="on" role="tab" aria-selected="true" data-action="nav-menage"><span>Ménage</span><small>${dirty.length} à nettoyer</small></button>
        <button role="tab" aria-selected="false" data-action="nav-tarifs"><span>Tarifs</span><small>par catégorie</small></button>
      </div>
      <div class="hx-room-kpis hx-hk-kpis">
        <button><span>À nettoyer</span><b>${dirty.length}</b><small>file active</small></button>
        <button class="ready"><span>Prêtes</span><b>${clean}</b><small>à vendre</small></button>
        <button class="occupied"><span>Occupées</span><b>${occupied}</b><small>en maison</small></button>
        <button class="offline"><span>Hors-service</span><b>${offline}</b><small>maintenance</small></button>
      </div>
      <div class="hx-h"><span class="t">File de remise à blanc</span><span class="s">chaque départ encaissé arrive ici automatiquement</span><button class="hx-btn ghost" data-action="nav-chambres">Voir le plan</button></div>
      <div class="block" style="padding:8px 14px;">
        ${dirty.length ? `<div class="hx-list">${rows}</div>` : cuStarter(
          'Tout est propre.',
          'Quand un départ est encaissé, sa chambre arrive ici pour remise à blanc, assignable à votre équipe.',
          ['File priorisée par les arrivées du soir', 'Assignation femme de chambre en un geste', 'Temps de rotation mesuré automatiquement']
        )}
      </div>
    </div>`;
  }
  function cuTarifsBody() {
    const st = cuState();
    const typeCards = cuTypes().map((t) => {
      const roomCount = Object.values(st.rooms).filter((r) => r.typeId === t.id).length;
      return `<button class="hx-type-card" data-action="hx-room-type-edit" data-arg="${esc(t.id)}">
        <span class="hx-type-icon">${esc(t.name.slice(0, 1).toUpperCase())}</span>
        <span class="hx-type-copy"><b>${esc(t.name)}</b><small>${roomCount} chambre${roomCount === 1 ? '' : 's'}</small></span>
        <span class="hx-type-rate">${t.rate == null ? (st.baseRate == null ? 'À définir' : fmt(st.baseRate) + ' MAD') : fmt(t.rate) + ' MAD'}<small>${t.rate == null ? 'tarif général' : 'par nuit'}</small></span>
        <span class="hx-type-arrow">›</span>
      </button>`;
    }).join('');
    return `<div class="hx-page">
      ${cuStrip()}
      <div class="hx-h"><span class="t">Tarif général</span><span class="s">utilisé uniquement par les types sans tarif propre</span><button class="hx-btn ghost" data-action="hx-commercial">Contrats agences & sociétés</button></div>
      <div class="block" style="padding:22px 14px;display:flex;align-items:center;justify-content:center;gap:20px;">
        <button class="hx-btn ghost" data-action="hx-cb-rate-step" data-arg="-50">−50</button>
        <div style="font-family:var(--mono);font-size:30px;font-weight:600;">${st.baseRate == null ? '·' : fmt(st.baseRate)} <span style="font-size:13px;color:var(--n-500);">MAD / nuit</span></div>
        <button class="hx-btn ghost" data-action="hx-cb-rate-step" data-arg="50">+50</button>
      </div>
      <div class="hx-h" style="margin-top:18px;"><span class="t">Tarifs par type</span><span class="s">un changement met à jour toutes les chambres concernées</span><button class="hx-btn atlas" data-action="hx-room-type-new">+ Nouveau type</button></div>
      <div class="hx-type-list">${typeCards}</div>
      <div class="block" style="padding:8px 14px;margin-top:14px;">
        ${cuStarter(
          'ADR, RevPAR et tarification IA s\'activent ici.',
          'Avec vos premières nuitées, Kiwi calcule votre prix moyen réel et suggère des tarifs par jour, weekends, saisons, Ramadan et Aïd compris.',
          ['Calendrier tarifaire par type de chambre', 'Suggestions IA appliquables en un geste', 'Occupation prévisionnelle sur 12 mois']
        )}
      </div>
    </div>`;
  }
  function cuFoliosBody() {
    const fl = Object.values(F());
    const rows = fl.map((f) => `
      <div class="hx-arr">
        <span class="tm">Ch. ${f.room}</span>
        <div class="who"><b>${f.guest}</b><div class="sub">${f.nights} nuit${f.nights > 1 ? 's' : ''} · ${f.pax} pers · ${f.lines.length} ligne${f.lines.length > 1 ? 's' : ''}</div></div>
        <span style="font-family:var(--mono);font-weight:600;">${MAD(folioTotal(f))}</span>
        <button class="hx-btn ghost" data-action="hx-folio" data-arg="${f.room}">Ouvrir</button>
      </div>`).join('');
    return `<div class="hx-page">
      <div class="hx-h"><span class="t">Folios ouverts · ${fl.length}</span><span class="s">une seule note par séjour, chambre + extras + taxe</span></div>
      <div class="block" style="padding:8px 14px;">
        ${fl.length ? `<div class="hx-list">${rows}</div>` : cuStarter(
          'Aucun folio ouvert.',
          'Chaque check-in ouvre la note du séjour : nuits, restaurant, spa et taxe de séjour s\'y regroupent jusqu\'à l\'encaissement du départ.',
          ['Charges restaurant / spa postées automatiquement', 'Taxe de séjour incluse ligne par ligne', 'Encaissement en un geste au check-out'],
          '<button class="hx-btn atlas" data-action="hx-walkin">+ Walk-in · ouvrir un premier folio</button>'
        )}
      </div>
    </div>`;
  }
  function cuSejoursBody() {
    const st = cuState();
    const rooms = Object.values(st.rooms || {}).sort((a, b) => a.n - b.n);
    const allStaysMap = cuAllStays();
    const active = { requested: 1, confirmed: 1, checked_in: 1 };
    const channels = { direct: 'Direct', booking: 'Booking.com', airbnb: 'Airbnb', expedia: 'Expedia', walkin: 'Walk-in', other: 'Autre OTA' };
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Casablanca', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const add = (ymd, n) => { const d = new Date(ymd + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
    const distance = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 86400000);
    const start = add(today, cuTapeOffset);
    const end = add(start, 14);
    const dates = Array.from({ length: 14 }, (_, i) => add(start, i));
    const real = Array.from(allStaysMap.values()).filter((b) => b.hotel && b.hotel.checkIn && b.hotel.checkOut && b.status !== 'cancelled' && b.status !== 'no_show');

    const matched = new Set(real.map((b) => b.resourceId));
    const walkins = Object.values(st.folios || {}).filter((f) => f && !matched.has(st.rooms?.[f.room]?.id)).map((f) => {
      const room = st.rooms?.[f.room], stamp = +f.updatedAt || Date.now();
      const cin = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Casablanca', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(stamp));
      return room ? { id: 'folio:' + room.id, resourceId: room.id, customer: { name: f.guest || room.guest || 'Walk-in' }, status: 'checked_in', hotel: { checkIn: cin, checkOut: add(cin, +f.nights || 1), channel: 'walkin', roomTypeName: roomTypeOf(room.n).name } } : null;
    }).filter(Boolean);
    const stays = real.concat(walkins);
    const hourFraction = (value, fallback) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value || '') ? (Number(value.slice(0,2)) + Number(value.slice(3))/60)/24 : fallback/24;
    const barsFor = (room) => stays.filter((b) => b.resourceId === room.id && b.hotel.checkIn < end && b.hotel.checkOut >= start).map((b) => {
      const from = Math.max(0, distance(start, b.hotel.checkIn) + hourFraction(b.hotel.arrivalTime,15));
      const to = Math.min(14, distance(start, b.hotel.checkOut) + hourFraction(b.hotel.departureTime,11));
      const channel = channels[b.hotel.channel] ? b.hotel.channel : (b.source === 'public' ? 'direct' : 'other');
      const left = from / 14 * 100, width = Math.max(.1, (to - from) / 14 * 100);
      const caption=(b.hotel.dayUse?'Day-use · '+b.hotel.arrivalTime+'–'+b.hotel.departureTime:channels[channel]);
      return `<button class="hx-cu-stay src-${channel} status-${esc(b.status)} ${b.hotel.conflict ? 'has-conflict' : ''}" style="left:${left}%;width:calc(${width}% - 1px)" data-action="hx-stay-edit" data-arg="${esc(b.id)}" title="${esc((b.hotel.conflict ? 'CONFLIT À RÉSOUDRE · ' : '') + (b.customer?.name || '') + ' · ' + caption + ' · ' + b.hotel.checkIn + ' → ' + b.hotel.checkOut)}"><b>${esc(b.customer?.name || 'Séjour')}</b><span>${b.hotel.conflict ? '⚠ CONFLIT' : esc(caption)}</span></button>`;
    }).join('');
    const dateHead = dates.map((d) => { const dt = new Date(d + 'T12:00:00Z'); return `<div class="${d === today ? 'today' : ''}"><b>${new Intl.DateTimeFormat('fr-FR', { weekday: 'short', timeZone: 'UTC' }).format(dt).replace('.', '')}</b><span>${dt.getUTCDate()}</span></div>`; }).join('');
    const rows = rooms.map((room) => `<div class="hx-cu-tape-row"><div class="hx-cu-room"><b>${room.n}</b><span>${esc(roomTypeOf(room.n).name)}</span></div><div class="hx-cu-days">${dates.map((d) => `<i class="${d === today ? 'today' : ''}"></i>`).join('')}${barsFor(room)}</div></div>`).join('');
    const occupancy = dates.map((d) => {
      const count = rooms.filter((r) => stays.some((b) => b.resourceId === r.id && active[b.status] && b.hotel.checkIn <= d && b.hotel.checkOut > d)).length;
      const pct = rooms.length ? Math.round(count / rooms.length * 100) : 0;
      return `<div class="${d === today ? 'today' : ''}" title="${count} / ${rooms.length} chambres"><b>${pct}%</b><span>${count}</span></div>`;
    }).join('');
    return `<div class="hx-page">
      ${cuStrip()}
      <div class="hx-cu-tape block">
        <div class="hx-cu-tape-head"><div><span class="hx-kicker">DISPONIBILITÉ UNIFIÉE</span><h3>Chambres × 14 jours</h3><p>Direct, saisie manuelle et OTA bloquent tous la même chambre.</p></div><div class="hx-cu-tape-actions"><button type="button" class="hx-btn ghost" data-action="hx-tape-prev" aria-label="14 jours précédents">←</button><button type="button" class="hx-btn ghost" data-action="hx-tape-today">Aujourd’hui</button><button type="button" class="hx-btn ghost" data-action="hx-tape-next" aria-label="14 jours suivants">→</button><button type="button" class="hx-btn ghost" data-action="hx-group-new">+ Réservation de groupe</button><button type="button" class="hx-btn atlas" data-action="hx-stay-new">+ Réservation</button></div></div>
        <div class="hx-cu-legend">${Object.keys(channels).map((c) => `<span class="src-${c}"><i></i>${channels[c]}</span>`).join('')}</div>
        ${rooms.length ? `<div class="hx-cu-tape-scroll"><div class="hx-cu-tape-grid"><div class="hx-cu-date-row"><div class="hx-cu-room"><span>CHAMBRE</span></div><div class="hx-cu-date-days">${dateHead}</div></div>${rows}<div class="hx-cu-occupancy"><div class="hx-cu-room"><b>Occupation</b><span>vendues</span></div><div>${occupancy}</div></div></div></div>` : `<div class="hx-cu-tape-empty"><b>Ajoutez d’abord vos chambres</b><p>Le tape chart attribue chaque séjour à une chambre réelle.</p><button class="hx-btn atlas" data-action="hx-room-add">Configurer les chambres</button></div>`}
      </div>
    </div>`;
  }

  function cuLang() {
    try {
      return (window.KiwiI18n && window.KiwiI18n.getLang && window.KiwiI18n.getLang()) || document.documentElement.lang || 'fr';
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
          <input type="text" id="${inputId}" class="hx-nat-search" data-hx-nat-search autocomplete="off" placeholder="Rechercher une nationalité…" value="${esc(displayLabel)}" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="${menuId}" aria-haspopup="listbox" ${disabled ? 'disabled' : ''}>
          <button type="button" class="hx-nat-clear" data-hx-nat-clear aria-label="Effacer la sélection" ${displayLabel && !disabled ? '' : 'hidden'}>&times;</button>
        </div>
        <div id="${menuId}" class="hx-nat-menu" data-hx-nat-menu role="listbox" aria-label="Nationalités" hidden></div>
        ${isLegacyUnmatched ? `
          <div class="hx-nat-legacy-alert" data-hx-nat-legacy role="status">
            <span class="hx-badge-legacy">Valeur existante à vérifier : « ${esc(raw)} »</span>
            ${!disabled ? '<button type="button" class="hx-link-btn" data-hx-nat-clear-legacy>Corriger</button>' : ''}
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
          menu.innerHTML = '<div class="hx-nat-empty" role="none">Aucune nationalité correspondante</div>';
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
    if (!types.length || !rooms.length) { toast('Configurez vos chambres d’abord', { type: 'warn' }); return; }
    const statusLabels = { requested: 'Demandée', confirmed: 'Confirmée', checked_in: 'Client arrivé', completed: 'Terminée', cancelled: 'Annulée', no_show: 'No-show' };
    const nextStatuses = {
      requested: ['requested', 'confirmed', 'no_show'],
      confirmed: ['confirmed', 'checked_in', 'no_show'],
      checked_in: ['checked_in', 'completed'],
      completed: ['completed'], cancelled: ['cancelled'], no_show: ['no_show'],
    };
    const currentStatus = booking?.status || 'confirmed';
    const statusChoices = booking ? (nextStatuses[currentStatus] || [currentStatus]) : ['requested', 'confirmed', 'checked_in'];
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Casablanca', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const add = (ymd, n) => { const d = new Date(ymd + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
    const typeId = booking?.serviceId || types[0].id;
    const existingGuests = Array.isArray(booking?.guests) && booking.guests.length ? booking.guests : (
      booking?.customer?.name ? [{ name: booking.customer.name, sex: '', nationality: '', residenceCountry: '', birthDate: '', idDocType: '', idDocNumber: '', minorsUnder18: 0 }] : [{ name: '', sex: '', nationality: '', residenceCountry: '', birthDate: '', idDocType: '', idDocNumber: '', minorsUnder18: 0 }]
    );
    const guestRowHtml = (g, idx) => `
      <div class="hx-guest-item" data-hx-guest-row data-hx-guest-id="${esc(g.id || ('gst_' + crypto.randomUUID().slice(0, 12)))}">
        <div class="hx-guest-head">
          <span>VOYAGEUR ${idx + 1}</span>
          ${idx > 0 ? `<button type="button" class="hx-link-btn hx-guest-remove" data-action="hx-remove-guest-row">Retirer</button>` : ''}
        </div>
        <div class="hx-guest-grid">
          <label><span>Nom complet</span><input data-hx-guest-name placeholder="Nom et prénom" value="${esc(g.name || '')}"></label>
          <label><span>Sexe</span><select data-hx-guest-sex>
            <option value="">Indéterminé</option>
            <option value="M" ${g.sex === 'M' ? 'selected' : ''}>Masculin (M)</option>
            <option value="F" ${g.sex === 'F' ? 'selected' : ''}>Féminin (F)</option>
          </select></label>
          <label><span>Nationalité</span>${cuNationalitySelectorHtml(g, idx)}</label>
          <label><span>Date de naissance</span><input data-hx-guest-birth inputmode="numeric" autocomplete="off" maxlength="10" placeholder="JJ/MM/AAAA" value="${esc(cuBirthDisplay(g.birthDate))}"></label>
          <label><span>Mineurs accompagnants</span><input type="number" min="0" max="10" step="1" data-hx-guest-minors value="${esc(g.minorsUnder18 || 0)}"></label>
          <label><span>Pays de résidence</span><input data-hx-guest-residence placeholder="Ex. Maroc, France" value="${esc(g.residenceCountry || '')}"></label>
          <label><span>Type de pièce</span><select data-hx-guest-id-type>
            <option value="">Sélectionner</option>
            <option value="CNIE" ${g.idDocType === 'CNIE' ? 'selected' : ''}>CNIE (Maroc)</option>
            <option value="passeport" ${g.idDocType === 'passeport' ? 'selected' : ''}>Passeport</option>
            <option value="carte_sejour" ${g.idDocType === 'carte_sejour' ? 'selected' : ''}>Carte de séjour</option>
            <option value="autre" ${g.idDocType === 'autre' ? 'selected' : ''}>Autre pièce</option>
          </select></label>
          <label><span>N° de document</span><input data-hx-guest-id-num placeholder="Ex. AB123456" value="${esc(g.idDocNumber || '')}"></label>
        </div>
      </div>
    `;
    const m = K().modal({ tag: booking ? booking.code || 'SÉJOUR' : 'NOUVEAU SÉJOUR', title: booking ? 'Modifier la réservation' : 'Ajouter une réservation', desc: 'La chambre est contrôlée et bloquée côté serveur avant confirmation.', width: 720,
      body: `<form class="hx-stay-form" data-hx-stay-form>
        ${linked ? `<p class="hx-commercial-stay">Nouvelle chambre du dossier ${esc(linked.code)}. Sa disponibilité, ses voyageurs et son annulation restent indépendants.</p>` : ''}
        ${booking ? `<div class="hx-room-form-actions"><button type="button" class="hx-btn ghost" data-action="hx-dossier" data-arg="${esc(booking.id)}">Chambres & facturation du dossier</button></div>` : ''}
        <div class="hx-room-form hx-type-form">
          <label class="hx-room-form-wide"><span>Nom du client</span><input name="name" maxlength="100" required value="${esc(booking?.customer?.name || '')}" placeholder="Nom et prénom"></label>
          <label><span>Arrivée</span><input name="checkIn" type="date" required value="${esc(booking?.hotel?.checkIn || today)}"></label>
          <label><span>Départ</span><input name="checkOut" type="date" required value="${esc(booking?.hotel?.checkOut || add(today, 1))}"></label>
          <label class="hx-room-form-wide"><span>Type de séjour</span><select name="stayMode" ${booking ? 'disabled' : ''}><option value="overnight">Avec nuitée</option><option value="day_use" ${booking?.hotel?.dayUse ? 'selected' : ''}>Day-use · sans nuitée</option></select></label>
          <label data-hx-day-use hidden><span>Heure d’arrivée</span><input name="arrivalTime" type="time" value="${esc(booking?.hotel?.arrivalTime || '09:00')}"></label>
          <label data-hx-day-use hidden><span>Heure de départ</span><input name="departureTime" type="time" value="${esc(booking?.hotel?.departureTime || '18:00')}"></label>
          <label data-hx-day-use hidden><span>Forfait day-use TTC · MAD</span><input name="dayUsePrice" inputmode="decimal" placeholder="Montant convenu" value="${booking?.hotel?.dayUse ? (booking.hotel.total || 0).toFixed(2) : ''}"></label>
          <label><span>Catégorie</span><select name="roomTypeId">${types.map((t) => `<option value="${esc(t.id)}" ${t.id === typeId ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></label>
          <label><span>Chambre</span><select name="resourceId"><option value="">Attribution automatique</option>${rooms.map((r) => `<option value="${esc(r.id)}" data-type="${esc(r.typeId)}" ${r.id === booking?.resourceId ? 'selected' : ''}>Ch. ${r.n} · ${esc(roomTypeOf(r.n).name)}</option>`).join('')}</select></label>
          <label><span>Canal</span><select name="channel"><option value="direct">Direct</option><option value="booking">Booking.com</option><option value="airbnb">Airbnb</option><option value="expedia">Expedia</option><option value="walkin">Walk-in</option><option value="other">Autre OTA</option></select></label>
          <label><span>Statut</span><select name="status">${statusChoices.map((value) => `<option value="${value}">${statusLabels[value]}</option>`).join('')}</select></label>
          <label><span>Voyageurs</span><input name="partySize" type="number" min="1" max="12" value="${booking?.partySize || 1}"><small class="hx-capacity-hint" data-hx-capacity-hint></small></label>
          <label><span>Référence OTA <small>· optionnel</small></span><input name="externalRef" maxlength="80" value="${esc(booking?.hotel?.externalRef || '')}" placeholder="Ex. 4219-8840"></label>
          <label><span>Téléphone <small>· optionnel</small></span><input name="phone" maxlength="32" value="${esc(booking?.customer?.phone || '')}"></label>
          <label><span>E-mail <small>· optionnel</small></span><input name="email" type="email" maxlength="160" value="${esc(booking?.customer?.email || '')}"></label>
          <fieldset class="hx-room-form-wide hx-commercial-stay" data-hx-commercial-stay><legend>Compte & formule de réservation</legend><p role="status">Chargement des comptes…</p></fieldset>
          <div class="hx-room-form-wide hx-guest-block">
            <div class="hx-guest-block-head">
              <b>Fiche voyageurs · identité et séjour</b>
              <button type="button" class="hx-link-btn hx-guest-add" data-action="hx-add-guest-row">+ Ajouter un voyageur</button>
            </div>
            <div data-hx-guests-container>
              ${existingGuests.map(guestRowHtml).join('')}
            </div>
          </div>
          <label class="hx-room-form-wide"><span>Note interne</span><textarea name="note" maxlength="600" rows="3">${esc(booking?.note || '')}</textarea></label>
        </div><p class="hx-stay-error" data-hx-stay-error role="status"></p><div class="hx-room-form-actions">${booking && ['requested', 'confirmed'].includes(booking.status) ? `<button type="button" class="hx-btn warn" data-action="hx-stay-cancel" data-arg="${esc(booking.id)}">Annuler le séjour</button>` : '<span></span>'}<button class="hx-btn atlas" type="submit">${booking ? 'Enregistrer les modifications' : (booking?.status === 'requested' ? 'Poser une option (bloquer la chambre)' : 'Confirmer la réservation')}</button></div>
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
        submitBtn.textContent = 'Enregistrer les modifications';
        return;
      }
      const val = form.elements.status?.value;
      if (val === 'requested') {
        submitBtn.textContent = 'Poser une option (bloquer la chambre)';
      } else {
        submitBtn.textContent = 'Confirmer la réservation';
      }
    };
    form.elements.status.addEventListener('change', updateSubmitButton);
    updateSubmitButton();

    const updateCapacityValidation = () => {
      const selectedTypeId = form.elements.roomTypeId.value;
      const typeObj = types.find(t => t.id === selectedTypeId);
      const maxGuests = typeObj?.maxGuests || 4;
      form.elements.partySize.max = maxGuests;
      const hint = form.querySelector('[data-hx-capacity-hint]');
      if (hint) hint.textContent = 'Capacité max : ' + maxGuests + ' pers.';
      const currentParty = Number(form.elements.partySize.value) || 1;
      const err = form.querySelector('[data-hx-stay-error]');
      if (currentParty > maxGuests) {
        if (err) err.textContent = 'La catégorie « ' + (typeObj?.name || selectedTypeId) + ' » ne peut pas accueillir ' + currentParty + ' personnes (max : ' + maxGuests + '). Réduisez le nombre de personnes.';
        submitBtn.disabled = true;
      } else {
        if (err && err.textContent.includes('ne peut pas accueillir')) err.textContent = '';
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
    form.elements.channel.value = booking?.hotel?.channel || (booking?.source === 'public' ? 'direct' : 'other');
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

  const cuDraftMoney = n => (n / 100).toLocaleString('fr-FR', {minimumFractionDigits:2,maximumFractionDigits:2});
  const cuDraftStatus = v => ({requested:'Demandée',confirmed:'Confirmée',checked_in:'En séjour',completed:'Terminée',cancelled:'Annulée',no_show:'Non présenté'})[v] || v;
  function cuDraftRoom(id) { const room=Object.values(cuState().rooms||{}).find(r=>r.id===id);return room?'Ch. '+room.n:/^room:\d+$/.test(id)?'Ch. '+id.slice(5):id?'Chambre attribuée':'Supplément proposé'; }
  function cuBillingLine(l, payers) {
    const parts=l.parts || [{payer:l.payer,amountCents:l.amountCents}];
    const options = selected => payers.map(p=>`<option value="${esc(p.id)}" ${p.id===selected?'selected':''}>${esc(p.name)}</option>`).join('');
    return `<article class="hx-billing-line" data-hx-billing-line="${esc(l.id)}" data-amount="${l.amountCents}"><header><div><b>${esc(l.label)}</b><span>${esc(l.date)} · ${esc(cuDraftRoom(l.roomId))} · ${l.quantity} unité(s)${l.board ? ' · '+esc(cuBoards[l.board] || l.board) : ''}</span></div><strong>${cuDraftMoney(l.amountCents)} MAD</strong></header><div class="hx-room-form hx-type-form"><label><span>Payeur principal</span><select data-hx-payer>${options(parts[0]?.payer || l.payer)}</select></label><label><span>Part du second payeur · MAD</span><input data-hx-part inputmode="decimal" value="${((parts[1]?.amountCents || 0)/100).toFixed(2)}"></label><label><span>Second payeur · si partage</span><select data-hx-second><option value="">Aucun</option>${options(parts[1]?.payer)}</select></label></div>${l.kind==='extra'?'<button class="hx-btn ghost" type="button" data-hx-remove-extra>Retirer ce supplément proposé</button>':''}</article>`;
  }
  function cuBillingBody(data) {
    const saved=data.saved?.draft, draft=data.stale ? data.preview : (saved || data.preview);
    return `<section class="hx-billing"><header class="hx-commercial-hero"><div><span class="hx-commercial-eyebrow">DOSSIER HÔTEL · PRÉFACTURATION</span><h2>Un séjour, plusieurs chambres.</h2><p>Répartissez les prestations entre voyageurs, agence et société.</p></div><div><small>Total proposé</small><strong data-hx-draft-total>${cuDraftMoney(draft.totalCents)} MAD</strong></div></header>
      <p class="hx-billing-notice">Préfacture non fiscale. Taxes non validées et encaissements non rapprochés. Les suppléments saisis ici ne sont pas envoyés à la caisse. Aucune facture définitive ni paiement n’est créé.</p>
      <div class="hx-dossier-rooms">${data.source.rooms.map(r=>`<article><b>${esc(r.name)}</b><span>${esc(cuDraftRoom(r.roomId))} · ${esc(r.code)} · ${esc(cuDraftStatus(r.status))}</span><span>${esc(r.checkIn)} → ${esc(r.checkOut)}${r.dayUse?' · Day-use '+esc(r.arrivalTime)+'–'+esc(r.departureTime):''}</span><button type="button" class="hx-btn ghost" data-hx-open-stay="${esc(r.id)}">Modifier cette chambre</button></article>`).join('')}</div>
      ${data.stale?`<div class="hx-billing-notice" role="alert"><b>Le dossier a changé depuis la dernière préfacture.</b><p>Le nouveau prix est affiché. Les répartitions et suppléments de l’ancien brouillon ne seront pas repris automatiquement.</p><button type="button" class="hx-btn ghost" data-hx-reset-draft>Repartir des séjours actuels et remplacer le brouillon</button></div>`:''}
      <form data-hx-billing-form><fieldset ${data.stale?'disabled':''}><legend>Prestations et répartition</legend><div data-hx-billing-lines>${draft.lines.map(l=>cuBillingLine(l,data.source.payers)).join('')}</div>
        <details class="hx-commercial-stay"><summary>Ajouter un supplément proposé</summary><div class="hx-room-form hx-type-form"><label><span>Date de prestation</span><input type="date" name="extraDate" value="${esc(data.source.rooms[0]?.checkIn || '')}"></label><label><span>Libellé</span><input name="extraLabel" maxlength="160" placeholder="Repas, parking, service…"></label><label><span>Quantité</span><input name="extraQuantity" type="number" min="1" max="10000" value="1"></label><label><span>Prix unitaire proposé · MAD</span><input name="extraPrice" inputmode="decimal" placeholder="0,00"></label></div><button class="hx-btn ghost" type="button" data-hx-add-extra>Ajouter au brouillon</button></details>
        <label class="hx-billing-note"><span>Observations de préfacturation</span><textarea name="billingNote" maxlength="1000" rows="2">${esc(draft.note || '')}</textarea></label>
        <div class="hx-billing-summary" data-hx-billing-summary>${draft.payers.map(p=>`<span>${esc(p.name)} <b>${cuDraftMoney(p.amountCents)} MAD</b></span>`).join('')}</div>
        <p role="status" data-hx-billing-error></p><div class="hx-room-form-actions"><button type="button" class="hx-btn ghost" data-hx-print-draft ${!saved || data.stale?'disabled':''}>Imprimer la version enregistrée</button><button type="submit" class="hx-btn atlas">Enregistrer la préfacture</button></div></fieldset></form></section>`;
  }
  function cuDraftInput(form, extras) {
    const allocations=[...form.querySelectorAll('[data-hx-billing-line]')].map(row=>{
      const total=Number(row.dataset.amount),first=row.querySelector('[data-hx-payer]').value,second=row.querySelector('[data-hx-second]').value;
      const raw=row.querySelector('[data-hx-part]').value.trim().replace(',','.');
      if(!/^\d{1,9}(\.\d{1,2})?$/.test(raw))throw new Error('Partage invalide. Utilisez deux décimales maximum.');
      const amount=Math.round(Number(raw)*100);
      if(amount>total || (amount>0 && (!second || second===first)))throw new Error('Le partage doit respecter le montant de la ligne et utiliser deux payeurs distincts.');
      return {lineId:row.dataset.hxBillingLine,parts:[{payer:first,amountCents:total-amount},...(amount?[{payer:second,amountCents:amount}]:[])]};
    });
    return {extras,allocations,note:form.elements.billingNote.value};
  }
  function cuPrintDraft(saved) {
    const d=saved.draft, frame=document.createElement('iframe');
    frame.title='Préfacture à imprimer'; frame.style.cssText='position:fixed;left:-10000px;width:800px;height:1000px;border:0';
    frame.srcdoc=`<!doctype html><html lang="fr"><meta charset="utf-8"><title>Préfacture non fiscale</title><style>@page{size:A4;margin:16mm}body{font:12px system-ui;color:#17221d}h1{font-size:28px}table{border-collapse:collapse;width:100%;margin:24px 0}th,td{padding:8px;text-align:left;border-bottom:1px solid #ccd5cf}thead{display:table-header-group}tr{break-inside:avoid}.notice{padding:12px;border:1px solid #9caea2}small{display:block;margin-top:6px}</style><h1>Préfacture non fiscale</h1><p>Version enregistrée le ${esc(new Date(saved.updatedAt).toLocaleString('fr-FR'))}</p><p class="notice">Taxes non validées. Encaissements non rapprochés. Ce document n’est ni une facture définitive, ni un reçu de paiement.</p><table><thead><tr><th>Date / chambre</th><th>Prestation</th><th>Quantité</th><th>Montant proposé MAD</th></tr></thead><tbody>${d.lines.map(l=>`<tr><td>${esc(l.date)}<small>${esc(l.roomId||'')}</small></td><td>${esc(l.label)}<small>${l.parts.map(p=>esc(d.payers.find(x=>x.id===p.payer)?.name||'Payeur')+': '+cuDraftMoney(p.amountCents)).join(' · ')}</small></td><td>${l.quantity}</td><td>${cuDraftMoney(l.amountCents)}</td></tr>`).join('')}</tbody></table><h2>Total proposé : ${cuDraftMoney(d.totalCents)} MAD</h2>${d.payers.map(p=>`<p><b>${esc(p.name)} : ${cuDraftMoney(p.amountCents)} MAD</b><small>${esc(p.address||'')} ${p.ice?' · ICE '+esc(p.ice):''}</small></p>`).join('')}<p>${esc(d.note||'')}</p></html>`;
    frame.onload=()=>{frame.contentWindow.addEventListener('afterprint',()=>frame.remove(),{once:true});frame.contentWindow.focus();frame.contentWindow.print();};
    document.body.appendChild(frame);
  }
  async function cuOpenDossier(booking) {
    const scope=cuStayScope(),merchant=cuChannelMerchant(),id=booking.hotel.dossierId||booking.id;
    openModal?.close?.();
    const m=K().modal({tag:booking.code || 'DOSSIER',title:'Chambres & préfacture',desc:'Les chambres restent modifiables et annulables séparément.',width:1080,
      body:'<div class="hx-room-form-actions"><button type="button" class="hx-btn ghost" data-hx-linked-room>Ajouter une chambre au dossier</button></div><div data-hx-dossier-body role="status">Chargement du dossier serveur…</div>'});
    openModal={el:m.el,close:m.close};
    const host=m.el.querySelector('[data-hx-dossier-body]');
    m.el.querySelector('[data-hx-linked-room]').onclick=()=>{m.close();if(scope===cuStayScope())cuStayEditor(null,booking);};
    try{
      const res=await fetch('/api/hotel/billing-draft?'+new URLSearchParams({merchant,dossierId:id})),data=await res.json();
      if(scope!==cuStayScope()||m.el.isConnected===false)return;
      if(!res.ok)throw new Error('Préfacturation indisponible. Aucune donnée comptable n’a été modifiée.');
      host.innerHTML=cuBillingBody(data); host.removeAttribute('role');
      const form=host.querySelector('[data-hx-billing-form]'),error=form.querySelector('[data-hx-billing-error]');
      let extras=data.stale?[]:(data.saved?.input?.extras||[]),pending=null,dirty=false;
      const dirtyNow=()=>{dirty=true;pending=null;form.querySelector('[data-hx-print-draft]').disabled=true;};
      const summary=()=>{
        try{
          const input=cuDraftInput(form,extras),totals=new Map();
          input.allocations.forEach(a=>a.parts.forEach(p=>totals.set(p.payer,(totals.get(p.payer)||0)+p.amountCents)));
          form.querySelector('[data-hx-billing-summary]').innerHTML=[...totals].map(([payer,amount])=>`<span>${esc(data.source.payers.find(p=>p.id===payer)?.name||'Payeur')} <b>${cuDraftMoney(amount)} MAD</b></span>`).join('');
          host.querySelector('[data-hx-draft-total]').textContent=cuDraftMoney([...totals.values()].reduce((a,b)=>a+b,0))+' MAD';
          error.textContent='';
        }catch(e){error.textContent=e.message;}
      };
      form.addEventListener('input',()=>{dirtyNow();summary();}); form.addEventListener('change',()=>{dirtyNow();summary();});
      host.querySelector('[data-hx-reset-draft]')?.addEventListener('click',()=>{form.querySelector('fieldset').disabled=false;dirtyNow();error.textContent='Les anciens suppléments et répartitions seront remplacés uniquement après enregistrement.';});
      host.querySelectorAll('[data-hx-open-stay]').forEach(button=>button.onclick=async()=>{
        if(scope!==cuStayScope()){m.close();return;}
        const response=await fetch('/api/hotel/stays?'+new URLSearchParams({merchant,id:button.dataset.hxOpenStay,includeCancelled:'1'}));
        const body=await response.json();if(scope!==cuStayScope())return;
        const stay=body.stays?.find(b=>b.id===button.dataset.hxOpenStay);
        if(!response.ok||!stay){error.textContent='Séjour introuvable. Actualisez la réception.';return;}
        cuStayCache().set(stay.id,stay);m.close();cuStayEditor(stay);
      });
      form.querySelector('[data-hx-add-extra]').onclick=()=>{
        const raw=form.elements.extraPrice.value.trim().replace(',','.'),quantity=Number(form.elements.extraQuantity.value),label=form.elements.extraLabel.value.trim(),date=form.elements.extraDate.value;
        if(!label||!date||!/^\d{1,7}(\.\d{1,2})?$/.test(raw)||!Number.isInteger(quantity)||quantity<1||quantity>10000){error.textContent='Complétez la date, le libellé, la quantité et le prix du supplément.';return;}
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
          form.__saving=true;form.querySelector('fieldset').disabled=true;error.textContent='Enregistrement serveur…';
          const response=await fetch('/api/hotel/billing-draft',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(pending)}),body=await response.json();
          if(scope!==cuStayScope())return;
          if(!response.ok)throw new Error(body.error==='draft-stale'?'Le dossier ou ses comptes ont changé. Rouvrez-le pour vérifier les prix avant enregistrement.':'Enregistrement refusé. Vérifiez les montants et les payeurs.');
          data.saved=body.saved;data.rev=body.rev;pending=null;dirty=false;form.querySelector('[data-hx-print-draft]').disabled=false;
          error.textContent='Préfacture enregistrée. Aucun paiement ni facture fiscale créé.';
        }catch(e){error.textContent=e.message||'Réponse non reçue. Réessayez sans modifier les champs pour conserver la même référence.';}
        finally{form.__saving=false;form.querySelector('fieldset').disabled=false;}
      };
    }catch(e){host.textContent=e.message||'Dossier indisponible.';}
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

  async function cuGroupReservationModal() {
    const initialScope = cuStayScope();
    const initialMerchant = cuMerchantSlug();
    const initialCache = cuStayCache();
    const st = cuState(), types = cuTypes(), allRooms = Object.values(st.rooms || {}).sort((a, b) => a.n - b.n);
    if (!types.length || !allRooms.length) { toast('Configurez vos chambres d’abord', { type: 'warn' }); return; }
    await cuLoadCommercial();
    if (initialScope !== cuStayScope() || initialMerchant !== cuMerchantSlug()) return;
    const commState = cuCommercialState();
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Casablanca', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const add = (ymd, n) => { const d = new Date(ymd + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
    const tomorrow = add(today, 1);

    const stagedKey = 'kiwi:hotel-group-staged:' + initialMerchant;
    let staged = null;
    try {
      staged = JSON.parse(localStorage.getItem(stagedKey) || 'null');
    } catch (_) {}
    if (!staged || staged.merchant !== initialMerchant) staged = null;

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

    const pendingIntent = readAnyUnresolvedIntent();
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
      ? pendingIntent.rooms.filter(r => r && r.roomId)
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
      tag: 'RÉSERVATION DE GROUPE',
      title: 'Nouveau dossier groupe',
      desc: 'Sélection multi-chambres avec contrôle de disponibilité serveur, répartition des voyageurs et pré-confirmation.',
      width: 920,
      body: `
        <form class="hx-group-modal" data-hx-group-form>
          <div data-hx-group-recovery-slot>
            ${hasSavedRooms ? `
              <div class="hx-group-partial-alert" data-hx-group-resume-alert>
                <b>Dossier en cours de reprise</b> : ${Object.keys(savedRooms).length} chambre(s) déjà enregistrée(s) sous le dossier <code>${esc(groupDossierId)}</code>.
                <br>Les chambres confirmées sont conservées et verrouillées. Vous pouvez finaliser les chambres restantes ou remplacer une chambre indisponible.
                <div style="margin-top:6px;display:flex;gap:8px;">
                  <button type="button" class="hx-link-btn" data-action="hx-discard-staged">Abandonner ce brouillon local</button>
                </div>
              </div>
            ` : ''}
          </div>

          <div class="hx-commercial-hero">
            <div>
              <span class="hx-commercial-eyebrow">DOSSIER GROUPE · RÉSERVATION MULTI-CHAMBRES</span>
              <h3 style="margin:4px 0;font-size:16px;">Séminaires, agences et groupes de voyageurs</h3>
              <p style="font-size:12px;color:var(--n-600);margin:0;">Chaque chambre est contrôlée et garantie sous la même référence de dossier.</p>
            </div>
          </div>

          <fieldset class="hx-room-form-wide" style="border:1px solid var(--n-200);border-radius:12px;padding:14px;">
            <legend style="font-size:12px;font-weight:600;padding:0 6px;">1. Informations du groupe et séjour</legend>
            <div class="hx-room-form hx-type-form">
              <label class="hx-room-form-wide"><span>Nom du groupe / événement *</span><input name="groupName" required maxlength="120" placeholder="Ex. Séminaire Atlas Tech, Groupe Tourisme" value="${esc(initialGroupName)}"></label>
              <label><span>Date d'arrivée *</span><input name="checkIn" type="date" required value="${esc(initialCheckIn)}"></label>
              <label><span>Date de départ *</span><input name="checkOut" type="date" required value="${esc(initialCheckOut)}"></label>
              <label><span>Contact principal (nom) *</span><input name="contactName" required maxlength="100" placeholder="Nom du responsable" value="${esc(initialContactName)}"></label>
              <label><span>Téléphone contact</span><input name="contactPhone" maxlength="32" placeholder="Ex. +212 6..." value="${esc(initialContactPhone)}"></label>
              <label><span>E-mail contact</span><input name="contactEmail" type="email" maxlength="160" placeholder="contact@groupe.com" value="${esc(initialContactEmail)}"></label>
              <label><span>Compte commercial</span><select name="accountId">
                <option value="">Sans compte commercial</option>
                ${(commState.accounts || []).filter(a => !a.archived).map(a => `<option value="${esc(a.id)}" ${a.id === initialAccountId ? 'selected' : ''}>${esc(cuKinds[a.kind] + ' · ' + a.name)}</option>`).join('')}
              </select></label>
              <label><span>Canal</span><select name="channel">
                <option value="direct" ${initialChannel === 'direct' ? 'selected' : ''}>Direct</option>
                <option value="agency" ${initialChannel === 'agency' ? 'selected' : ''}>Agence</option>
                <option value="booking" ${initialChannel === 'booking' ? 'selected' : ''}>Booking.com</option>
                <option value="expedia" ${initialChannel === 'expedia' ? 'selected' : ''}>Expedia</option>
                <option value="other" ${initialChannel === 'other' ? 'selected' : ''}>Autre</option>
              </select></label>
              <label><span>Formule repas par défaut</span><select name="board">
                ${Object.entries(cuBoards).map(([v, l]) => `<option value="${v}" ${v === initialBoard ? 'selected' : ''}>${esc(l)}</option>`).join('')}
              </select></label>
            </div>
          </fieldset>

          <fieldset class="hx-room-form-wide" style="border:1px solid var(--n-200);border-radius:12px;padding:14px;">
            <legend style="font-size:12px;font-weight:600;padding:0 6px;">2. Sélection des chambres</legend>
            <div class="hx-group-filter-bar" style="display:flex;flex-wrap:wrap;gap:12px;align-items:flex-start;margin-bottom:12px;font-size:12px;">
              <div style="display:flex;flex-direction:column;gap:4px;">
                <span style="font-weight:500;">Section / Étage (choix multiple) :</span>
                <div class="hx-group-filter-floors" style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;">
                  ${Object.values(st.floors || {}).map(f => `
                    <label class="hx-filter-pill-label">
                      <input type="checkbox" data-hx-filter-floor="${esc(f.id)}">
                      <span>${esc(f.name)}</span>
                    </label>
                  `).join('')}
                </div>
              </div>
              <label>Catégorie :
                <select data-hx-filter-type>
                  <option value="">Toutes les catégories</option>
                  ${types.map(t => `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join('')}
                </select>
              </label>
              <label>Vue :
                <select data-hx-filter-view>
                  <option value="">Toutes les vues</option>
                  ${((Array.isArray(st.views) && st.views.length) ? st.views : DEFAULT_VIEWS).map(v => `<option value="${esc(v)}">${esc(VIEW_LABELS[v]?.fr || v)}</option>`).join('')}
                </select>
              </label>
              <label>Capacité min. :
                <select data-hx-filter-cap>
                  <option value="0">Toutes capacités</option>
                  <option value="1">1+ personne</option>
                  <option value="2">2+ personnes</option>
                  <option value="3">3+ personnes</option>
                  <option value="4">4+ personnes</option>
                </select>
              </label>
              <label>Portes communicantes :
                <select data-hx-filter-conn>
                  <option value="">Toutes</option>
                  <option value="with">Avec porte communicante</option>
                  <option value="without">Sans communicante</option>
                </select>
              </label>
            </div>

            <div class="hx-group-rooms-grid" data-hx-group-rooms-grid></div>

            <div class="hx-group-summary-card" data-hx-rooms-summary style="margin-top:10px;">
              <span data-hx-rooms-counter>0 chambre sélectionnée</span>
            </div>
          </fieldset>

          <fieldset class="hx-room-form-wide" style="border:1px solid var(--n-200);border-radius:12px;padding:14px;">
            <legend style="font-size:12px;font-weight:600;padding:0 6px;">3. Fiche et répartition des voyageurs</legend>
            <div class="hx-group-paste-wrap">
              <details data-hx-import-details>
                <summary style="font-size:12px;color:var(--atlas);cursor:pointer;font-weight:500;">Importer rapidement une liste de voyageurs (copier-coller CSV / TSV)</summary>
                <div style="margin-top:8px;">
                  <textarea class="hx-group-paste-area" data-hx-group-paste placeholder="Collez les voyageurs (un voyageur par ligne : &quot;Nom, Prénom&quot;, Nationalité, Document)..."></textarea>
                  <div style="margin-top:6px;display:flex;gap:8px;align-items:center;">
                    <button type="button" class="hx-btn ghost" data-action="hx-preview-paste">Prévisualiser l’import</button>
                  </div>
                  <div data-hx-import-preview-area style="margin-top:8px;"></div>
                </div>
              </details>
            </div>

            <div class="hx-group-travelers-sec" style="margin-top:10px;">
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <span style="font-size:12px;font-weight:600;color:var(--ink);" data-hx-travelers-count>${travelers.length} voyageur(s)</span>
                <button type="button" class="hx-btn ghost" data-action="hx-add-group-traveler">+ Ajouter un voyageur</button>
              </div>
              <div data-hx-group-travelers-container></div>
              <div data-hx-capacity-alerts style="margin-top:8px;"></div>
            </div>
          </fieldset>

          <div data-hx-group-quote-slot></div>

          <div class="hx-group-summary-card" data-hx-group-review>
            <h4 style="margin:0 0 6px;font-size:13.5px;color:var(--ink);">Récapitulatif du dossier de groupe</h4>
            <div class="hx-group-summary-grid">
              <div><small style="color:var(--n-500);display:block;">Identifiant dossier</small><code style="font-family:var(--mono);font-size:11.5px;">${esc(groupDossierId)}</code></div>
              <div><small style="color:var(--n-500);display:block;">Période</small><span data-hx-rev-dates>-</span></div>
              <div><small style="color:var(--n-500);display:block;">Chambres réservées</small><b data-hx-rev-rooms>0 chambre</b></div>
              <div><small style="color:var(--n-500);display:block;">Voyageurs enregistrés</small><span data-hx-rev-guests>0 pers.</span></div>
            </div>
          </div>

          <p class="hx-stay-error" data-hx-group-error role="status" style="margin:4px 0;"></p>

          <div class="hx-room-form-actions">
            <button type="button" class="hx-btn ghost" data-action="hx-group-cancel">Fermer</button>
            <button type="submit" class="hx-btn atlas" data-hx-group-submit>${hasSavedRooms ? 'Reprendre la confirmation (' + Object.keys(savedRooms).length + ' enregistrée(s))' : 'Confirmer la réservation du groupe'}</button>
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
        roomsGrid.innerHTML = '<div style="padding:16px;color:var(--n-500);font-size:12px;text-align:center;">Aucune chambre correspondante aux filtres.</div>';
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
          badge = '<span class="hx-badge-saved">Chambre enregistrée</span>';
        } else if (isFailed) {
          badge = '<span class="hx-badge-dup" style="font-size:10px;">Échec : ' + esc(failedRooms[r.id]) + '</span>';
        }

        return `
          <label class="hx-group-room-card ${isChecked ? 'is-selected' : ''} ${isSaved ? 'is-saved' : ''}" data-room-card-id="${esc(r.id)}">
            <input type="checkbox" data-hx-group-cb value="${esc(r.id)}" ${isChecked ? 'checked' : ''} ${isSaved ? 'disabled' : ''}>
            <div class="hx-group-room-details">
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <span class="hx-group-room-title">Chambre ${r.n}</span>
                ${badge}
              </div>
              <span class="hx-group-room-sub">${esc(type.name)} · max ${type.maxGuests || 4} pers. · ${type.base != null ? MAD(type.base) + '/nuit' : 'Tarif standard'}</span>
              ${connRoomNumbers.length ? `<span class="hx-group-room-conn">Porte communicante : ch. ${esc(connRoomNumbers.join(', '))}</span>` : ''}
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
          return `<div>Ch. ${r.n} (${esc(roomTypeOf(r.n).name)}) : <span style="color:var(--warn-ink);">En attente de calcul</span></div>`;
        }
        totalCentsAll += q.totalCents;
        const roomMad = (q.totalCents / 100).toFixed(2);
        const nights = q.rows.length;
        const rates = q.rows.map(row => row.amountCents / 100);
        const minRate = Math.min(...rates).toFixed(2);
        const maxRate = Math.max(...rates).toFixed(2);
        const rateSummary = minRate === maxRate ? `${minRate} MAD/nuit` : `de ${minRate} à ${maxRate} MAD/nuit`;
        const taxLabel = q.taxBasis === 'exclusive' ? 'HT' : 'TTC';
        return `<div>Ch. ${r.n} (${esc(roomTypeOf(r.n).name)}) : <b>${roomMad} MAD ${taxLabel}</b> (${nights} nuit${nights > 1 ? 's' : ''} · ${rateSummary})</div>`;
      });
      if (allQuoted && selected.length > 0) {
        const totalMadAll = (totalCentsAll / 100).toFixed(2);
        const groupTax = Object.values(quoteBreakdown)[0]?.taxBasis === 'exclusive' ? 'HT' : 'TTC';
        lines.push(`<div style="margin-top:4px;font-weight:700;color:var(--ink);border-top:1px dashed var(--n-200);padding-top:4px;">Total commercial groupe : ${totalMadAll} MAD ${groupTax}</div>`);
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
              ? `sans tarif logement pour « ${esc(roomTypeOf(r.n).name)} »`
              : `sans tarif « ${esc(cuBoards[board] || board)} » pour « ${esc(roomTypeOf(r.n).name)} »`;
            return `<div>Ch. ${r.n} : <span style="color:var(--warn-ink);">En attente de tarif — ${what}. Renseignez-le dans Types de chambres, ou réservez cette chambre en prix convenu depuis sa fiche individuelle.</span></div>`;
          }
          return `<div>Ch. ${r.n} (${esc(roomTypeOf(r.n).name)}) : <b>${(q.totalCents / 100).toFixed(2)} MAD TTC</b> (${q.nights} nuit${q.nights > 1 ? 's' : ''})</div>`;
        });
        if (dq.allOk && selected.length > 0) {
          lines.push(`<div style="margin-top:4px;font-weight:700;color:var(--ink);border-top:1px dashed var(--n-200);padding-top:4px;">Total groupe (tarifs maison) : ${(dq.totalCents / 100).toFixed(2)} MAD TTC</div>`);
        }
        quoteSlot.innerHTML = `
          <div class="hx-quote-group-card">
            <div class="hx-quote-group-title">Tarifs maison · Formule : ${esc(cuBoards[board] || board)}</div>
            <p style="font-size:11.5px;color:var(--n-600);margin:0 0 8px;">Sans compte : chaque chambre est chiffrée au tarif configuré de sa catégorie. Vérifié côté serveur avant enregistrement.</p>
            <div class="hx-quote-group-breakdown">${lines.join('')}</div>
          </div>`;
        return;
      }


      const allQuoted = selected.length > 0 && selected.every(r => quoteBreakdown[r.id] && Number.isSafeInteger(quoteBreakdown[r.id].totalCents));
      const hasTaxExclusive = selected.some(r => quoteBreakdown[r.id]?.taxBasis === 'exclusive');

      let unsupportedWarn = '';
      if (board !== 'room_only' && !accountId) {
        unsupportedWarn = '<p class="hx-warn-note" style="color:var(--warn-ink);background:var(--warn-soft);padding:6px 10px;border-radius:6px;font-size:11.5px;margin:4px 0;">Formule repas : un compte commercial avec des contrats actifs est requis pour cette formule.</p>';
      } else {
        const overCapRooms = selected.filter(r => {
          const count = travelers.filter(t => t.roomId === r.id).length;
          return count > 3;
        });
        if (overCapRooms.length > 0) {
          unsupportedWarn = `<p class="hx-warn-note" style="color:var(--danger,#b91c1c);background:rgba(201,74,58,0.08);padding:6px 10px;border-radius:6px;font-size:11.5px;margin:4px 0;">Attention : La tarification contractuelle couvre au maximum 3 personnes par chambre. Les chambres ${overCapRooms.map(r => r.n).join(', ')} dépassent cette limite (1 à 3 pers.).</p>`;
        }
      }

      let acceptCheckboxHtml = '';
      if (allQuoted && !unsupportedWarn) {
        if (hasTaxExclusive) {
          acceptCheckboxHtml = '<p class="hx-warn-note" style="color:var(--warn-ink);margin-top:6px;font-size:11.5px;">Tarif HT détecté : la configuration fiscale est requise avant validation.</p>';
        } else {
          acceptCheckboxHtml = `
            <label class="hx-quote-accept" style="font-size:12px;display:flex;align-items:center;gap:6px;cursor:pointer;">
              <input type="checkbox" data-hx-group-accept-quote ${quoteAccepted ? 'checked' : ''}>
              <span>J’accepte ce devis commercial pour l’ensemble des chambres et la formule choisie.</span>
            </label>
          `;
        }
      } else {
        acceptCheckboxHtml = `
          <label class="hx-quote-accept" style="font-size:12px;display:flex;align-items:center;gap:6px;color:var(--n-500);cursor:not-allowed;">
            <input type="checkbox" disabled>
            <span>Simulez un devis complet et valide pour pouvoir accepter les tarifs.</span>
          </label>
        `;
      }

      quoteSlot.innerHTML = `
        <div class="hx-quote-group-card">
          <div class="hx-quote-group-title">Tarification commerciale · Formule : ${esc(cuBoards[board] || board)}</div>
          ${quoteRevision != null ? `<div style="font-size:11px;color:var(--n-500);margin:2px 0 6px;">Révision commerciale n°${quoteRevision} · ${quoteAccepted ? 'devis accepté pour ces tarifs' : 'en attente d’acceptation'}</div>` : ''}
          <p style="font-size:11.5px;color:var(--n-600);margin:0 0 8px;">Cette formule nécessite la simulation et l’acceptation d’un devis commercial avant validation.</p>
          ${unsupportedWarn}
          <div class="hx-quote-group-breakdown" data-hx-quote-breakdown>
            ${allQuoted ? renderQuoteBreakdownHtml() : '<span style="font-style:italic;">Devis non encore simulé ou incomplet.</span>'}
          </div>
          <div style="display:flex;gap:8px;align-items:center;margin-top:6px;">
            <button type="button" class="hx-btn ghost" data-action="hx-simulate-group-quote" style="font-size:11.5px;padding:4px 10px;">Simuler / Actualiser le devis</button>
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
        toast('Sélectionnez au moins une chambre avant de simuler le devis.', { type: 'warn' });
        return;
      }
      const board = form.elements.board?.value || 'room_only';
      const accountId = form.elements.accountId?.value || null;
      const checkIn = form.elements.checkIn.value;
      const checkOut = form.elements.checkOut.value;

      if (board !== 'room_only' && !accountId) {
        toast('Formule repas : sélectionnez un compte commercial avant de simuler le devis.', { type: 'warn' });
        return;
      }

      for (const room of selected) {
        const occ = travelers.filter(t => t.roomId === room.id).length;
        if (occ > 3) {
          toast(`Chambre ${room.n} : la tarification contractuelle couvre de 1 à 3 personnes (actuellement ${occ}).`, { type: 'warn' });
          return;
        }
      }

      const simBtn = form.querySelector('[data-action="hx-simulate-group-quote"]');
      if (simBtn) { simBtn.disabled = true; simBtn.textContent = 'Calcul en cours…'; }

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
            throw new Error('Chambre ' + room.n + ' : ' + (cuCommercialError(b.error) || b.error || 'Erreur devis'));
          }
          // One reviewed group, one directory revision (defect 4): if the
          // commercial directory moved between two rooms' responses, the
          // displayed totals would mix two price lists while the submission
          // carries a single revision. Reject the whole simulation instead.
          if (!Number.isSafeInteger(b.rev)) {
            throw new Error('Chambre ' + room.n + ' : devis sans révision vérifiable. Relancez la simulation.');
          }
          if (firstRev === null) {
            firstRev = b.rev;
          } else if (b.rev !== firstRev) {
            throw new Error('Le répertoire commercial a changé pendant la simulation (révision ' + firstRev + ' puis ' + b.rev + '). Relancez la simulation pour un devis cohérent.');
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
        toast('Devis commercial simulé avec succès', { type: 'success' });
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
        if (btn) { btn.disabled = false; btn.textContent = 'Simuler / Actualiser le devis'; }
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

      let counterHtml = `<b>${selected.length} chambre(s) sélectionnée(s)</b>`;
      if (selected.length > 0 && visibleSelectedCount < selected.length) {
        counterHtml += ` (${visibleSelectedCount} visible(s) selon les filtres)`;
      }
      counterHtml += ` · Capacité totale : ${totalCapacity} personnes · Estimation base : ${MAD(totalEst)} (${nights} nuit${nights > 1 ? 's' : ''})`;
      roomsCounter.innerHTML = counterHtml;

      form.querySelector('[data-hx-rev-dates]').textContent = `${form.elements.checkIn.value} → ${form.elements.checkOut.value} (${nights} nuit${nights > 1 ? 's' : ''})`;
      form.querySelector('[data-hx-rev-rooms]').textContent = `${selected.length} chambre(s) (${Object.keys(savedRooms).length} validée(s))`;
      form.querySelector('[data-hx-rev-guests]').textContent = `${travelers.length} voyageur(s)`;

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
        sel.innerHTML = '<option value="">-- Sélectionner une chambre --</option>' + avail.map(r => `<option value="${esc(r.id)}" ${r.id === currentVal ? 'selected' : ''}>Ch. ${r.n} · ${esc(roomTypeOf(r.n).name)}</option>`).join('');
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
              <span>VOYAGEUR ${idx + 1}</span>
              ${isUnassigned ? '<span class="hx-badge-unassigned">Non attribué à une chambre</span>' : ''}
              ${isRoomSaved ? '<span class="hx-badge-saved" style="font-size:11px;">Enregistré · Verrouillé</span>' : ''}
            </div>
            ${!isRoomSaved && travelers.length > 1 ? `<button type="button" class="hx-link-btn" data-action="hx-remove-group-traveler">Retirer</button>` : ''}
          </div>
          <div class="hx-guest-grid">
            <label><span>Nom complet *</span><input data-hx-t-name required placeholder="Nom et prénom" value="${esc(t.name || '')}" ${isRoomSaved ? 'disabled' : ''}></label>
            <label><span>Sexe</span><select data-hx-t-sex ${isRoomSaved ? 'disabled' : ''}>
              <option value="">Indéterminé</option>
              <option value="M" ${t.sex === 'M' ? 'selected' : ''}>Masculin (M)</option>
              <option value="F" ${t.sex === 'F' ? 'selected' : ''}>Féminin (F)</option>
            </select></label>
            <label><span>Nationalité</span>${cuNationalitySelectorHtml(t, idx, 'grp_', isRoomSaved)}</label>
            <label><span>Date de naissance</span><input type="date" data-hx-t-birth value="${esc(t.birthDate || '')}" ${isRoomSaved ? 'disabled' : ''}></label>
            <label><span>N° de document</span><input data-hx-t-doc placeholder="Passeport / CNIE" value="${esc(t.idDocNumber || '')}" ${isRoomSaved ? 'disabled' : ''}></label>
            <label><span>Chambre attribuée *</span><select data-hx-t-room ${isRoomSaved ? 'disabled' : ''} ${isUnassigned ? 'style="border-color:var(--warn-ink);"' : ''}>
              <option value="">-- Sélectionner une chambre --</option>
              ${selected.filter(r => !savedRooms[r.id] || r.id === t.roomId).map(r => `<option value="${esc(r.id)}" ${t.roomId === r.id ? 'selected' : ''}>Ch. ${r.n} · ${esc(roomTypeOf(r.n).name)}</option>`).join('')}
            </select></label>
          </div>
        </div>
      `;
    };

    const renderTravelers = () => {
      travelersContainer.innerHTML = travelers.map((t, idx) => travelerRowHtml(t, idx)).join('');
      travelersCountLabel.textContent = `${travelers.length} voyageur${travelers.length > 1 ? 's' : ''}`;
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
        alerts.push(`<p class="hx-warn-note" style="color:var(--warn-ink);background:var(--warn-soft);padding:6px 10px;border-radius:6px;font-size:11.5px;margin:3px 0;">Attention : ${unassignedCount} voyageur(s) ne sont pas encore attribués à une chambre.</p>`);
      }

      selected.forEach(r => {
        const assigned = roomAssignedCounts.get(r.id) || 0;
        const max = roomTypeOf(r.n).maxGuests || 4;
        if (assigned === 0) {
          alerts.push(`<p class="hx-warn-note" style="color:var(--warn-ink);background:var(--warn-soft);padding:6px 10px;border-radius:6px;font-size:11.5px;margin:3px 0;">Chambre ${r.n} : aucun voyageur attribué.</p>`);
        } else if (assigned > max) {
          alerts.push(`<p class="hx-warn-note" style="color:var(--danger,#b91c1c);background:rgba(201,74,58,0.08);padding:6px 10px;border-radius:6px;font-size:11.5px;margin:3px 0;">Attention : Chambre ${r.n} dépasse sa capacité maximale (${assigned} / ${max} pers.).</p>`);
        }
      });

      const dups = names.filter((n, i) => names.indexOf(n) !== i);
      if (dups.length) {
        alerts.push(`<p class="hx-warn-note" style="color:var(--warn-ink);background:var(--warn-soft);padding:6px 10px;border-radius:6px;font-size:11.5px;margin:3px 0;">Noms en double détectés dans la liste des voyageurs. Vérifiez les homonymes.</p>`);
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
          previewArea.innerHTML = '<span style="color:var(--warn-ink);font-size:11.5px;">Veuillez coller du texte avant de prévisualiser.</span>';
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
          previewArea.innerHTML = '<span style="color:var(--warn-ink);font-size:11.5px;">Aucun voyageur valide détecté dans le texte.</span>';
          return;
        }

        form.__parsedImport = parsed;
        previewArea.innerHTML = `
          <div class="hx-import-preview-box">
            <table class="hx-import-preview-table">
              <thead><tr><th>#</th><th>Nom</th><th>Nationalité détectée</th><th>Document</th></tr></thead>
              <tbody>
                ${parsed.map((p, i) => `<tr><td>${i+1}</td><td><b>${esc(p.name)}</b></td><td>${esc(p.natLabel || p.natRaw || 'Indéterminée')}</td><td>${esc(p.doc || '-')}</td></tr>`).join('')}
              </tbody>
            </table>
          </div>
          <div style="display:flex;gap:8px;margin-top:6px;">
            <button type="button" class="hx-btn atlas" data-action="hx-confirm-import" style="font-size:11.5px;padding:4px 10px;">Confirmer l’import (${parsed.length} voyageurs)</button>
            <button type="button" class="hx-btn ghost" data-action="hx-cancel-import" style="font-size:11.5px;padding:4px 10px;">Annuler</button>
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
          toast(`${parsed.length} voyageur(s) importé(s)`, { type: 'success' });
        }
      } else if (e.target.closest('[data-action="hx-cancel-import"]')) {
        form.querySelector('[data-hx-import-preview-area]').innerHTML = '';
        delete form.__parsedImport;
      } else if (e.target.closest('[data-action="hx-simulate-group-quote"]')) {
        simulateQuotes();
      } else if (e.target.closest('[data-action="hx-discard-staged"]')) {
        localStorage.removeItem(stagedKey);
        try { localStorage.removeItem(intentKeyFor(groupDossierId)); } catch (_) {}
        savedRooms = {};
        failedRooms = {};
        quoteBreakdown = {};
        quoteAccepted = false;
        quoteRevision = null;
        quoteRevs = {};
        committedTerms = null;
        activeQuoteSignature = '';
        groupDossierId = 'grp_' + Date.now() + '_' + crypto.randomUUID().slice(0, 8);
        const recoverySlot = form.querySelector('[data-hx-group-recovery-slot]');
        if (recoverySlot) recoverySlot.innerHTML = '';
        lockCommittedFields();
        renderRooms();
        renderTravelers();
        updateRoomsSummary();
        toast('Brouillon local abandonné. Nouveau dossier prêt.', { type: 'info' });
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
      toast('Dossier en cours de finalisation restauré (' + groupDossierId + '). Les chambres seront revérifiées auprès du serveur avant tout nouvel enregistrement.', { type: 'info' });
    } else if (intentNotice === 'other-pending' && pendingIntent) {
      toast('Un autre dossier (' + pendingIntent.dossierId + ') attend encore sa finalisation. Terminez ou abandonnez ce brouillon pour le reprendre.', { type: 'info' });
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (form.__hxSubmitting) return;
      errorEl.textContent = '';
      const submitBtn = form.querySelector('[data-hx-group-submit]');

      if (initialScope !== cuStayScope() || initialMerchant !== cuMerchantSlug()) {
        errorEl.textContent = 'L’hôtel actif a changé. Ce dossier ne peut pas être finalisé dans un autre établissement.';
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

      if (!groupName) { errorEl.textContent = 'Indiquez le nom du groupe.'; return; }
      if (!contactName) { errorEl.textContent = 'Indiquez le contact principal.'; return; }
      if (!checkIn || !checkOut || checkOut <= checkIn) { errorEl.textContent = 'Vérifiez les dates d’arrivée et de départ.'; return; }
      if (selectedRoomIds.size === 0) { errorEl.textContent = 'Sélectionnez au moins une chambre pour le groupe.'; return; }

      // Check unassigned travelers
      const unassigned = travelers.filter(t => !t.roomId);
      if (unassigned.length > 0) {
        errorEl.textContent = 'Tous les voyageurs doivent être attribués à une chambre. Veuillez attribuer ou retirer les ' + unassigned.length + ' voyageur(s) sans chambre.';
        return;
      }

      // Check room capacity
      const selected = allRooms.filter(r => selectedRoomIds.has(r.id));
      for (const room of selected) {
        const assignedCount = travelers.filter(t => t.roomId === room.id).length;
        const maxCap = roomTypeOf(room.n).maxGuests || 4;
        if (assignedCount === 0) {
          errorEl.textContent = 'La chambre ' + room.n + ' n’a aucun voyageur attribué.';
          return;
        }
        if (assignedCount > maxCap) {
          errorEl.textContent = 'La chambre ' + room.n + ' dépasse sa capacité maximale (' + assignedCount + ' / ' + maxCap + ' pers.).';
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
        errorEl.textContent = 'Veuillez simuler et accepter le devis commercial pour cette formule de séjour avant de confirmer le groupe.';
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
            ? `sans tarif logement pour « ${roomTypeOf(missingRoom.n).name} »`
            : (miss.includes('dates') ? 'dates du séjour invalides' : `sans tarif « ${cuBoards[board] || board} » pour « ${roomTypeOf(missingRoom.n).name} »`);
          errorEl.textContent = `Chambre ${missingRoom.n} ${what}. Renseignez le tarif dans Types de chambres, ou réservez cette chambre en prix convenu depuis sa fiche individuelle.`;
          return;
        }
      }
      if (contractMode) {
        if (!activeQuoteSignature || activeQuoteSignature !== cuGroupQuoteSignature() || quoteRevision == null) {
          errorEl.textContent = 'Le devis accepté ne correspond plus au dossier (dates, chambres, voyageurs ou formule ont changé). Relancez la simulation.';
          return;
        }
        const pendingRooms = allRooms.filter(r => selectedRoomIds.has(r.id) && !savedRooms[r.id]);
        const incomplete = pendingRooms.find(r => {
          const q = quoteBreakdown[r.id];
          return !q || !Array.isArray(q.rows) || !Number.isSafeInteger(q.totalCents) || quoteRevs[r.id] !== quoteRevision;
        });
        if (incomplete) {
          errorEl.textContent = 'Devis incomplet ou périmé pour la chambre ' + incomplete.n + '. Relancez la simulation pour l’ensemble du groupe.';
          return;
        }
        try {
          const revRes = await fetch('/api/hotel/commercial?merchant=' + encodeURIComponent(initialMerchant), { cache: 'no-store' });
          const revBody = await revRes.json().catch(() => ({}));
          if (revRes.ok && Number.isSafeInteger(revBody.rev) && revBody.rev !== quoteRevision) {
            invalidateQuote();
            errorEl.textContent = 'Le répertoire commercial a changé (révision ' + quoteRevision + ' → ' + revBody.rev + ') depuis le devis accepté. Relancez la simulation avant de confirmer.';
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
        errorEl.textContent = 'Ce dossier a changé depuis son enregistrement partiel et ne peut pas être repris tel quel. Abandonnez le brouillon local pour recommencer un dossier propre.';
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
        errorEl.textContent = 'Impossible de sécuriser l’intention de réservation en stockage local (' + (storageErr.message || 'quota dépassé') + '). Aucune chambre n’a été enregistrée : libérez de l’espace ou autorisez le stockage, puis relancez la confirmation.';
        return;
      }
      // Read the record back: the loop below iterates the persisted attempt,
      // proving the payloads were durable before the first booking write.
      const attempt = readIntent(groupDossierId);
      if (!attempt || attempt.status === 'complete' || !Array.isArray(attempt.rooms) || attempt.rooms.length !== roomPlans.length) {
        errorEl.textContent = 'Intention de réservation illisible après écriture. Aucune chambre n’a été enregistrée : réessayez la confirmation.';
        return;
      }
      if (!persistStaged()) {
        toast('Brouillon local non sauvegardé (stockage indisponible). La reprise reste assurée par l’intention durable du dossier.', { type: 'warn' });
      }

      form.__hxSubmitting = true;
      form.classList.add('is-submitting');
      submitBtn.disabled = true;
      errorEl.textContent = 'Contrôle des disponibilités et enregistrement des chambres…';

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
            const errMsg = 'La chambre ' + (entry.roomN || entry.roomId) + ' n’existe plus au plan. Retirez-la du dossier pour continuer.';
            failedRooms[entry.roomId] = errMsg;
            persistStaged();
            renderRooms();
            throw new Error(errMsg);
          }
          const payload = entry.payload;
          const clientRef = entry.clientRef;
          if (initialScope !== cuStayScope() || initialMerchant !== cuMerchantSlug() || openModal?.el !== m.el || !form.isConnected) {
            throw new Error('L’hôtel actif a changé pendant l’enregistrement.');
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
            throw new Error('L’hôtel actif a changé pendant la vérification.');
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
            const errMsg = 'La chambre ' + room.n + ' n’a pas pu être revérifiée auprès du serveur (réconciliation indisponible). La reprise est en pause : réessayez avec le serveur joignable. Rien n’a été validé à tort.';
            failedRooms[room.id] = errMsg;
            persistStaged();
            renderRooms();
            throw new Error(errMsg);
          }

          if (existingBooking) {
            const problem = adoptionProblem(existingBooking, payload, room);
            if (problem) {
              const errMsg = problem.kind === 'cancelled'
                ? 'La réservation existante pour la chambre ' + room.n + ' est annulée ou non présentée (' + existingBooking.status + ').'
                : 'Incompatibilité (' + problem.field + ') détectée pour la réservation existante (' + existingBooking.id + ') de la chambre ' + room.n + '. Le serveur a une version différente : aucune écriture, utilisez un avenant explicite.';
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
            const errMsg = 'La réponse du serveur pour la chambre ' + room.n + ' a été perdue (' + ((netErr && netErr.message) || 'réseau') + '). La réservation sera vérifiée à la reprise.';
            failedRooms[room.id] = errMsg;
            persistStaged();
            renderRooms();
            throw new Error(errMsg);
          }
          const body = await res.json().catch(() => ({}));

          if (initialScope !== cuStayScope() || initialMerchant !== cuMerchantSlug() || openModal?.el !== m.el || !form.isConnected) {
            throw new Error('L’hôtel actif a changé pendant l’enregistrement.');
          }

          if (!res.ok || !body.booking) {
            const errMsg = cuCommercialError(body.error) || body.error || 'chambre indisponible';
            failedRooms[room.id] = errMsg;
            persistStaged();
            renderRooms();
            throw new Error('Erreur sur la chambre ' + room.n + ' : ' + errMsg);
          }

          // The POST answer goes through the same gate (follow-up): a
          // malformed record is a failed write, never an adoption, and an
          // idempotent replay is only adopted when it still matches what we
          // would write — a replay carrying another device's edits must fail
          // here, not masquerade as our fresh booking.
          const returned = asBookingRecord(body.booking);
          if (!returned || (typeof returned.publicRef === 'string' && returned.publicRef !== '' && returned.publicRef !== clientRef)) {
            const errMsg = 'La réponse du serveur pour la chambre ' + room.n + ' est inexploitable. La reprise est en pause : réessayez avec le serveur joignable.';
            failedRooms[room.id] = errMsg;
            persistStaged();
            renderRooms();
            throw new Error(errMsg);
          }
          const postProblem = adoptionProblem(returned, payload, room);
          if (postProblem) {
            const errMsg = postProblem.kind === 'cancelled'
              ? 'La réservation retournée pour la chambre ' + room.n + ' est annulée ou non présentée.'
              : 'Incompatibilité (' + postProblem.field + ') détectée pour la réservation retournée (' + returned.id + ') de la chambre ' + room.n + '. Le serveur a une version différente : aucune écriture, utilisez un avenant explicite.';
            failedRooms[room.id] = errMsg;
            persistStaged();
            renderRooms();
            throw new Error(errMsg);
          }

          savedRooms[room.id] = returned;
          delete failedRooms[room.id];
          initialCache.set(returned.id, returned);
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
        toast('Réservation de groupe enregistrée', {
          type: 'success',
          desc: groupName + ' · ' + Object.keys(savedRooms).length + ' chambre(s) confirmée(s).',
        });
        rerender();
      } catch (err) {
        if (initialScope !== cuStayScope() || initialMerchant !== cuMerchantSlug() || openModal?.el !== m.el || !form.isConnected) {
          return;
        }
        errorEl.textContent = (err.message || 'Échec de la réservation de groupe.') + (Object.keys(savedRooms).length ? ' Les chambres déjà enregistrées (' + Object.keys(savedRooms).length + ') restent conservées sous le dossier ' + groupDossierId + '.' : '');
        if (Object.keys(savedRooms).length > 0) {
          submitBtn.textContent = 'Reprendre la confirmation (' + Object.keys(savedRooms).length + ' enregistrée(s))';
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
    if (form.__hxStayScope !== cuStayScope()) { error.textContent = 'L’hôtel actif a changé. Fermez ce dossier et rouvrez-le dans le bon établissement.'; return; }
    // The board selector lives in the commercial box: submitting before it
    // wires would silently fall back to room_only. Wait for it when the box
    // exists but is still loading; callers without the box (or with a failed
    // directory, where no meal choice exists) keep the legacy room-only path.
    if (form.querySelector('[data-hx-commercial-stay]') && !form.__commercialReady && !form.__commercialFailed) { error.textContent = 'Tarifs en cours de chargement. Patientez quelques secondes puis réessayez.'; return; }
    const slug = cuMerchantSlug();
    const guestRows = [];
    const guestEls = Array.from(form.querySelectorAll('[data-hx-guest-row]'));
    for (let gi = 0; gi < guestEls.length; gi++) {
      const row = guestEls[gi];
      const birth = cuBirthIso(row.querySelector('[data-hx-guest-birth]')?.value);
      if (!birth.ok) {
        error.textContent = `Date de naissance invalide (voyageur ${gi + 1}). Utilisez le format JJ/MM/AAAA.`;
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
      error.textContent = 'La catégorie « ' + (selectedType.name || roomTypeId) + ' » ne peut pas accueillir ' + partySize + ' personnes (capacité max : ' + (selectedType.maxGuests || 4) + ').';
      return;
    }

    const payload = { action: 'save', merchant: slug, id: booking?.id || '', clientRef: form.__hxClientRef, roomTypeId, resourceId: fd.get('resourceId'), checkIn: fd.get('checkIn'), checkOut: fd.get('checkOut'), partySize, channel: fd.get('channel'), status: fd.get('status'), externalRef: fd.get('externalRef'), note: fd.get('note'), guests, customer: { name: fd.get('name'), phone: fd.get('phone'), email: fd.get('email') } };
    payload.linkedStayId = form.__hxLinkedStayId || '';
    payload.dayUse = form.elements.stayMode?.value === 'day_use';
    if (payload.dayUse) {
      const price = String(fd.get('dayUsePrice') || '').trim().replace(',', '.');
      if (!/^\d{1,7}(\.\d{1,2})?$/.test(price)) { error.textContent = 'Saisissez le forfait day-use convenu, avec deux décimales maximum.'; return; }
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
            if (!/^\d{1,7}(\.\d{1,2})?$/.test(agreedNow.amount) || !(Number(agreedNow.amount) > 0)) { error.textContent = 'Montant convenu invalide : un total TTC en MAD, supérieur à zéro.'; return; }
            if (agreedNow.reason.length < 3) { error.textContent = 'Indiquez le motif du prix convenu (3 caractères minimum). Il sera enregistré sur la réservation avec votre identité.'; return; }
            payload.directPricing = { agreed: true, amountCents: Math.round(Number(agreedNow.amount) * 100), reason: agreedNow.reason.slice(0, 280), board, occupancy: partySize };
          } else if (!dq.ok) {
            if (booking && board === 'room_only' && !storedNow) {
              // Legacy room-only edit without a configured rate: keep the
              // previous behavior (server-side rate × nights) rather than
              // bricking the edit. New bookings never take this path.
            } else {
              const typeName = typeNow ? typeNow.name : 'cette catégorie';
              const what = dq.missing.includes('dates')
                ? 'Dates du séjour invalides.'
                : (dq.missing.includes('room')
                  ? `Aucun tarif logement configuré pour « ${typeName} ».`
                  : `Aucun tarif « ${cuBoards[board] || board} » configuré pour « ${typeName} ».`);
              error.textContent = what + (dq.missing.includes('dates') ? '' : ' Renseignez-le dans Types de chambres, ou convenez un prix ci-dessous.');
              return;
            }
          } else {
            if (booking && storedNow && inputsMoved) {
              const rw = form.querySelector('[data-hx-reprice-confirm]');
              if (!rw || !rw.checked) { error.textContent = 'Le tarif a changé : vérifiez le nouveau total affiché puis confirmez la revalorisation.'; return; }
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
        error.textContent = 'Formule repas ou tarif contractuel : simulez le contrat et cochez l’acceptation du prix avant de valider.';
        return;
      }
    }
    if (!slug) { error.textContent = 'Cette boutique n’est pas encore reliée à son compte Kiwi.'; return; }
    form.__hxSubmitting = true; submit.disabled = true; error.textContent = '';
    const scope = cuStayScope(), cache = cuStayCache();
    try {
      const res = await fetch('/api/hotel/stays', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.booking) {
        const messages = {
          'room-unavailable': 'Cette chambre vient d’être prise sur ces dates. Choisissez-en une autre.',
          'room-type-not-found': 'La catégorie choisie ne peut pas accueillir ' + partySize + ' personnes. Ajustez le nombre d’occupants ou changez de catégorie.',
          'duplicate-reference': 'Cette référence OTA existe déjà.',
          'invalid-dates': 'Les dates du séjour sont invalides.',
          'account-required': 'Sélectionnez un compte commercial avant de simuler un contrat.',
          'account-archived': 'Le compte commercial sélectionné est archivé. Choisissez un compte actif ou réactivez-le dans le Cardex.',
          'account-not-found': 'Le compte commercial sélectionné est introuvable pour cet établissement.',
          'invalid-formula': 'La tarification contractuelle couvre de 1 à 3 personnes. Ajustez le nombre d’occupants.',
          invalid: 'Complétez le nom, les dates et la catégorie.',
          unauthorized: 'Votre session a expiré. Reconnectez-vous.'
        };
        error.textContent = messages[body.error] || cuCommercialError(body.error); return;
      }
      cache.set(body.booking.id, body.booking);
      if (scope !== cuStayScope() || cuMerchantSlug() !== slug) { return; }
      const doc = window.KiwiReservations?.get?.();
      if (doc && Array.isArray(doc.bookings)) {
        const i = doc.bookings.findIndex((x) => x.id === body.booking.id);
        if (i < 0) doc.bookings.push(body.booking); else doc.bookings[i] = body.booking;
        window.KiwiReservations.set(doc);
      }
      modal?.close?.();
      if (openModal?.el === modal?.el) openModal = null;
      toast('Séjour enregistré · ch. ' + (cuState().rooms && Object.values(cuState().rooms).find((r) => r.id === body.booking.resourceId)?.n || ''), { type: 'success', desc: body.booking.hotel.checkIn + ' → ' + body.booking.hotel.checkOut + ' · ' + (body.booking.hotel.channel || 'direct') });
      rerender();
    } catch (_) { error.textContent = 'Réponse serveur non reçue. Vérifiez le dossier ou réessayez : la même référence sera conservée pour éviter un doublon.'; }
    finally { form.__hxSubmitting = false; submit.disabled = false; }
  }

  async function cuCancelStay(id, button, modal) {
    const slug = cuMerchantSlug();
    if (!slug || !id) return;
    const scope = cuStayScope(), cache = cuStayCache();
    button.disabled = true;
    try {
      const res = await fetch('/api/hotel/stays', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'cancel', merchant: slug, id }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.booking) { toast('Annulation impossible', { type: 'warn', desc: body.error || 'Réessayez.' }); return; }
      cache.set(body.booking.id, body.booking);
      if (scope !== cuStayScope() || cuMerchantSlug() !== slug) { return; }
      const doc = window.KiwiReservations?.get?.();
      if (doc && Array.isArray(doc.bookings)) {
        const i = doc.bookings.findIndex((x) => x.id === body.booking.id);
        if (i >= 0) doc.bookings[i] = body.booking;
        window.KiwiReservations.set(doc);
      }
      modal?.close?.();
      if (openModal?.el === modal?.el) openModal = null;
      toast('Séjour annulé dans Kiwi', { type: 'success', desc: 'La disponibilité directe est mise à jour. Vérifiez séparément l’annulation sur l’OTA ou auprès de l’agence.' });
      rerender();
    } catch (_) { toast('Confirmation non reçue', { type: 'warn', desc: 'Actualisez le dossier pour vérifier si l’annulation a été enregistrée.' }); }
    finally { button.disabled = false; }
  }
  const cuCommercialByScope = new Map();
  const cuBoards = { room_only: 'Logement seul', bb: 'Bed & Breakfast', hb_lunch: 'Demi-pension · déjeuner', hb_dinner: 'Demi-pension · dîner', full_board: 'Pension complète' };
  const cuKinds = { individual: 'Particulier', agency: 'Agence', company: 'Société' };
  function cuStayQuoteSignature(form) {
    return JSON.stringify(['accountId', 'roomTypeId', 'checkIn', 'checkOut', 'partySize', 'board', 'priceMode'].map(k => form.elements[k]?.value || ''));
  }
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
  function cuDirectQuote(input) {
    const { typeRate = null, baseRate = null, boardRates = null, board = 'room_only', checkIn = '', checkOut = '', occupancy = 1 } = input || {};
    const roomRate = typeRate == null ? baseRate : typeRate;
    if (roomRate == null || !Number.isFinite(+roomRate) || +roomRate < 0) return { ok: false, missing: ['room'] };
    const start = Date.parse(checkIn + 'T12:00:00Z'), end = Date.parse(checkOut + 'T12:00:00Z');
    const nights = Math.round((end - start) / 86400000);
    if (!Number.isFinite(nights) || nights < 1 || nights > 365) return { ok: false, missing: ['dates'] };
    let meal = 0;
    if (board !== 'room_only') {
      const sup = boardRates && typeof boardRates === 'object' ? boardRates[board] : null;
      if (sup == null || sup === '' || !Number.isFinite(+sup) || +sup < 0) return { ok: false, missing: ['meal'] };
      meal = +sup;
    }
    const roomCents = Math.round(+roomRate * 100);
    const mealCents = Math.round(meal * 100);
    const qty = Math.max(1, Math.round(Number(occupancy) || 1));
    const rows = [];
    for (let i = 0; i < nights; i++) {
      const d = new Date(start + i * 86400000).toISOString().slice(0, 10);
      rows.push({ date: d, roomCents, mealCents, quantity: qty, amountCents: roomCents + mealCents * qty });
    }
    return { ok: true, rows, totalCents: rows.reduce((s, r) => s + r.amountCents, 0), nights, roomCents, mealCents };
  }
  function cuQuoteRows(q) {
    const period = q.contract?.from && q.contract?.to ? `${esc(q.contract.from)} → ${esc(q.contract.to)}` : '';
    const occupancyLabel = ['', 'Single · 1 personne', 'Double · 2 personnes', 'Triple · 3 personnes'][q.contract?.occupancy] || (q.contract?.occupancy ? `${q.contract.occupancy} pers.` : '');
    const accountName = q.account?.name || '';
    const boardLabel = cuBoards[q.contract?.board] || q.contract?.board || '';
    return `<div class="hx-simulation-notice"><strong>Simulation contractuelle informative</strong> · Aucune réservation ni blocage créé à cette étape.${accountName ? `<div>Compte : <b>${esc(accountName)}</b>${q.account?.paymentDays ? ` · Échéance ${q.account.paymentDays} j` : ''}</div>` : ''}${occupancyLabel ? `<div>Formule : ${esc(occupancyLabel)} · ${esc(boardLabel)}${period ? ` (${period})` : ''}</div>` : ''}</div><div class="hx-quote-lines">${q.rows.map(r => `<div><span>${esc(r.date)} · ${esc(r.label)}</span><span>${r.quantity} × ${(r.unitCents / 100).toFixed(2)} = <b>${(r.amountCents / 100).toFixed(2)} MAD</b></span></div>`).join('')}</div><p class="hx-total-band"><span>Total formule : </span><b>${(q.totalCents / 100).toFixed(2)} MAD ${q.taxBasis === 'exclusive' ? 'HT' : 'TTC'}</b></p><small>Simulation de séjour, pas une facture. Taxes locales, extras et réductions enfants non calculés ici.</small>`;
  }
  async function cuWireStayCommercial(form, booking) {
    const box = form.querySelector('[data-hx-commercial-stay]');
    if (!box) return;
    const scope = cuStayScope();
    await cuLoadCommercial();
    if (scope !== cuStayScope() || form.isConnected === false) return;
    const st = cuCommercialState();
    if (!st.loaded || st.error) { box.innerHTML = `<legend>Compte & formule</legend><p>${esc(st.error || 'Répertoire indisponible. Les informations existantes sont conservées.')}</p>`; form.__commercialFailed = true; return; }
    // A direct-priced booking without a commercial block (empty booker at
    // save time nulls it) still owns its formula via the pricing snapshot:
    // reopening must show it, never silently fall back to room-only.
    const c = { ...(booking?.commercial || {}) };
    if (!c.board && booking?.pricing?.board) c.board = booking.pricing.board;
    const hasAccount = !!c.accountId;
    box.innerHTML = `<legend>Compte & formule de réservation</legend><div class="hx-room-form hx-type-form"><label><span>Compte à facturer</span><select name="accountId"><option value="">Voyageur · sans compte commercial</option>${st.accounts.filter(a => !a.archived || a.id === c.accountId).map(a => `<option value="${esc(a.id)}" ${a.id === c.accountId ? 'selected' : ''}>${esc(cuKinds[a.kind] + ' · ' + a.name)}${a.archived ? ' (archivé)' : ''}</option>`).join('')}</select></label><label><span>Mode tarifaire</span><select name="priceMode"><option value="catalogue" ${c.quoted ? 'disabled' : ''}>Tarif maison · sans compte</option><option value="contract" ${c.quoted ? 'selected' : ''} ${!hasAccount ? 'disabled' : ''}>Contrat du compte</option></select></label><label><span>Réservant / interlocuteur</span><input name="booker" maxlength="160" value="${esc(c.booker || '')}"></label><label><span>Voucher / bon de commande</span><input name="voucher" maxlength="100" value="${esc(c.voucher || '')}"></label><label><span>Formule</span><select name="board">${Object.entries(cuBoards).map(([v,l]) => `<option value="${v}" ${v === c.board ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div><p data-hx-commercial-help></p><button type="button" class="hx-btn ghost" data-hx-quote>Simuler le contrat</button><div data-hx-quote-result role="status">${c.quote ? '<p>Tarif précédemment accepté et conservé :</p>' + cuQuoteRows(c.quote) : ''}</div>
    <div data-hx-direct-panel hidden><div data-hx-direct-breakdown role="status"></div>
      <div data-hx-agreed-box hidden style="margin-top:8px;padding:10px;border:1px dashed var(--n-200);border-radius:8px;">
        <b style="font-size:12px;">Prix convenu avec le client</b>
        <p style="font-size:11.5px;color:var(--n-600);margin:4px 0;">Uniquement parce qu’aucun tarif configuré ne couvre cette demande. Le montant, le motif et votre identité seront enregistrés sur la réservation.</p>
        <div data-hx-agreed-by style="font-size:11.5px;color:var(--n-600);"></div>
        <label><span>Montant total TTC convenu · MAD</span><input data-hx-agreed-amount inputmode="decimal" placeholder="Ex. 950"></label>
        <label><span>Motif</span><input data-hx-agreed-reason maxlength="280" placeholder="Ex. geste commercial, dernière chambre"></label>
        <label class="hx-check-row"><input type="checkbox" data-hx-agreed-confirm> <span>Je confirme ce prix convenu pour ce séjour.</span></label>
      </div>
        <label class="hx-check-row" data-hx-reprice-wrap hidden><input type="checkbox" data-hx-reprice-confirm> <span data-hx-reprice-label></span></label>
    </div>`;
    if (booking && ['completed', 'cancelled', 'no_show'].includes(booking.status)) { box.disabled = true; return; }
    form.__commercialReady = true;
    const previewButton = box.querySelector('[data-hx-quote]'), result = box.querySelector('[data-hx-quote-result]');
    // Mode switch (defect: ordinary travelers need no account). Contract UI
    // only makes sense with an account; without one the stay is priced from
    // the hotel's own type configuration, shown live below.
    const syncCommercialMode = () => {
      const noAccount = !form.elements.accountId?.value;
      const priceModeEl = form.elements.priceMode;
      const contractOpt = (priceModeEl && typeof priceModeEl.querySelector === 'function')
        ? priceModeEl.querySelector('option[value="contract"]')
        : null;
      if (contractOpt) contractOpt.disabled = noAccount;
      if (noAccount && form.elements.priceMode) form.elements.priceMode.value = 'catalogue';
      if (previewButton) previewButton.hidden = noAccount;
      const help = box.querySelector('[data-hx-commercial-help]');
      if (help) {
        help.textContent = noAccount
          ? 'Sans compte : séjour chiffré au tarif maison (logement + formule, configurés dans Types de chambres). Aucun contrat requis.'
          : 'Avec compte : simulez le contrat et acceptez le prix avant confirmation. Occupation totale de 1 à 3 personnes, sans calcul enfant automatique.';
      }
      updateDirectQuote();
    };
    // Pricing inputs captured at open (defects 1+3): guest, contact, note,
    // status and traveler-detail edits must preserve the accepted snapshot
    // without renegotiation. Only these seven can move money.
    const PRICE_INPUTS = ['roomTypeId', 'checkIn', 'checkOut', 'partySize', 'board', 'accountId', 'priceMode'];
    const readPriceInputs = () => {
      const o = {};
      PRICE_INPUTS.forEach(k => { o[k] = String(form.elements[k]?.value ?? ''); });
      return o;
    };
    const pricingBaseline = booking ? readPriceInputs() : null;
    const storedDirect = (booking && booking.pricing && booking.pricing.kind === 'direct') ? booking.pricing : null;
    const storedQuoted = !!(booking && booking.commercial && booking.commercial.quoted);
    const hasStoredPricing = !!(storedDirect || storedQuoted);
    const pricingInputsChanged = () => {
      if (!booking || !pricingBaseline) return true;
      return PRICE_INPUTS.some(k => String(form.elements[k]?.value ?? '') !== String(pricingBaseline[k] ?? ''));
    };
    const storedAgreed = (storedDirect && storedDirect.agreed) ? storedDirect : null;
    const agreedInputsNow = () => ({
      amount: String(box.querySelector('[data-hx-agreed-amount]')?.value || '').trim().replace(',', '.'),
      reason: String(box.querySelector('[data-hx-agreed-reason]')?.value || '').trim(),
      checked: !!box.querySelector('[data-hx-agreed-confirm]')?.checked,
    });
    const agreedFieldsDiffer = () => {
      if (!storedAgreed) return false;
      const cur = agreedInputsNow();
      const sameAmount = Math.round(Number(cur.amount) * 100) === Number(storedAgreed.totalCents || 0);
      return !(cur.amount !== '' && sameAmount && cur.reason === String(storedAgreed.reason || ''));
    };
    const updateDirectQuote = () => {
      const panel = box.querySelector('[data-hx-direct-panel]');
      if (!panel) return;
      const noAccount = !form.elements.accountId?.value;
      const day = form.elements.stayMode?.value === 'day_use';
      if (!noAccount || day) { panel.hidden = true; form.__directQuote = null; return; }
      panel.hidden = false;
      const changed = pricingInputsChanged();
      // Pristine edit on accepted direct pricing: show the SAVED snapshot,
      // never a live recompute that a catalogue change could have moved.
      if (booking && storedDirect && !changed && !agreedFieldsDiffer()) {
        const sp = storedDirect;
        form.__directQuote = null;
        const area = box.querySelector('[data-hx-direct-breakdown]');
        if (area) {
          const when = Number(sp.acceptedAt) > 0 ? new Date(sp.acceptedAt).toLocaleDateString('fr-FR') : '';
          const rows = (sp.rows || []).map(r => `<div><span>${esc(r.date)} · Logement ${(Number(r.roomCents || 0) / 100).toFixed(2)}${Number(r.mealCents || 0) ? ` + repas ${((Number(r.mealCents || 0) * Number(r.quantity || 1)) / 100).toFixed(2)} (${Number(r.quantity || 1)} pers.)` : ''}</span><span><b>${(Number(r.amountCents || 0) / 100).toFixed(2)} MAD</b></span></div>`).join('');
          area.innerHTML = `<div class="hx-quote-lines">${rows}</div><p class="hx-total-band"><span>Total séjour : </span><b>${(Number(sp.totalCents || 0) / 100).toFixed(2)} MAD TTC</b></p>`
            + (sp.agreed
              ? `<small>Prix convenu accepté${when ? ' le ' + esc(when) : ''} · motif : ${esc(sp.reason || '—')}${sp.agreedBy ? ` · par ${esc(sp.agreedBy.role || '')} ${esc(sp.agreedBy.id || '')}` : ''} · conservé tant que le séjour ne change pas.</small>`
              : `<small>Tarif accepté${when ? ' le ' + esc(when) : ''} · conservé tant que les dates, la chambre, la formule ou le compte ne changent pas.</small>`);
        }
        const rw = box.querySelector('[data-hx-reprice-wrap]');
        if (rw) rw.hidden = true;
        return;
      }
      const type = cuTypes().find(t => t.id === form.elements.roomTypeId?.value);
      const q = cuDirectQuote({
        typeRate: type ? type.rate : null, baseRate: cuState().baseRate, boardRates: type ? type.boardRates : null,
        board: form.elements.board?.value || 'room_only',
        checkIn: form.elements.checkIn?.value || '', checkOut: form.elements.checkOut?.value || '',
        occupancy: Number(form.elements.partySize?.value) || 1,
      });
      const area = box.querySelector('[data-hx-direct-breakdown]');
      const agreedBox = box.querySelector('[data-hx-agreed-box]');
      if (q.ok) {
        form.__directQuote = { rows: q.rows, totalCents: q.totalCents, nights: q.nights };
        if (area) {
          area.innerHTML = `<div class="hx-quote-lines">${q.rows.map(r => `<div><span>${esc(r.date)} · Logement ${(r.roomCents / 100).toFixed(2)}${r.mealCents ? ` + repas ${esc(String((r.mealCents * r.quantity / 100).toFixed(2)))} (${r.quantity} pers.)` : ''}</span><span><b>${(r.amountCents / 100).toFixed(2)} MAD</b></span></div>`).join('')}</div><p class="hx-total-band"><span>Total séjour : </span><b>${(q.totalCents / 100).toFixed(2)} MAD TTC</b></p><small>Tarifs maison · TVA incluse. Vérifié à nouveau côté serveur avant enregistrement.</small>`;
        }
        if (agreedBox) { agreedBox.hidden = true; const cb = agreedBox.querySelector('[data-hx-agreed-confirm]'); if (cb) cb.checked = false; }
        // Explicit reviewed repricing (defect 1): on an edit whose inputs
        // moved money, the new total needs its own confirmation click.
        const rw = box.querySelector('[data-hx-reprice-wrap]');
        if (rw) {
          const needReprice = !!(booking && storedDirect && pricingInputsChanged());
          rw.hidden = !needReprice;
          if (needReprice) {
            const label = rw.querySelector('[data-hx-reprice-label]');
            if (label) label.textContent = `Le nouveau total est de ${(q.totalCents / 100).toFixed(2)} MAD TTC — je l’ai vérifié.`;
          } else {
            const cb = rw.querySelector('[data-hx-reprice-confirm]');
            if (cb) cb.checked = false;
          }
        }
      } else {
        form.__directQuote = null;
        if (area) {
          const typeName = type ? type.name : 'cette catégorie';
          const what = q.missing.includes('room')
            ? `Aucun tarif logement configuré pour « ${esc(typeName)} ».`
            : (q.missing.includes('dates') ? 'Dates du séjour invalides.' : `Aucun tarif « ${esc(cuBoards[form.elements.board?.value] || form.elements.board?.value || '')} » configuré pour « ${esc(typeName)} ».`);
          const cfgArg = (type && type.id && !q.missing.includes('dates'))
            ? `${type.id}:${form.elements.board?.value || 'room_only'}:${q.missing.includes('room') ? 'room' : 'meal'}` : '';
          area.innerHTML = `<p class="hx-warn-note" style="color:var(--warn-ink);background:var(--warn-soft);padding:8px 12px;border-radius:8px;font-size:12px;">${what} ${cfgArg ? `<button type="button" class="hx-link-btn" data-action="hx-configure-rate" data-arg="${esc(cfgArg)}">Configurer ce tarif dans Types de chambres</button>, ou convenez un prix ci-dessous.` : 'Renseignez-le dans Types de chambres, ou convenez un prix ci-dessous.'}</p>`;
        }
        if (agreedBox) {
          agreedBox.hidden = false;
          // Prefill once from the stored agreement so a deliberate change
          // starts from the authorized values; never overwrite typing.
          if (storedAgreed) {
            const amt = agreedBox.querySelector('[data-hx-agreed-amount]');
            const rsn = agreedBox.querySelector('[data-hx-agreed-reason]');
            const by = agreedBox.querySelector('[data-hx-agreed-by]');
            if (amt && !amt.value) amt.value = (Number(storedAgreed.totalCents || 0) / 100).toFixed(2);
            if (rsn && !rsn.value) rsn.value = storedAgreed.reason || '';
            if (by && !by.textContent) {
              const who = storedAgreed.agreedBy;
              by.textContent = 'Précédent prix convenu' + (who ? ` par ${who.role || ''} ${who.id || ''}`.trimEnd() : '') + '. Le modifier exige une nouvelle confirmation ci-dessous.';
            }
          }
        }
        const rw2 = box.querySelector('[data-hx-reprice-wrap]');
        if (rw2) rw2.hidden = true;
      }
    };
    const reset = e => {
      if (!['accountId', 'roomTypeId', 'checkIn', 'checkOut', 'partySize', 'board', 'priceMode'].includes(e.target?.name)) return;
      if (e.target?.name === 'accountId') syncCommercialMode();
      form.__commercialQuote = null;
      if (form.elements.accountId?.value) {
        result.textContent = 'Paramètres modifiés. Simulez le contrat avant confirmation.';
      } else {
        result.textContent = '';
      }
      updateDirectQuote();
    };
    form.addEventListener('input', reset); form.addEventListener('change', reset);
    form.elements.stayMode?.addEventListener('change', () => updateDirectQuote());
    form.addEventListener('hx-refresh-direct', () => updateDirectQuote());
    // Pricing-change detector for the submit gate (defects 1+3 live in
    // cuSubmitStay, a sibling scope): true on creates, or when any of the
    // seven money-moving inputs drifted since the editor opened.
    form.__pricingChanged = () => pricingInputsChanged();
    syncCommercialMode();
    previewButton.addEventListener('click', async () => {
      if (scope !== cuStayScope()) return;
      const signature = cuStayQuoteSignature(form), fd = new FormData(form);
      const accountId = fd.get('accountId');
      if (!accountId || !String(accountId).trim()) {
        result.innerHTML = '<p class="hx-warn-note" style="color:var(--warn-ink);background:var(--warn-soft);padding:8px 12px;border-radius:8px;font-size:12px;">Sélectionnez un compte commercial avant de simuler un contrat.</p>';
        return;
      }
      previewButton.disabled = true; form.__commercialQuote = null; result.textContent = 'Calcul des nuitées…';
      try {
        const res = await fetch('/api/hotel/commercial', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'quote', merchant: cuMerchantSlug(), accountId, roomTypeId: fd.get('roomTypeId'), checkIn: fd.get('checkIn'), checkOut: fd.get('checkOut'), occupancy: Number(fd.get('partySize')), board: fd.get('board') }) });
        const b = await res.json();
        if (scope !== cuStayScope() || signature !== cuStayQuoteSignature(form)) return;
        if (!res.ok) { result.textContent = cuCommercialError(b.error); return; }
        form.elements.priceMode.value = 'contract';
        form.__commercialQuote = { rev: b.rev, signature: cuStayQuoteSignature(form) };
        result.innerHTML = cuQuoteRows(b.quote) + (b.quote.taxBasis === 'inclusive' ? '<div class="hx-quote-accept-wrap"><label class="hx-check-row hx-quote-accept"><input type="checkbox" data-hx-accept-quote> <span>J’accepte ce prix pour la formule et les dates affichées.</span></label></div>' : '<p class="hx-warn-note" style="color:var(--warn-ink);margin-top:6px;">HT : configuration fiscale nécessaire avant confirmation du séjour.</p>');
      } catch (_) { result.textContent = 'Simulation indisponible. Aucun nouveau tarif accepté.'; }
      finally { previewButton.disabled = false; }
    });
  }
  function cuCommercialState() {
    const scope = cuStayScope();
    if (!cuCommercialByScope.has(scope)) cuCommercialByScope.set(scope, { accounts: [], contracts: [], rev: 0, loaded: false, loading: false, error: '', kind: '', search: '' });
    return cuCommercialByScope.get(scope);
  }
  function cuCommercialError(code) {
    return ({ stale: 'Le répertoire a changé sur un autre appareil. Actualisez avant de reprendre votre modification.',
      'rate-gap': 'Une ou plusieurs nuits n’ont aucun tarif. Complétez les dates du contrat.',
      'rate-overlap': 'Deux tarifs couvrent les mêmes dates pour ce compte, cette catégorie, cette occupation et cette formule.',
      'mixed-tax-basis': 'Le séjour mélange des tarifs HT et TTC. Harmonisez le contrat.',
      'account-required': 'Sélectionnez un compte commercial avant de simuler un contrat.',
      'account-archived': 'Le compte commercial sélectionné est archivé. Choisissez un compte actif ou réactivez-le dans le Cardex.',
      'account-not-found': 'Le compte commercial sélectionné est introuvable pour cet établissement.',
      'account-unavailable': 'Le compte commercial est absent ou archivé.',
      'room-type-not-found': 'La catégorie choisie ne peut pas accueillir ce nombre d’occupants ou est introuvable.',
      'room-unavailable': 'Cette chambre vient d’être prise sur ces dates. Choisissez-en une autre.',
      'invalid-price': 'Saisissez un montant positif ou nul, avec deux décimales maximum.',
      'quote-required': 'Simulez puis acceptez le tarif pour les dates et voyageurs sélectionnés.',
      'reprice-required': 'Les dates, la chambre, la formule ou le compte ont changé : vérifiez le nouveau tarif affiché puis confirmez.',
      'direct-pricing-required': 'Formule sans tarif : affichez le prix maison ci-dessus, ou convenez un prix avec le client.',
      'rate-missing': 'Aucun tarif configuré pour cette formule. Renseignez-le dans Types de chambres, ou convenez un prix.',
      'price-mismatch': 'Le tarif affiché ne correspond plus à la configuration. Recommencez la réservation.',
      'price-overflow': 'Montant trop élevé pour être enregistré. Vérifiez le tarif.',
      'mixed-pricing': 'Un séjour ne peut pas combiner compte commercial et tarif maison. Choisissez un seul mode.',
      'agreed-invalid': 'Prix convenu invalide : montant positif et motif de 3 caractères minimum.',
      'agreed-forbidden': 'Un prix convenu exige un responsable (propriétaire ou gérant).',
      'tax-configuration-required': 'Un tarif HT ne peut pas être confirmé avant configuration de la fiscalité hôtelière.',
      'feed-contract-unsupported': 'Un séjour importé par iCal ne peut pas encore recevoir un contrat tarifaire.',
      'closed-commercial': 'Les informations commerciales d’un dossier clôturé sont verrouillées.',
      'invalid-day-use': 'Le day-use nécessite une arrivée et un départ le même jour, avec une heure de départ après l’arrivée.',
      'day-use-price-required': 'Indiquez le forfait day-use convenu, sans tarif automatique par nuit.',
      'stay-mode-locked': 'Le type de séjour est fixé à la création. Créez un nouveau séjour pour le modifier.',
      'day-use-contract-unsupported': 'Les contrats par nuit ne sont pas applicables au day-use. Indiquez son forfait TTC.',
      'linked-stay-not-found': 'Le dossier d’origine est introuvable dans cet hôtel.',
      unauthorized: 'Accès réservé au compte propriétaire ou à la console opérateur.',
      'invalid-dates': 'Vérifiez les dates de début et de fin.',
      'invalid-formula': 'La tarification contractuelle couvre de 1 à 3 personnes (Single, Double ou Triple). Ajustez le nombre d’occupants.' })[code] || 'Enregistrement indisponible. Vérifiez les champs et réessayez.';
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
    return `<div class="hx-page hx-commercial"><div class="hx-commercial-head"><div><span class="hx-kicker">RELATIONS HÔTELIÈRES</span><h3>Chaque relation,<br>ses accords.</h3><p>Clients, agences & sociétés. Le voyageur reste distinct du réservant et du compte à facturer. Les tarifs acceptés sont conservés dans chaque séjour.</p></div><div class="hx-commercial-tools"><button class="hx-btn atlas" data-action="hx-account-new">+ Nouveau compte</button><button class="hx-btn ghost" data-action="clients-directory">Cardex voyageurs</button></div></div>
      <div class="hx-commercial-summary" aria-label="Comptes actifs">${Object.entries(cuKinds).map(([kind, label]) => `<div><span>${label}</span><strong>${st.loaded ? active.filter(a => a.kind === kind).length : '…'}</strong><small>comptes actifs</small></div>`).join('')}<div><span>Tarifs contractuels</span><strong>${st.loaded ? st.contracts.filter(r => !r.archived).length : '…'}</strong><small>périodes définies</small></div></div>
      <div class="hx-commercial-tools"><button class="hx-btn ghost" data-action="hx-contract-new">+ Tarif contractuel</button><button class="hx-btn ghost" data-action="hx-production">Production mensuelle</button><button class="hx-btn ghost" data-action="hx-commercial-refresh" ${st.loading ? 'disabled' : ''}>Actualiser</button></div>
      <form class="hx-commercial-filter" data-hx-commercial-filter><label>Type<select name="kind"><option value="">Tous les comptes</option>${Object.entries(cuKinds).map(([v,l]) => `<option value="${v}" ${st.kind === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label><label>Recherche<input name="search" type="search" value="${esc(st.search)}" placeholder="Nom, contact, ICE"></label><button class="hx-btn ghost" type="submit">Filtrer</button></form>
      <p class="hx-commercial-feedback" role="status">${esc(st.error || (st.loading ? 'Chargement du répertoire…' : `${accounts.length} compte(s) · ${contracts.filter(r => !r.archived).length} tarif(s) actif(s) dans cette sélection`))}</p>
      <div class="hx-commercial-grid">${accounts.map(a => `<article class="block hx-commercial-card"><div><span class="hx-kicker">${cuKinds[a.kind]}${a.archived ? ' · ARCHIVÉ' : ''}</span><h3>${esc(a.name)}</h3><p>${esc(a.legalName || a.contact || 'Identité de facturation à compléter')}</p><small>${esc([a.city, a.ice ? 'ICE ' + a.ice : '', 'Échéance ' + a.paymentDays + ' j'].filter(Boolean).join(' · '))}</small></div><div class="hx-commercial-tools"><button class="hx-btn ghost" data-action="hx-account-edit" data-arg="${esc(a.id)}">Modifier <span class="sr-only">${esc(a.name)}</span></button><button class="hx-btn ghost" data-action="hx-account-stays" data-arg="${esc(a.id)}">Voir les séjours <span class="sr-only">${esc(a.name)}</span></button></div></article>`).join('') || '<p>Aucun compte dans cette sélection. Créez une agence, une société ou un particulier.</p>'}</div>
      <div class="hx-h"><span class="t">Grille contractuelle</span><span class="s">Bornes inclusives · MAD · aucun tarif implicite hors période</span></div>
      <div class="hx-commercial-grid">${contracts.map(r => `<article class="block hx-commercial-card"><div><span class="hx-kicker">${esc(st.accounts.find(a => a.id === r.accountId)?.name || 'Compte indisponible')}${r.archived ? ' · ARCHIVÉ' : ''}</span><h3>${esc(r.name)}</h3><p>${esc(cuTypes().find(t => t.id === r.roomTypeId)?.name || r.roomTypeId)} · ${['', 'Single', 'Double', 'Triple'][r.occupancy]} · ${cuBoards[r.board]}</p><small>${esc(r.from)} → ${esc(r.to)}</small><p class="hx-commercial-price">${(r.amountCents / 100).toFixed(2)} <small>MAD / ${r.unit === 'person' ? 'personne' : 'chambre'} / nuit · ${r.taxBasis === 'inclusive' ? 'TTC' : 'HT'}</small></p></div><button class="hx-btn ghost" data-action="hx-contract-edit" data-arg="${esc(r.id)}">Modifier <span class="sr-only">${esc(r.name)}</span></button></article>`).join('') || '<p class="hx-commercial-empty">Aucun tarif dans cette sélection. Ajoutez une période négociée avec ses dates exactes. Septembre à décembre doit être défini explicitement.</p>'}</div></div>`;
  }
  const cuProductionByScope = new Map();
  function cuProductionState() {
    const scope = cuStayScope();
    if (!cuProductionByScope.has(scope)) cuProductionByScope.set(scope, {
      month: new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Casablanca', year: 'numeric', month: '2-digit' }).format(new Date()).slice(0, 7),
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
      if (st.request === sequence) st.error = e.message === 'production-limit' ? 'Ce mois dépasse la limite de lecture. Aucun total partiel n’est affiché.' : 'Production indisponible. Le registre complet est nécessaire ; aucun total n’est estimé depuis le cache.';
    } finally {
      if (st.request === sequence) st.loading = false;
      if (scope === cuStayScope() && st.request === sequence && openDrawer?.page === 'production') rerender();
    }
  }
  function cuProductionBody() {
    const st = cuProductionState(), r = st.report;
    return `<div class="hx-page hx-commercial hx-production"><div class="hx-commercial-head"><div><span class="hx-kicker">PRODUCTION MENSUELLE</span><h3>Qui remplit<br>vos chambres.</h3><p>Chambres-nuits réservées par compte ou canal. Séjours confirmés, en maison et terminés ; annulations, no-shows et demandes exclus.</p></div><button class="hx-btn ghost" data-action="hx-commercial">Retour aux comptes</button></div>
      <form data-hx-production-filter class="hx-commercial-filter"><label>Mois du séjour<input type="month" name="month" value="${esc(st.month)}" required min="0001-01" max="9998-12"></label><button type="submit" class="hx-btn atlas">Afficher le mois</button></form>
      <p class="hx-commercial-feedback" role="status">${esc(st.error || (st.loading ? 'Lecture du registre des réservations…' : 'Une chambre-nuit correspond à une chambre réservée pour une nuit. Ce ne sont ni des encaissements ni un relevé de présence.'))}</p>
      ${r ? `<div class="hx-commercial-summary"><div><span>Chambres-nuits</span><strong>${r.nights}</strong><small>sur le mois sélectionné</small></div><div><span>Réservations</span><strong>${r.reservations}</strong><small>croisant la période</small></div><div><span>Comptes & canaux</span><strong>${r.groups.length}</strong><small>avec une production</small></div><div><span>Sans chambre attribuée</span><strong>${r.unassigned}</strong><small>réservations incluses</small></div></div>
      <div class="hx-production-scroll" tabindex="0" role="region" aria-label="Tableau mensuel défilant horizontalement"><table class="hx-production-table"><caption>Chambres-nuits · ${esc(r.month)} · faites défiler pour consulter tous les jours</caption><thead><tr><th scope="col">Compte / canal</th><th scope="col">Total</th>${r.totals.map((_, i) => `<th scope="col"><abbr title="${esc(r.month + '-' + String(i + 1).padStart(2, '0'))}">${i + 1}</abbr></th>`).join('')}</tr></thead><tbody>${r.groups.map(g => `<tr><th scope="row"><b>${esc(g.name)}</b><small>${esc(cuKinds[g.kind] || 'Canal de réservation')}</small></th><td><strong>${g.nights}</strong></td>${g.days.map(n => `<td${n ? ' class="has-nights"' : ''}>${n || '·'}</td>`).join('')}</tr>`).join('')}</tbody><tfoot><tr><th scope="row">Total chambres-nuits</th><td>${r.nights}</td>${r.totals.map(n => `<td>${n}</td>`).join('')}</tr></tfoot></table></div>${!r.groups.length ? '<p class="hx-commercial-empty">Aucune réservation confirmée sur ce mois.</p>' : ''}
      <p class="hx-daily-note">La nuit du départ est exclue. Les séjours sans compte commercial sont regroupés par canal. Une réservation sans chambre attribuée reste comptée ; ce tableau ne mesure pas les chambres encore disponibles.</p>` : ''}</div>`;
  }
  async function cuAccountStays(id) {
    const scope = cuStayScope(), account = cuCommercialState().accounts.find(a => a.id === id);
    if (!account) return;
    const m = K().modal({ tag: cuKinds[account.kind], title: 'Séjours · ' + account.name, width: 800, desc: 'Dossiers rattachés à ce compte. Les montants réservés ne sont ni des encaissements ni un solde débiteur.', body: '<div data-hx-account-stays role="status">Chargement des dossiers…</div>' });
    const host = m.el.querySelector('[data-hx-account-stays]');
    try {
      const res = await fetch('/api/hotel/stays?' + new URLSearchParams({ merchant: cuChannelMerchant(), accountId: id, includeCancelled: '1' }), { cache: 'no-store' });
      const b = await res.json();
      if (scope !== cuStayScope()) { m.close(); return; }
      if (!res.ok || !Array.isArray(b.stays)) throw new Error('unavailable');
      host.innerHTML = `<p>${b.stays.length} dossier(s)${b.capped ? ' · limite de lecture atteinte, liste incomplète' : ''}${b.coverage === 'document' ? ' · document actif seulement, historique non vérifié' : ''}</p><div class="hx-commercial-grid">${b.stays.map(s => `<article class="block hx-commercial-card"><div><span class="hx-kicker">${esc(s.code)} · ${esc(({ confirmed: 'Confirmé', requested: 'Demandé', checked_in: 'En maison', completed: 'Terminé', cancelled: 'Annulé', no_show: 'No-show' })[s.status] || s.status)}</span><h3>${esc(s.customer?.name || '')}</h3><p>${esc(s.hotel?.checkIn)} → ${esc(s.hotel?.checkOut)} · ${esc(cuBoards[s.commercial?.board] || 'Logement seul')}</p><p>${Number(s.hotel?.total || 0).toFixed(2)} MAD réservés</p><small>${esc(s.commercial?.voucher || 'Sans voucher / bon de commande')}</small></div></article>`).join('') || '<p>Aucun séjour rattaché. Sélectionnez ce compte dans le dossier de réservation.</p>'}</div>`;
    } catch (_) { host.textContent = 'Historique indisponible. Aucun dossier n’a été modifié.'; }
  }
  async function cuCommercialEditor(kind, id) {
    const scope = cuStayScope();
    await cuLoadCommercial();
    if (scope !== cuStayScope()) return;
    const st = cuCommercialState();
    if (!st.loaded || st.error) { toast(st.error || 'Répertoire indisponible', { type: 'warn' }); return; }
    const key = kind === 'account' ? 'accounts' : 'contracts';
    const old = st[key].find(x => x.id === id);
    if (id && !old) return;
    const item = old || { id: 'hc-' + crypto.randomUUID(), kind: 'agency', paymentDays: 0, occupancy: 1, board: 'room_only', unit: 'room', taxBasis: 'inclusive' };
    const field = (name, label, type = 'text', attrs = '') => `<label><span>${label}</span><input name="${name}" type="${type}" value="${esc(item[name] ?? '')}" ${attrs}></label>`;
    const select = (name, label, options) => `<label><span>${label}</span><select name="${name}">${Object.entries(options).map(([v,l]) => `<option value="${esc(v)}" ${String(item[name]) === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
    const accountFields = () => select('kind', 'Type de compte', cuKinds) + field('name', 'Nom usuel', 'text', 'required maxlength="160"') + field('legalName', 'Raison sociale / nom facturé', 'text', 'maxlength="160"') + field('contact', 'Contact', 'text', 'maxlength="160"') + field('address', 'Adresse de facturation', 'text', 'maxlength="500"') + field('city', 'Ville', 'text', 'maxlength="100"') + field('country', 'Pays', 'text', 'maxlength="100"') + field('ice', 'ICE', 'text', 'maxlength="40"') + field('taxId', 'Identifiant fiscal', 'text', 'maxlength="40"') + field('rc', 'Registre de commerce', 'text', 'maxlength="40"') + field('email', 'E-mail', 'email', 'maxlength="160"') + field('phone', 'Téléphone', 'tel', 'maxlength="40"') + field('paymentDays', 'Délai de paiement (jours)', 'number', 'required min="0" max="365" step="1"') + field('notes', 'Notes internes', 'text', 'maxlength="600"');
    const contractFields = () => select('accountId', 'Compte contractant', Object.fromEntries(st.accounts.filter(a => !a.archived || a.id === item.accountId).map(a => [a.id, a.name]))) + field('name', 'Libellé du tarif', 'text', 'required maxlength="160"') + select('roomTypeId', 'Catégorie', Object.fromEntries(cuTypes().map(t => [t.id,t.name]))) + select('occupancy', 'Occupation totale', { 1: 'Single · 1 personne', 2: 'Double · 2 personnes', 3: 'Triple · 3 personnes' }) + select('board', 'Formule incluse', cuBoards) + select('unit', 'Prix par', { room: 'Chambre / nuit', person: 'Personne / nuit' }) + field('from', 'À partir du (inclus)', 'date', 'required') + field('to', 'Jusqu’au (inclus)', 'date', 'required') + `<label><span>Montant MAD</span><input name="amount" type="number" required min="0" max="1000000" step="0.01" value="${item.amountCents == null ? '' : (item.amountCents / 100).toFixed(2)}"></label>` + select('taxBasis', 'Base du prix', { inclusive: 'TTC', exclusive: 'HT · simulation seulement' });
    const m = K().modal({ tag: kind === 'account' ? 'COMPTE HÔTEL' : 'TARIF CONTRACTUEL', title: old ? 'Modifier la fiche' : 'Créer une fiche', width: 720,
      desc: kind === 'account' ? 'Les modifications ne remplacent pas l’identité de facturation déjà acceptée dans un séjour.' : 'Prix de la formule par nuit. Aucune taxe locale ou réduction enfant n’est ajoutée automatiquement. Faites valider le traitement fiscal avant facturation.',
      body: `<form data-hx-commercial-editor><div class="hx-room-form hx-type-form">${kind === 'account' ? accountFields() : contractFields()}<label><span>État</span><select name="archived"><option value="false">Actif</option><option value="true" ${item.archived ? 'selected' : ''}>Archivé</option></select></label></div><p role="status" data-hx-commercial-error></p><div class="hx-room-form-actions"><button class="hx-btn atlas" type="submit">Enregistrer</button></div></form>` });
    const form = m.el.querySelector('form'), revision = st.rev, merchant = cuChannelMerchant();
    form.addEventListener('submit', async e => {
      e.preventDefault(); if (form.__busy) return;
      const error = form.querySelector('[data-hx-commercial-error]');
      if (scope !== cuStayScope()) { error.textContent = 'L’hôtel actif a changé. Rouvrez cette fiche.'; return; }
      const fd = Object.fromEntries(new FormData(form)), row = { ...fd, id: item.id, archived: fd.archived === 'true' };
      if (kind === 'account') row.paymentDays = Number(fd.paymentDays);
      else { row.occupancy = Number(fd.occupancy); row.amountCents = Math.round(Number(fd.amount) * 100); }
      form.__busy = true; const button = form.querySelector('[type="submit"]'); button.disabled = true;
      try {
        const res = await fetch('/api/hotel/commercial', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ merchant, action: kind, rev: revision, item: row }) });
        const b = await res.json(); if (!res.ok) { error.textContent = cuCommercialError(b.error); return; }
        Object.assign(st, { accounts: b.accounts, contracts: b.contracts, rev: b.rev });
        m.close(); if (scope === cuStayScope()) { rerender(); toast('Fiche enregistrée', { type: 'success' }); }
      } catch (_) { error.textContent = 'Confirmation non reçue. Actualisez le répertoire avant de réessayer, votre référence de fiche est conservée.'; }
      finally { form.__busy = false; button.disabled = false; }
    });
  }
  function cuHotesBody() {
    return `<div class="hx-page">
      <div class="block" style="padding:8px 14px;">
        ${cuStarter(
          'Vos fiches clients se créent toutes seules.',
          'Dès le premier séjour, chaque client a sa fiche : préférences, allergies, dépenses par poste, valeur vie, et la reconnaissance des fidèles au check-in.',
          ['« Client fidèle ×2 » signalé à l\'arrivée', 'Mix nationalités pour viser vos marchés', 'Relance directe −10 % pour court-circuiter les OTA']
        )}
      </div>
    </div>`;
  }
  const cuChannelState = { loading: false, loaded: false, rows: [], error: '' };
  function cuChannelMerchant() { return cuMerchantSlug(); }
  async function cuLoadChannels(sync) {
    const merchant = cuChannelMerchant(); if (!merchant || cuChannelState.loading) return;
    cuChannelState.loading = true; cuChannelState.error = ''; rerender();
    try {
      const res = sync
        ? await fetch('/api/hotel/channels', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ action:'sync', merchant }) })
        : await fetch('/api/hotel/channels?merchant=' + encodeURIComponent(merchant), { headers:{Accept:'application/json'} });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'unavailable');
      cuChannelState.rows = Array.isArray(body.channels) ? body.channels : [];
      cuChannelState.loaded = true;
      if (sync) toast('Calendriers actualisés', { type:'success', desc:(body.processed || 0) + ' connexion' + ((body.processed || 0) === 1 ? '' : 's') + ' vérifiée' + ((body.processed || 0) === 1 ? '' : 's') + '.' });
    } catch (_) { cuChannelState.error = 'Synchronisation indisponible. Vos réservations existantes restent intactes.'; }
    finally { cuChannelState.loading = false; rerender(); }
  }
  function cuChannelRoomLabel(id) {
    const room = Object.values(cuState().rooms || {}).find((x) => x.id === id);
    return room ? 'Chambre ' + room.n : 'Chambre supprimée';
  }
  function cuChannelEditor(provider) {
    const name = provider === 'airbnb' ? 'Airbnb' : 'Booking.com';
    const rooms = Object.values(cuState().rooms || {}).sort((a,b) => a.n-b.n);
    if (!rooms.length) { toast('Ajoutez d’abord vos chambres', {type:'warn'}); return; }
    const m = K().modal({ tag:'CALENDRIER OTA', title:'Connecter ' + name,
      desc:'Collez le lien iCal exporté par ' + name + ' et liez-le à une chambre physique. Le lien reste chiffré et ne sera plus affiché.', width:600,
      body:`<div class="hx-room-form">
        <label><span>Nom de la connexion</span><input data-hx-channel-label maxlength="80" value="${esc(name)} · ${esc(vName())}"></label>
        <label><span>Chambre Kiwi</span><select data-hx-channel-room>${rooms.map((r)=>`<option value="${esc(r.id)}">Chambre ${r.n} · ${esc(r.typeName || '')}</option>`).join('')}</select></label>
        <label class="hx-room-form-wide"><span>Lien calendrier iCal (.ics)</span><input data-hx-channel-url type="url" inputmode="url" autocomplete="off" spellcheck="false" placeholder="https://…/calendar.ics"></label>
        <p class="hx-room-form-wide" data-hx-channel-status>Une connexion par chambre. Ajoutez les autres chambres ensuite.</p>
      </div><div class="hx-room-form-actions"><button class="hx-btn ghost" data-action="hx-channel-close">Annuler</button><button class="hx-btn atlas" data-action="hx-channel-save" data-arg="${provider}">Connecter et vérifier</button></div>` });
    m.el.querySelector('.kiwi-modal')?.classList.add('hx-hotel-modal'); openModal={el:m.el,close:m.close};
  }
  function cuCanauxBody() {
    const connected = cuChannelState.rows.map((c) => `<div class="hx-arr">
      <span class="tm ${c.lastError ? 'red' : ''}">${c.channel === 'airbnb' ? 'AIRBNB' : 'BOOKING'}</span>
      <div class="who"><b>${esc(c.label)}</b><div class="sub">${esc(cuChannelRoomLabel(c.roomId))} · ${c.lastError ? 'erreur : ' + esc(c.lastError) : c.lastSyncAt ? 'actualisé ' + new Date(c.lastSyncAt).toLocaleString('fr-FR') : 'première synchronisation en attente'}</div></div>
      <button class="hx-btn ghost" data-action="hx-channel-status" data-arg="${esc(c.id)}:${c.status === 'paused' ? 'active' : 'paused'}">${c.status === 'paused' ? 'Réactiver' : 'Pause'}</button>
      <button class="hx-btn ghost" data-action="hx-channel-delete" data-arg="${esc(c.id)}">Retirer</button>
    </div>`).join('');
    const choices = [{id:'booking',name:'Booking.com'},{id:'airbnb',name:'Airbnb'}].map((c)=>`<div class="hx-arr"><span class="tm">ICAL</span><div class="who"><b>${c.name}</b><div class="sub">Import des dates bloquées, chambre par chambre, si le fournisseur propose un lien iCal</div></div><button class="hx-btn ghost" data-action="hx-cb-connect" data-arg="${c.id}">Importer un calendrier</button></div>`).join('');
    return `<div class="hx-page">
      <div class="hx-strip">
        <div class="hx-kpi"><div class="l">Réservation directe</div><div class="v">·</div><div class="d">source de réservations non connectée</div></div>
        <div class="hx-kpi"><div class="l">Canaux connectés</div><div class="v">${cuChannelState.loaded ? cuChannelState.rows.filter((x)=>x.status==='active').length : '·'}</div><div class="d">calendriers actifs</div></div>
      </div>
      <div class="hx-h"><span class="t">Calendriers connectés</span><span class="s">les liens privés ne sont jamais renvoyés au navigateur</span><button class="hx-btn ghost" data-action="hx-channel-sync" ${cuChannelState.loading?'disabled':''}>${cuChannelState.loading?'Actualisation…':'Actualiser maintenant'}</button></div>
      <div class="block" style="padding:8px 14px;"><div class="hx-list">${cuChannelState.error?`<div class="hx-empty">${esc(cuChannelState.error)}</div>`:connected||'<div class="hx-empty">Aucun calendrier connecté.</div>'}</div></div>
      <div class="hx-h"><span class="t">Connecter un canal</span><span class="s">Kiwi bloque les dates OTA dans la disponibilité directe</span></div>
      <div class="block" style="padding:8px 14px;"><div class="hx-list">${choices}</div></div>
      <div class="block" style="padding:8px 14px;margin-top:14px;">
        ${cuStarter(
          'Import iCal, pas de synchronisation bidirectionnelle.',
          'Les calendriers importent des périodes bloquées. Ils ne transmettent pas vos prix, vos stocks ou vos annulations de Kiwi vers les plateformes.',
          ['Les détails clients, prestations et montants sont à vérifier sur la réservation d’origine', 'Expedia et les agences : saisie manuelle tant qu’une intégration dédiée n’est pas connectée', 'Les commissions réelles ne sont pas fournies par ces calendriers']
        )}
      </div>
    </div>`;
  }
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
      id: 'economat-central', name: 'Économat central', kind: 'economat',
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
      id, name: kind === 'department' ? 'Nouveau département' : 'Nouveau point de vente',
      kind, storeType: kind === 'department' ? '' : 'restaurant',
      locationId: `loc-${id}`, active: true,
    };
  }
  function cuQty(milli) {
    return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 3 }).format((Number(milli) || 0) / 1000);
  }
  function cuMoney(cents) { return new Intl.NumberFormat('fr-FR').format((Number(cents) || 0) / 100) + ' MAD'; }
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
    if (!s.loaded && s.loading) return '<div class="hx-econ-loading"><i></i>Lecture de la configuration et des migrations…</div>';
    const d = s.draft || cuEconomatDraft(s.registry);
    const registryReady = s.registry.units.length > 0 && cuOutletsMapped(d);
    const inventory = s.report ? `<div class="hx-econ-kpis">
      <div><span>Stock hôtel consolidé</span><b>${cuQty(s.report.consolidated?.closingMilli)}</b><small>${s.report.consolidated?.items?.length || 0} références</small></div>
      <div><span>Unités suivies</span><b>${s.report.units?.length || 0}</b><small>${s.report.units?.every((u) => u.reconciliation?.balanced) ? 'réconciliées' : 'écart à examiner'}</small></div>
      <div><span>Comptages physiques</span><b>${s.report.physicalCounts?.observed || 0}</b><small>${s.report.physicalCounts?.applied || 0} appliqués</small></div>
    </div><div class="hx-econ-unit-report">${(s.report.units || []).map((unit) => `<div><span><b>${esc(unit.locationId)}</b><small>${unit.items?.length || 0} références</small></span><strong>${cuQty(unit.reconciliation?.closingMilli)}</strong><i class="${unit.reconciliation?.balanced ? 'ok' : 'bad'}">${unit.reconciliation?.balanced ? 'équilibré' : 'à vérifier'}</i></div>`).join('')}</div>`
      : `<div class="hx-econ-empty">${esc(s.reportError || (s.registry.units.length ? 'Le rapport sera disponible après les migrations de production.' : 'Configurez les unités pour ouvrir le rapport consolidé.'))}</div>`;
    const shiftRows = s.shifts.length ? s.shifts.map((shift) => `<button data-action="hx-econ-shift" data-arg="${esc(shift.shiftId)}" class="${s.selectedShift === shift.shiftId ? 'on' : ''}"><span><b>${new Date(shift.lastTs).toLocaleString('fr-FR')}</b><small>${shift.chargeCount} charges · ${shift.reversalCount} annulations</small></span><strong>${cuMoney(shift.netCents)}</strong></button>`).join('') : '<div class="hx-econ-empty">Aucune charge chambre enregistrée sur les 30 derniers jours.</div>';
    const cashiers = s.shiftReport ? `<div class="hx-econ-cashiers">${(s.shiftReport.cashiers || []).map((row) => `<div><span><b>${esc(row.cashierName || row.cashierId)}</b><small>${row.chargeCount} charges · ${row.reversalCount} annulations</small></span><strong>${cuMoney(row.netCents)}</strong></div>`).join('')}</div>` : '';
    return `<div class="hx-econ-shell" data-hx-economat>
      <div class="hx-econ-head"><div><span>ÉCONOMAT · PILOTE</span><h3>La vérité opérationnelle de l’hôtel</h3><p>Configuration des unités, stock consolidé et charges chambre, sans données client.</p></div><button class="hx-btn ghost" data-action="hx-econ-refresh">Actualiser</button></div>
      ${s.error ? `<div class="hx-econ-alert bad">${esc(s.error)}</div>` : ''}
      <div class="hx-econ-readiness"><div class="${registryReady ? 'ok' : 'wait'}"><b>${registryReady ? 'Registre prêt' : 'Registre incomplet'}</b><span>${s.registry.units.length ? `${s.registry.units.length} unités · ${Object.keys(s.registry.terminalUnits || {}).length} caisses` : 'aucune écriture en production'}</span></div><div class="${s.report ? 'ok' : 'wait'}"><b>${s.report ? 'Rapports disponibles' : 'Migration à confirmer'}</b><span>${s.report ? 'stock et comptages lisibles' : esc(s.reportError || 'aucune donnée fabriquée')}</span></div><div class="wait"><b>Discovery D</b><span>visite terrain requise · jamais validée par logiciel</span></div></div>
      <div class="hx-econ-section"><div class="hx-h"><span class="t">Stock consolidé</span><span class="s">équation par unité et vue hôtel</span></div>${inventory}</div>
      <div class="hx-econ-section"><div class="hx-h"><span class="t">Charges chambre par poste</span><span class="s">aucun nom de client ni numéro de chambre</span></div><div class="hx-econ-shifts">${shiftRows}</div>${cashiers}</div>
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
      <span class="kind">${unit.kind === 'economat' ? 'ÉCONOMAT' : unit.kind === 'department' ? 'DÉPARTEMENT' : 'POINT DE VENTE'}</span>
      <input data-hx-econ-name value="${esc(unit.name)}" maxlength="120" aria-label="Nom de l’unité">
      ${unit.kind === 'department' ? '<input data-hx-econ-store value="" type="hidden"><span class="type">service interne</span>' : unit.kind === 'economat' ? '<input data-hx-econ-store value="economat" type="hidden"><span class="type">stock central</span>' : `<select data-hx-econ-store><option value="restaurant" ${unit.storeType === 'restaurant' ? 'selected' : ''}>Restaurant</option><option value="bar" ${unit.storeType === 'bar' ? 'selected' : ''}>Bar</option><option value="cafe" ${unit.storeType === 'cafe' ? 'selected' : ''}>Café</option><option value="spa" ${unit.storeType === 'spa' ? 'selected' : ''}>Spa</option></select>`}
      <label><input data-hx-econ-active type="checkbox" ${unit.active ? 'checked' : ''} ${unit.kind === 'economat' ? 'disabled' : ''}> active</label>
      <code>${esc(unit.locationId)}</code>
    </div>`).join('');
    const terminalRows = d.terminals.map((row, index) => `<div class="hx-econ-terminal" data-hx-econ-terminal-row>
      <input data-hx-econ-terminal value="${esc(row.terminalId)}" maxlength="80" placeholder="term_…">
      <select data-hx-econ-terminal-unit><option value="">Choisir le point de vente</option>${outlets.map((unit) => `<option value="${esc(unit.id)}" ${row.unitId === unit.id ? 'selected' : ''}>${esc(unit.name)}</option>`).join('')}</select>
      <button data-action="hx-econ-remove-terminal" data-arg="${index}" aria-label="Retirer">×</button>
    </div>`).join('');
    return `<div class="hx-econ-section"><div class="hx-h"><span class="t">Unités et caisses</span><span class="s">un seul enregistrement atomique</span></div><div class="hx-econ-units">${unitRows}</div><div class="hx-econ-add"><button class="hx-btn ghost" data-action="hx-econ-add-unit" data-arg="outlet">+ Point de vente</button><button class="hx-btn ghost" data-action="hx-econ-add-unit" data-arg="department">+ Département</button></div>
        <div class="hx-econ-terminal-head"><b>Assignation des caisses</b><span>Copiez l’identifiant depuis chaque caisse physique.</span><button class="hx-btn ghost" data-action="hx-econ-add-terminal">+ Caisse</button></div><div>${terminalRows || '<div class="hx-econ-empty">Aucune caisse assignée. Le premier registre ne peut pas être activé ainsi.</div>'}</div>
        <label class="hx-econ-confirm"><input type="checkbox" data-hx-econ-confirm> J’ai relevé toutes les caisses physiques et vérifié leur point de vente.</label>
        <div class="hx-econ-save"><span>${allOutletsMapped ? 'Chaque point de vente actif a au moins une caisse.' : 'Chaque point de vente actif doit avoir une caisse.'}</span><button class="hx-btn atlas" data-action="hx-econ-save" ${cuEconomatState.saving ? 'disabled' : ''}>${cuEconomatState.saving ? 'Enregistrement…' : 'Enregistrer unités + caisses'}</button></div>
      </div>`;
  }
  /* Points de vente: the outlet-facing host for the same shared draft.
   * Rename a restaurant here and the Économat page shows it, because both
   * read cuEconomatState — never a second establishment list. */
  const HX_PDV_KINDS = { restaurant: 'Restaurant', bar: 'Bar', cafe: 'Café', spa: 'Spa' };
  function cuPdvBody() {
    const s = cuEconomatState;
    if (!s.loaded && s.loading) return '<div class="hx-econ-loading"><i></i>Lecture de la configuration…</div>';
    const d = s.draft || cuEconomatDraft(s.registry);
    const outlets = d.units.filter((unit) => unit.kind === 'outlet');
    const cards = outlets.length ? outlets.map((unit) => {
      const terms = d.terminals.filter((row) => row.unitId === unit.id && row.terminalId).map((row) => row.terminalId);
      return `<article class="hx-pdv-card" data-hx-pdv-card="${esc(unit.id)}">
        <div><span class="kind">POINT DE VENTE${unit.active ? '' : ' · INACTIF'}</span><b>${esc(unit.name)}</b><small>${esc(HX_PDV_KINDS[unit.storeType] || 'Genre à choisir')} · <code>${esc(unit.locationId)}</code></small></div>
        <div><span>${terms.length ? terms.map((t) => `<code>${esc(t)}</code>`).join(' ') : 'aucune caisse assignée'}</span></div>
        <div><button class="hx-btn ghost" data-action="hx-outlet-menu" data-arg="${esc(unit.id)}">Menu & prix</button></div>
      </article>`;
    }).join('') : '<div class="hx-econ-empty">Aucun point de vente. Ajoutez-en un ci-dessous : il partagera le registre de l’économat, sans doublon.</div>';
    return `<div class="hx-econ-shell" data-hx-economat>
      <div class="hx-econ-head"><div><span>POINTS DE VENTE</span><h3>Restaurants, bars et caisses</h3><p>Nommez chaque point de vente, assignez ses caisses physiques, consultez ce qu’elles vendent. Un seul registre partagé avec l’économat : renommer ici, c’est renommer partout.</p></div><button class="hx-btn ghost" data-action="hx-econ-refresh">Actualiser</button></div>
      ${s.error ? `<div class="hx-econ-alert bad">${esc(s.error)}</div>` : ''}
      <div class="hx-econ-section"><div class="hx-h"><span class="t">Vos points de vente</span><span class="s">${outlets.filter((unit) => unit.active).length} actifs · ${d.terminals.filter((row) => row.terminalId && row.unitId).length} caisses assignées</span></div><div class="hx-pdv-cards">${cards}</div></div>
      ${cuUnitsEditorHtml(d)}
    </div>`;
  }
  async function cuLoadEconomat(force) {
    if (!isCustomHotel() || cuEconomatState.loading) return;
    const merchant = cuMerchantSlug();
    if (!merchant) { cuEconomatState.error = 'Établissement hôtel introuvable.'; cuEconomatState.loaded = true; rerender(); return; }
    cuEconomatState.loading = true;
    if (!cuEconomatState.loaded) rerender();
    const qs = encodeURIComponent(merchant);
    try {
      const docResponse = await fetch(`/api/store?feature=hotel-units&merchant=${qs}`, { credentials: 'same-origin' });
      const doc = await docResponse.json();
      if (!docResponse.ok) throw new Error(doc.error || 'unités indisponibles');
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
        else cuEconomatState.reportError = inventoryBody.dependency ? `Migration manquante : ${inventoryBody.dependency}` : String(inventoryBody.error || 'rapport indisponible');
        if (shiftsResponse.ok) cuEconomatState.shifts = Array.isArray(shiftsBody.shifts) ? shiftsBody.shifts : [];
        else if (!cuEconomatState.reportError) cuEconomatState.reportError = String(shiftsBody.error || 'charges chambre indisponibles');
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
      toast('Confirmez le relevé de toutes les caisses', { type: 'warn', desc: 'Une caisse oubliée continuerait à vendre sans synchroniser son stock.' }); return;
    }
    const outlets = d.units.filter((unit) => unit.kind === 'outlet' && unit.active);
    if (!outlets.length) { toast('Ajoutez au moins un point de vente actif', { type: 'warn' }); return; }
    if (d.units.some((unit) => !unit.name)) { toast('Chaque unité doit avoir un nom', { type: 'warn' }); return; }
    const terminalUnits = {};
    for (const row of d.terminals) {
      if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/.test(row.terminalId) || !outlets.some((unit) => unit.id === row.unitId) || terminalUnits[row.terminalId]) {
        toast('Corrigez les identifiants de caisse', { type: 'warn', desc: 'Chaque identifiant doit être unique et relié à un point de vente actif.' }); return;
      }
      terminalUnits[row.terminalId] = row.unitId;
    }
    if (outlets.some((unit) => !Object.values(terminalUnits).includes(unit.id))) {
      toast('Une caisse manque pour un point de vente actif', { type: 'warn' }); return;
    }
    const merchant = cuMerchantSlug();
    const data = { units: d.units.map((unit) => ({ id: unit.id, name: unit.name, kind: unit.kind, storeType: unit.storeType, locationId: unit.locationId, active: !!unit.active })), terminalUnits };
    cuEconomatState.saving = true; rerender();
    try {
      const response = await fetch('/api/store', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ feature: 'hotel-units', merchant, baseRev: cuEconomatState.rev, data }) });
      const body = await response.json();
      if (!response.ok) {
        if (response.status === 409 && body.data) { cuEconomatState.rev = body.rev; cuEconomatState.registry = body.data; cuEconomatState.draft = cuEconomatDraft(body.data); }
        throw new Error(body.detail || body.error || 'enregistrement refusé');
      }
      cuEconomatState.rev = body.rev; cuEconomatState.registry = data; cuEconomatState.draft = cuEconomatDraft(data);
      toast('Unités et caisses enregistrées ensemble', { type: 'success', desc: `${data.units.length} unités · ${Object.keys(terminalUnits).length} caisses.` });
    } catch (error) { cuEconomatState.error = String(error && error.message || error); }
    cuEconomatState.saving = false; cuEconomatState.loaded = false;
    cuLoadEconomat(true);
  }
  function cuIntelBody() {
    const st = cuState();
    const rooms = Object.values(st.rooms || {});
    const folios = Object.values(st.folios || {}).filter(Boolean);
    const occupied = rooms.filter((room) => ['occ', 'depart'].includes(room.status)).length;
    const arrivals = rooms.filter((room) => room.status === 'arrivee').length;
    const dirty = rooms.filter((room) => room.status === 'sale').length;
    const unavailable = rooms.filter((room) => room.status === 'hs').length;
    const sellable = Math.max(0, rooms.length - unavailable);
    const occupancy = sellable ? Math.round(occupied / sellable * 100) : 0;
    const openBalance = folios.reduce((sum, folio) => sum + folioTotal(folio), 0);
    const configuredRates = cuTypes().map((type) => type.rate == null ? st.baseRate : type.rate).filter((rate) => Number.isFinite(+rate));
    const averageRate = configuredRates.length ? Math.round(configuredRates.reduce((sum, rate) => sum + +rate, 0) / configuredRates.length) : null;
    const activeChannels = cuChannelState.loaded ? cuChannelState.rows.filter((row) => row.status === 'active').length : null;
    const recommendations = [];
    if (!rooms.length) recommendations.push(['Configurer les chambres', 'Le plan, les séjours, le ménage et les prévisions ont besoin de chambres réelles.']);
    if (rooms.length && averageRate == null) recommendations.push(['Définir les tarifs', 'Aucun revenu potentiel ne peut être calculé tant que le tarif général ou les tarifs par type sont vides.']);
    if (dirty) recommendations.push(['Prioriser le ménage', `${dirty} chambre${dirty === 1 ? '' : 's'} ne ${dirty === 1 ? 'peut' : 'peuvent'} pas être revendue${dirty === 1 ? '' : 's'} immédiatement.`]);
    if (sellable && occupancy >= 80 && averageRate != null) recommendations.push(['Demande forte', `Occupation actuelle ${occupancy} %. Vérifiez les prochaines dates avant d’augmenter les tarifs, sans modifier les réservations existantes.`]);
    if (sellable && occupancy < 40) recommendations.push(['Occupation basse', `Occupation actuelle ${occupancy} %. Travaillez d’abord la vente directe et les dates creuses plutôt qu’une remise générale.`]);
    if (activeChannels === 0) recommendations.push(['Connecter les calendriers OTA', 'Booking.com et Airbnb doivent bloquer la même disponibilité que les réservations directes.']);
    if (!recommendations.length) recommendations.push(['Aucune urgence opérationnelle', 'Les chambres, tarifs, folios et canaux ne montrent pas de blocage immédiat.']);
    return `<div class="hx-page">
      <div class="hx-strip">
        <div class="hx-kpi"><div class="l">Occupation actuelle</div><div class="v">${occupancy} %</div><div class="d">${occupied} occupée${occupied === 1 ? '' : 's'} · ${sellable} vendable${sellable === 1 ? '' : 's'}</div></div>
        <div class="hx-kpi"><div class="l">Arrivées attendues</div><div class="v">${arrivals}</div><div class="d">selon le plan des chambres</div></div>
        <div class="hx-kpi"><div class="l">Folios ouverts</div><div class="v">${folios.length}</div><div class="d">${MAD(openBalance)} à suivre</div></div>
        <div class="hx-kpi"><div class="l">Tarif moyen configuré</div><div class="v">${averageRate == null ? '·' : fmt(averageRate) + ' <small>MAD</small>'}</div><div class="d">types de chambres actifs</div></div>
      </div>
      <div class="hx-h"><span class="t">Décisions du jour</span><span class="s">calculées uniquement avec les données visibles de cet établissement</span></div>
      <div class="block" style="padding:8px 14px;">
        <div class="hx-list">${recommendations.map(([title, detail], index) => `<div class="hx-arr"><span class="tm">${String(index + 1).padStart(2, '0')}</span><div class="who"><b>${esc(title)}</b><div class="sub">${esc(detail)}</div></div><span class="hx-pill ${index ? 'neutral' : 'ok'}">${index ? 'À SUIVRE' : 'PRIORITÉ'}</span></div>`).join('')}</div>
      </div>
      <div class="block" style="padding:16px 18px;margin-top:14px;"><div class="hx-h" style="margin:0;"><span class="t">Limite des données</span><span class="s">Kiwi n’affiche pas encore de prévision 12 mois ni de risque no-show tant que l’historique quotidien requis n’existe pas.</span></div></div>
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
      tag: 'BIENVENUE SUR KIWI',
      title: 'Configurez votre tableau de bord',
      desc: 'Une minute pour créer le vôtre, vide, prêt à se remplir avec vos vraies ventes.',
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
        <label style="${lbl}margin-top:4px;">Type d'activité</label>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;">
          ${TYPES_OB.map((t) => `<button type="button" class="ob-type${t.id === picked ? ' sel' : ''}${t.primary ? '' : ' ob-more'}" data-ob-type="${t.id}">${t.icon}<span>${t.label}</span></button>`).join('')}
        </div>
        <button type="button" class="ob-morebtn" data-ob-more>+ Plus de types (${moreCount})</button>
        <label style="${lbl}">Nom de l'activité</label>
        <input class="ob-field" data-ob-name placeholder="Ex. Café des Oudayas" style="${fld}" maxlength="40"/>
        <label style="${lbl}">Ville</label>
        <input class="ob-field" data-ob-city placeholder="Ex. Rabat" style="${fld}" maxlength="30"/>
        <label style="${lbl}">Objectif de chiffre d'affaires par jour <span style="color: var(--n-500);font-weight:400;">· optionnel</span></label>
        <input class="ob-field" data-ob-goal type="number" inputmode="numeric" placeholder="Ex. 5000 MAD" style="${fld}" min="0"/>
      `,
      foot: `<button class="kb atlas" data-ob-create type="button" style="width:100%;justify-content:center;padding:13px;font-size:15px;">Créer mon tableau de bord →</button>`,
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
          <div style="font-family:var(--mono);font-size:10.5px;letter-spacing:0.1em;color:var(--atlas);margin:2px 0 10px;">${trL({fr:'ÉTAPE 2 / 2 · TOUT EST OPTIONNEL', en:'STEP 2 / 2 · ALL OPTIONAL', ar:'الخطوة 2/2 · كل شيء اختياري'})}</div>
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
      window.addEventListener('kiwi-reservations-changed', () => {
        if (isCustomHotel() && ['sejours', 'reception'].includes(openDrawer?.page)) rerender();
      });
    }

    /* The 0000 wizard now offers « Hôtel / Riad » — fork of
     * interactive.js's onboard handler (see obOnboard above). Re-asserted
     * after load like pages-pro's starter wraps, in case of re-registration. */
    handlers['onboard'] = obOnboard;

    /* — navigation (sidebar + cards) — custom (0000) hotels get their own
     * starter pages on the live rack/folio engine; the riad keeps its demo. */
    const cu = isCustomHotel;
    handlers['nav-reception'] = () => cu()
      ? (page('reception', 'Réception', vName() + ' · arrivées, départs et dossiers en maison', cuReceptionBody), cuRefreshReception())
      : page('reception', 'Réception', 'Riad Yasmina · Médina, Marrakech · arrivées, départs, walk-ins, en un geste', receptionBody);
    handlers['nav-chambres'] = () => cu()
      ? page('chambres', 'Plan des chambres', roomCountLabel() + ' · toucher une chambre libre la vend en walk-in', cuRackBody)
      : page('chambres', 'Plan des chambres', '24 chambres · 3 niveaux · toucher une chambre ouvre le client et son folio', rackBody);
    handlers['nav-sejours'] = () => cu()
      ? page('sejours', 'Réservations & séjours', vName() + ' · le tape chart se remplit avec vos réservations', cuSejoursBody)
      : page('sejours', 'Réservations & séjours', 'Tape chart · chambres × dates · sources de réservation et ligne d\'occupation', tapeBody);
    handlers['nav-menage'] = () => cu()
      ? page('menage', 'Ménage', 'Remise à blanc · chaque départ encaissé pousse sa chambre ici', cuMenageBody)
      : page('menage', 'Ménage', 'File de remise à blanc · assignation · inspection gouvernante', menageBody);
    handlers['nav-tarifs'] = () => cu()
      ? page('tarifs', 'Tarifs & occupation', 'Tarif de base · ADR, RevPAR et IA s\'activent avec vos nuitées', cuTarifsBody)
      : page('tarifs', 'Tarifs & occupation', 'ADR · RevPAR · calendrier tarifaire propriétaire + suggestions IA', tarifsBody);
    /* Backward-compatible alias for old bookmarks only. The hotel-specific
     * guest mock was removed from the sidebar; Hospitality+ is the real shared
     * client directory used by dashboard and reception caisse. */
    handlers['nav-hotes'] = () => cu() ? handlers['hx-commercial']() : handlers['clients-directory']?.();
    handlers['hx-commercial'] = () => {
      if (!cu()) return;
      const p = page('commercial', 'Clients, agences & sociétés', 'Comptes de facturation · contrats · Cardex voyageurs', cuCommercialBody);
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
      const p = page('production', 'Production mensuelle', 'Comptes & canaux · chambres-nuits réservées', cuProductionBody);
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
      ? page('folios', 'Notes clients · folios', 'Chambres + extras + taxe de séjour, une seule note par séjour', cuFoliosBody)
      : page('folios', 'Notes clients · folios', 'Chambres + restaurant + hammam + taxe de séjour, une seule note par séjour', foliosBody);
    handlers['nav-canaux'] = () => cu()
      ? (page('canaux', 'Canaux & OTA', 'Calendriers importés et limites de synchronisation', cuCanauxBody), setTimeout(()=>cuLoadChannels(false),0))
      : page('canaux', 'Canaux & OTA', 'Booking.com, Expedia, Airbnb, direct · commissions visibles, enfin', canauxBody);
    handlers['nav-hotelintel'] = () => cu()
      ? (page('hotelintel', 'Intelligence hôtel', 'Prévisions, Économat et contrôle opérationnel', cuIntelBody), setTimeout(() => cuLoadEconomat(false), 0))
      : page('hotelintel', 'Intelligence hôtel', 'Prévision d\'occupation · tarification · no-shows · où part l\'argent', intelBody);
    /* Points de vente: the clear entry for outlet configuration. Same shared
     * draft and registry as the Économat section — naming and till mapping
     * here is naming and till mapping there. nav-economat was a dead sidebar
     * entry (no handler); it now lands on the page that hosts the registry. */
    handlers['nav-points-vente'] = () => cu()
      ? (page('points-vente', 'Points de vente', 'Restaurants, bars et caisses · un seul registre partagé', cuPdvBody), setTimeout(() => cuLoadEconomat(false), 0))
      : null;
    handlers['nav-economat'] = () => { if (cu()) handlers['nav-hotelintel'](); };
    /* Per-outlet menu: what this outlet's tills actually sell, read-only.
     * Prices come from the merchant catalogue — the same document every
     * till sells from — so there is nothing outlet-specific to drift. */
    handlers['hx-outlet-menu'] = async (el, arg) => {
      if (!isCustomHotel()) return;
      const unit = (cuEconomatState.draft?.units || cuEconomatState.registry.units || []).find((u) => u && u.id === String(arg));
      const name = unit?.name || 'Point de vente';
      const m = K().modal({ tag: 'POINT DE VENTE', title: 'Menu · ' + name, desc: 'Articles et prix de vente pratiqués par les caisses de ce point de vente.', width: 620,
        body: '<div data-hx-outlet-menu role="status">Chargement du catalogue…</div>' });
      m.el.querySelector('.kiwi-modal')?.classList.add('hx-hotel-modal');
      const host = m.el.querySelector('[data-hx-outlet-menu]');
      try {
        const res = await fetch('/api/catalog?merchant=' + encodeURIComponent(cuMerchantSlug()), { credentials: 'same-origin' });
        const body = await res.json().catch(() => ({}));
        const products = res.ok && body && body.data && Array.isArray(body.data.products)
          ? body.data.products.filter((p) => p && p.id && p.name && !p.archived) : null;
        if (!res.ok || !products) { if (host) host.innerHTML = '<p class="hx-econ-empty">Catalogue indisponible pour le moment.</p>'; return; }
        if (host) host.innerHTML = products.length
          ? `<div class="hx-outlet-menu">${products.slice(0, 200).map((p) => `<div><span>${esc(p.name)}</span><b>${fmt(Number(p.priceMAD) || 0)} MAD</b></div>`).join('')}</div><small>${products.length} article${products.length === 1 ? '' : 's'} au catalogue de l’établissement.</small>`
          : '<p class="hx-econ-empty">Aucun article au catalogue pour le moment.</p>';
      } catch (_) { if (host) host.innerHTML = '<p class="hx-econ-empty">Catalogue indisponible pour le moment.</p>'; }
    };

    handlers['hx-econ-refresh'] = () => { cuEconomatState.loaded = false; cuLoadEconomat(true); };
    handlers['hx-econ-add-unit'] = (el, arg) => { if (!cuEconomatState.draft) cuEconomatState.draft = cuEconomatDraft(cuEconomatState.registry); cuCaptureEconomatDraft(); cuEconomatState.draft.units.push(cuNewUnit(arg === 'department' ? 'department' : 'outlet')); rerender(); };
    handlers['hx-econ-add-terminal'] = () => { if (!cuEconomatState.draft) cuEconomatState.draft = cuEconomatDraft(cuEconomatState.registry); cuCaptureEconomatDraft(); cuEconomatState.draft.terminals.push({ terminalId: '', unitId: '' }); rerender(); };
    handlers['hx-econ-remove-terminal'] = (el, arg) => { if (!cuEconomatState.draft) return; cuCaptureEconomatDraft(); cuEconomatState.draft.terminals.splice(Math.max(0, parseInt(arg, 10) || 0), 1); rerender(); };
    handlers['hx-econ-save'] = (el) => cuSaveEconomat(el);
    handlers['hx-econ-shift'] = (el, arg) => cuLoadRoomShift(String(arg || ''));

  async function cuMonthlyClosingModal() {
    const slug = window.KiwiStore?.slugFor?.(cuVenueId()) || '';
    if (!slug) { toast('Boutique non connectée', { type: 'warn' }); return; }

    const now = new Date();
    const curY = now.getFullYear();
    const curM = now.getMonth() + 1;
    const defaultMonth = (now.getDate() <= 5)
      ? (curM === 1 ? `${curY - 1}-12` : `${curY}-${String(curM - 1).padStart(2, '0')}`)
      : `${curY}-${String(curM).padStart(2, '0')}`;

    let activeMonth = defaultMonth;
    const pendingReviewKeys = new Map();

    const m = K().modal({
      tag: 'REVUE INTERNE',
      title: 'Contrôle mensuel interne',
      desc: 'Cohérence des séjours du mois — scellé horodaté à usage interne, sans valeur déclarative.',
      width: 760,
      body: `<div data-hx-closing-container class="hx-close-loading">
        <span>Chargement des contrôles...</span>
      </div>`
    });

    openModal = { el: m.el, close: m.close };

    function serverExceptionsHtml(exceptions) {
      if (!Array.isArray(exceptions) || !exceptions.length) return '';
      const rows = exceptions.slice(0, 12).map((e) => {
        const where = [e.bookingCode, e.roomId].filter(Boolean).map((x) => esc(String(x))).join(' · ');
        return `<div class="hx-close-exc-row"><b>${esc(String(e.code || 'anomalie'))}</b><span>${esc(String(e.label || ''))}</span>${where ? `<small>${where}</small>` : ''}</div>`;
      }).join('');
      return `<div class="hx-close-exc-list" role="alert">${rows}</div>`;
    }

    async function postReview(action, extra, btn) {
      const pin = prompt('Code PIN Direction / Gérant (si non connecté avec le compte propriétaire) :') || '';
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
            errBox.innerHTML = `<div class="hx-close-err">${esc(resBody.detail || resBody.error || 'Contrôle impossible pour ce mois.')}${serverExceptionsHtml(resBody.exceptions)}</div>`;
          } else {
            toast(resBody.detail || resBody.error || 'Contrôle impossible pour ce mois.', { type: 'error' });
          }
        } else if (resBody.replayed) {
          toast('Demande déjà scellée — révision existante rechargée', { type: 'success' });
          load(activeMonth);
        } else {
          toast(action === 'finalize' ? ('Mois ' + activeMonth + ' scellé en contrôle interne') : ('Révision ' + resBody.declaration?.revision + ' enregistrée'), { type: 'success' });
          load(activeMonth);
        }
      } catch (_) {
        if (errBox) errBox.innerHTML = '<div class="hx-close-err">Erreur réseau.</div>';
        else toast('Erreur réseau.', { type: 'error' });
      } finally { btn.disabled = false; }
    }

    async function load(month) {
      activeMonth = month;
      const container = m.el.querySelector('[data-hx-closing-container]');
      if (!container) return;
      container.innerHTML = '<div class="hx-close-loading"><span>Calcul et vérification des règles...</span></div>';

      try {
        const res = await fetch(`/api/hotel/declarations?merchant=${encodeURIComponent(slug)}&month=${encodeURIComponent(month)}`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          container.innerHTML = `<div class="hx-close-err">${esc(data.detail || data.error || 'Lecture impossible.')}</div>`;
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

        const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Casablanca', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

        const exceptions = [];
        monthStays.forEach((b) => {
          const errs = cuEvaluateStayExceptions(b, todayStr);
          if (errs.length) exceptions.push({ booking: b, errs });
        });

        const blockingCount = exceptions.filter((x) => x.errs.some((e) => e.severity === 'danger')).length;

        let statusBadge = '';
        if (latest) {
          statusBadge = `<span class="hx-close-badge closed">CONTRÔLÉ (Rév. ${latest.revision})</span>`;
        } else if (blockingCount > 0) {
          statusBadge = `<span class="hx-close-badge blocked">NON CONTRÔLÉ · ${blockingCount} ANOMALIE(S)</span>`;
        } else {
          statusBadge = `<span class="hx-close-badge ready">PRÊT POUR CONTRÔLE</span>`;
        }

        let summaryHtml = '';
        if (latest) {
          const p = latest.payload || {};
          summaryHtml = `<div class="hx-close-grid">
            <div class="hx-close-stat"><span>Arrivées</span><b>${p.totalArrivals || 0}</b></div>
            <div class="hx-close-stat"><span>Nuitées clients</span><b>${p.totalBedNights || 0}</b></div>
            <div class="hx-close-stat"><span>Nuits-chambres occupées</span><b>${p.occupiedRoomNightsCount || 0}</b></div>
            <div class="hx-close-stat"><span>Empreinte SHA-256</span><small class="hx-mono">${esc((latest.canonicalHash || '').slice(0, 16))}...</small></div>
          </div>`;
        } else if (!monthStays.length) {
          summaryHtml = `<p class="hx-close-note">Aucun séjour sur ce mois — un mois sans activité peut être scellé tel quel.</p>`;
        }

        let historyHtml = '';
        if (decls.length > 0) {
          historyHtml = `<div class="hx-close-hist">
            <div class="hx-close-hist-title">HISTORIQUE DES RÉVISIONS</div>
            <div class="hx-close-hist-scroll">
              <table>
                <thead><tr><th>Rév.</th><th>Date</th><th>Responsable</th><th>Motif</th></tr></thead>
                <tbody>
                  ${decls.map((d) => `<tr>
                    <td><b>#${d.revision}</b> (${esc(d.state || '')})</td>
                    <td>${new Date(d.closedAt).toLocaleDateString('fr-FR')} ${new Date(d.closedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</td>
                    <td>${esc(d.closedBy?.name || 'Direction')}</td>
                    <td>${esc(d.rectificationReason || 'Contrôle initial')}</td>
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
              <b>Contrôle bloqué : ${blockingCount} anomalie(s) bloquante(s)</b>
              <p>Complétez les fiches voyageurs ou clôturez les départs dépassés avant de sceller le contrôle interne.</p>
            </div>`;
          } else {
            actionBlock = `<div class="hx-close-actions">
              <button class="hx-btn atlas hx-close-finalize">Valider le contrôle du mois (Réservé Direction)</button>
            </div>`;
          }
        } else {
          actionBlock = `<div class="hx-close-actions between">
            <span class="hx-close-note">Contrôle interne scellé. Toute correction se fait par révision motivée.</span>
            <button class="hx-btn warn hx-close-rectify">Déposer une révision corrective...</button>
          </div>`;
        }

        container.innerHTML = `
          <div class="hx-close-bar">
            <div>
              <label>Mois contrôlé :</label>
              <input type="month" data-hx-closing-month value="${month}">
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
          const reason = prompt('Motif de la révision corrective (au moins 10 caractères) :');
          if (!reason || reason.trim().length < 10) { toast('Un motif d’au moins 10 caractères est obligatoire.', { type: 'warn' }); return; }
          postReview('rectify', { rectificationReason: reason.trim() }, rectifyBtn);
        });

      } catch (err) {
        container.innerHTML = '<div class="hx-close-err">Erreur : ' + esc(err.message) + '</div>';
      }
    }

    load(activeMonth);
  }

  /* — custom-hotel controls — */
  handlers['hx-daily-apply'] = (el) => {
    const root = el.closest('.hx-daily');
    if (!root || !isCustomHotel()) return;
    const date = root.querySelector('[data-hx-daily-date]');
    if (!date?.value || !date.checkValidity()) { date?.reportValidity(); return; }
    const filter = cuReceptionSelection();
    filter.date = date.value;
    const view = root.querySelector('[data-hx-daily-view]')?.value;
    filter.view = ['arrivals', 'departures', 'inhouse', 'attention'].includes(view) ? view : 'arrivals';
    filter.q = String(root.querySelector('[data-hx-daily-search]')?.value || '').slice(0, 100);
    cuRefreshReception();
  };
  handlers['hx-daily-refresh'] = () => { if (isCustomHotel()) cuRefreshReception(); };
  handlers['hx-monthly-closing'] = () => { if (isCustomHotel()) cuMonthlyClosingModal(); };
  handlers['hx-tape-prev'] = async () => {
    cuTapeOffset -= 14;
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Casablanca', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
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
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Casablanca', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const add = (ymd, n) => { const d = new Date(ymd + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
    const start = add(today, cuTapeOffset);
    const end = add(start, 14);
    if (cuTapeOffset < -3 || cuTapeOffset + 14 > 14) {
      await cuFetchStaysForWindow(start, end);
    }
    rerender();
  };
  handlers['hx-tape-today'] = () => { cuTapeOffset = 0; rerender(); };
  handlers['hx-stay-new'] = () => { if (isCustomHotel()) cuStayEditor(null); };
  handlers['hx-group-new'] = () => { if (isCustomHotel()) cuGroupReservationModal(); };
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
          if (!stayForm.isConnected) return;
          // The type save returns after the local write; its server push is
          // still in flight. Flush it before recomputing, or an immediate
          // submit would meet the old rates server-side and fail closed.
          (async () => {
            try { await hotelCloud?.flush?.(); } catch (_) {}
            if (stayForm.isConnected) stayForm.dispatchEvent(new Event('hx-refresh-direct'));
          })();
        });
        obs.observe(document.body, { childList: true });
      }
    };
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
      const m = K().modal({ tag: 'ANNULATION', title: 'Libérer cette chambre ?', desc: booking.customer.name + ' · ' + booking.hotel.checkIn + ' → ' + booking.hotel.checkOut, width: 460,
        body: '<p style="font-size:13px;line-height:1.6;color:var(--n-600);">Le séjour restera dans l’historique avec le statut annulé. La chambre redeviendra immédiatement réservable en direct et sur la saisie OTA.</p><div class="hx-room-form-actions"><button class="hx-btn ghost" data-action="hx-stay-cancel-close">Garder le séjour</button><button class="hx-btn warn" data-action="hx-stay-cancel-confirm" data-arg="' + esc(booking.id) + '">Annuler et libérer</button></div>' });
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
        toast('Ajoutez les numéros de chambres', { type: 'warn', desc: 'Exemple : 101-108, 110, 112.' });
        root?.querySelector('[data-hx-room-numbers]')?.focus();
        return;
      }
      if (!st.roomTypes[typeId]) {
        toast('Choisissez un type de chambre', { type: 'warn', desc: 'Vous pouvez créer vos propres types et tarifs.' });
        return;
      }
      if (!floor) {
        toast('Choisissez une section', { type: 'warn', desc: 'Créez vos étages et ailes depuis le plan.' });
        return;
      }
      const duplicates = numbers.filter((n) => st.rooms[n]);
      if (duplicates.length) {
        toast('Certaines chambres existent déjà', { type: 'warn', desc: 'Retirez : ' + duplicates.slice(0, 8).join(', ') + (duplicates.length > 8 ? '…' : '') });
        return;
      }
      const now = cuStamp();
      numbers.forEach((n, i) => {
        st.rooms[n] = {
          id: 'room:' + now.toString(36) + ':' + n, n, typeId,
          typeName: st.roomTypes[typeId].name, floorId, floor: floor.name, rate: null,
          status: 'libre', hk: 'clean', guest: null, meta: 'Libre · propre',
          view: null, characteristics: [], connectingRoomIds: [],
          updatedAt: now + i,
        };
      });
      cuSave(st);
      cuUpdateFloorsManagerModal();
      cuRefreshFloorSelectors();
      openModal?.close?.();
      toast(numbers.length + ' chambre' + (numbers.length === 1 ? '' : 's') + ' ajoutée' + (numbers.length === 1 ? '' : 's'), {
        type: 'success', desc: st.roomTypes[typeId].name + ' · ' + floor.name + ' · ' + numbers[0] + (numbers.length > 1 ? ' à ' + numbers[numbers.length - 1] : ''),
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
        toast('Numéro de chambre invalide', { type: 'warn', desc: 'Utilisez un numéro entre 1 et 9999.' });
        root?.querySelector('[data-hx-room-number]')?.focus();
        return;
      }
      if (oldN !== n && st.rooms[n]) {
        toast('Ce numéro existe déjà', { type: 'warn', desc: 'Choisissez un numéro de chambre unique.' });
        root?.querySelector('[data-hx-room-number]')?.focus();
        return;
      }
      if (!st.roomTypes[typeId]) {
        toast('Choisissez un type de chambre', { type: 'warn' });
        return;
      }
      if (!st.floors[floorId]) {
        toast('Choisissez une section', { type: 'warn' });
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
      const active = prior && ['occ', 'depart', 'arrivee'].includes(prior.status);
      const savedStatus = active ? prior.status : (['libre', 'sale', 'hs'].includes(status) ? status : 'libre');
      const now = cuStamp();
      const room = {
        ...prior, n, typeId, typeName: st.roomTypes[typeId].name,
        floorId, floor: st.floors[floorId].name, rate: null, status: savedStatus,
        view, characteristics,
        hk: savedStatus === 'sale' ? 'dirty' : savedStatus === 'libre' ? 'clean' : (prior?.hk || 'clean'),
        guest: prior?.guest || null,
        meta: active ? prior.meta : savedStatus === 'libre' ? 'Libre · propre' : savedStatus === 'sale' ? 'À remettre à blanc' : 'Hors-service',
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
      toast('Chambre ' + n + ' enregistrée', { type: 'success', desc: st.roomTypes[typeId].name + ' · ' + st.floors[floorId].name });
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
        toast('Section « ' + name + ' » enregistrée', {type:'success', desc:trL({fr:'Enregistrement serveur confirmé.',en:'Server save confirmed.',ar:'تم تأكيد الحفظ بالخادم.'})});
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
        toast('Créez une autre section avant de supprimer celle-ci', { type: 'warn', desc: 'Aucune chambre ne sera supprimée automatiquement.' });
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
      toast('Section supprimée', { type: 'success', desc: rooms.length ? rooms.length + ' chambre' + (rooms.length === 1 ? '' : 's') + ' déplacée' + (rooms.length === 1 ? '' : 's') + ' vers « ' + st.floors[targetId].name + ' ».' : 'La section était vide.' });
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
        toast('Donnez un nom à ce type', { type: 'warn', desc: 'Ex. Chambre Deluxe, Suite Atlas, Twin Patio.' });
        root?.querySelector('[data-hx-type-name]')?.focus();
        return;
      }
      if (rateRaw && (!Number.isFinite(+rateRaw) || +rateRaw < 0)) {
        toast('Tarif invalide', { type: 'warn' });
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
        toast('Supplément repas invalide', { type: 'warn', desc: 'Montant MAD par personne et par nuit, zéro ou plus.' });
        root?.querySelector(`[data-hx-type-board-${boardRateBad}]`)?.focus();
        return;
      }
      if (!Number.isFinite(+guestsRaw) || +guestsRaw < 1 || +guestsRaw > 12) {
        toast('Capacité invalide', { type: 'warn', desc: 'Indiquez entre 1 et 12 voyageurs.' });
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
        toast('Ce type existe déjà', { type: 'warn', desc: 'Modifiez « ' + duplicate.name + ' » directement.' });
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
      toast('Type « ' + name + ' » enregistré', { type: 'success', desc: rateRaw === '' ? 'Tarif général utilisé.' : fmt(+rateRaw) + ' MAD par nuit.' });
      rerender();
    };
    handlers['hx-room-type-delete'] = (el, arg) => {
      if (!isCustomHotel()) return;
      const st = cuState();
      const type = st.roomTypes[arg];
      if (!type) return;
      const used = Object.values(st.rooms).filter((r) => r.typeId === arg).length;
      if (used) {
        toast('Type utilisé par ' + used + ' chambre' + (used === 1 ? '' : 's'), { type: 'warn', desc: 'Changez d’abord le type de ces chambres.' });
        return;
      }
      const tombstone = { ...type, updatedAt: cuStamp(), deletedAt: cuStamp() };
      const records = st.typeRecords || (st.typeRecords = []);
      const i = records.findIndex((t) => t && t.id === arg);
      if (i >= 0) records[i] = tombstone; else records.push(tombstone);
      delete st.roomTypes[arg];
      cuSave(st);
      openModal?.close?.();
      toast('Type supprimé', { type: 'success' });
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
        toast('Suppression impossible', { type: 'warn', desc: 'Clôturez d’abord le séjour et le folio de cette chambre.' });
        return;
      }
      openModal?.close?.();
      const m = K().modal({
        tag: 'SUPPRIMER UNE CHAMBRE', title: 'Supprimer la chambre ' + n + ' ?',
        desc: 'Elle disparaîtra du plan, des disponibilités et du ménage.', width: 440,
        body: `<p style="font-size:13px;line-height:1.55;color:var(--n-600);margin:0;">Cette action supprime <b>Ch. ${n} · ${esc(room.typeName)}</b>. Les ventes historiques restent intactes.</p>
          <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:20px;"><button class="hx-btn warn" data-action="hx-room-delete" data-arg="${n}">Confirmer la suppression</button></div>`,
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
      toast('Chambre ' + n + ' supprimée', { type: 'success', desc: 'Le plan et les disponibilités ont été mis à jour.' });
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
      if (arg === 'booking' || arg === 'airbnb') cuChannelEditor(String(arg));
    };
    handlers['hx-channel-close'] = () => { openModal?.close?.(); openModal=null; };
    handlers['hx-channel-sync'] = () => cuLoadChannels(true);
    handlers['hx-channel-save'] = async (el,arg) => {
      const root=el.closest('.kiwi-modal'), status=root?.querySelector('[data-hx-channel-status]');
      const label=String(root?.querySelector('[data-hx-channel-label]')?.value||'').trim(), roomId=String(root?.querySelector('[data-hx-channel-room]')?.value||''), feedUrl=String(root?.querySelector('[data-hx-channel-url]')?.value||'').trim();
      if(!label||!roomId||!feedUrl){if(status)status.textContent='Complétez les trois champs.';return;}
      el.disabled=true;if(status)status.textContent='Connexion et première vérification…';
      try{const res=await fetch('/api/hotel/channels',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'save',merchant:cuChannelMerchant(),channel:String(arg),label,roomId,feedUrl})}),body=await res.json().catch(()=>({}));if(!res.ok)throw new Error(body.error||'unavailable');cuChannelState.rows=body.channels||[];cuChannelState.loaded=true;openModal?.close?.();openModal=null;toast('Calendrier connecté',{type:'success',desc:'Les dates OTA sont maintenant dans le tape chart.'});rerender();}catch(error){if(status)status.textContent=error.message==='invalid-feed-url'?'Utilisez le lien iCal officiel fourni par Booking.com ou Airbnb.':'Connexion impossible : '+error.message;}finally{el.disabled=false;}
    };
    handlers['hx-channel-status'] = async (el,arg) => { const cut=String(arg).lastIndexOf(':'),id=String(arg).slice(0,cut),status=String(arg).slice(cut+1);el.disabled=true;try{const res=await fetch('/api/hotel/channels',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'status',merchant:cuChannelMerchant(),id,status})}),body=await res.json();if(res.ok){cuChannelState.rows=body.channels||[];rerender();}}finally{el.disabled=false;} };
    handlers['hx-channel-delete'] = async (el,id) => { if(!confirm('Retirer ce calendrier ? Les séjours déjà importés restent dans l’historique.'))return;el.disabled=true;try{const res=await fetch('/api/hotel/channels',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({merchant:cuChannelMerchant(),id:String(id)})}),body=await res.json();if(res.ok){cuChannelState.rows=body.channels||[];rerender();}}finally{el.disabled=false;} };

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
      const room = parseInt(arg, 10);
      const f = F()[room];
      if (!f) return;
      const due = folioTotal(f) - folioPaid(f);
      if (isCustomHotel()) {
        if (!Number.isFinite(due) || due < 0 || (due > 0 && !recordSale(due, 'checkout-' + room + '-' + String(f.updatedAt || cuStamp()), 'Départ · Ch. ' + room))) {
          toast('Clôture non enregistrée', { type: 'warn', desc: 'Le folio et la chambre sont conservés. Vérifiez la connexion et l’enregistrement du règlement avant de réessayer.' });
          return;
        }
        const closedAt = Math.max(cuStamp(), (+f.updatedAt || 0) + 1);
        const st = cuState();
        st.closedFolios = (st.closedFolios || []).filter((x) => +x.room !== room);
        st.closedFolios.push({ ...f, closedAt, updatedAt: closedAt, settlementAmount: due, settlementState: due > 0 ? 'queued' : 'previously-recorded' });
        const r = R()[room];
        r.status = 'sale'; r.hk = 'dirty'; r.guest = null;
        r.meta = 'Départ soldé · à remettre à blanc'; r.updatedAt = cuStamp();
        delete F()[room];
        cuSave();
        openModal?.close?.();
        toast('Départ enregistré · Ch. ' + room, { type: 'info', desc: due > 0 ? 'Règlement ajouté à la file de synchronisation. Vérifiez sa confirmation dans les transactions.' : 'Solde nul. Le dernier folio clôturé est conservé dans les données de la chambre.' });
        setTimeout(() => toast('Ch. ' + room + ' → à remettre à blanc', { type: 'info', desc: 'Marquez-la propre depuis Ménage pour la revendre ce soir.' }), 1400);
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
        toast('Tarif non configuré', { type: 'info', desc: 'Définissez d’abord votre tarif de base dans Tarifs.' });
        return;
      }
      const m = K().modal({
        tag: 'WALK-IN', title: 'Vendre une chambre ce soir', desc: free.length + ' chambres libres et propres', width: 460,
        body: free.map((r) => `<div class="hx-fol-line" style="cursor:pointer;" data-action="hx-walkin-room" data-arg="${r.n}">
            <span><b style="font-family:var(--mono);">Ch. ${r.n}</b> · ${esc(roomTypeOf(r.n).name)}</span><span class="qt">1 nuit</span><span class="am">${roomTypeOf(r.n).base == null ? 'Tarif à définir' : MAD(roomTypeOf(r.n).base)}</span>
          </div>`).join('') || `<div style="padding:14px;font-size:13px;color:var(--n-500);">${isCustomHotel() && totalRooms() === 0 ? 'Aucune chambre configurée.' : 'Complet ce soir, aucune chambre libre.'}</div>`,
      });
      openModal = { el: m.el, close: m.close };
    };
    handlers['hx-walkin-room'] = (el, arg) => {
      const n = parseInt(arg, 10);
      const r = R()[n];
      const cu = isCustomHotel();
      if (!r || r.status !== 'libre' || F()[n]) return;
      if (cu && roomTypeOf(n).base == null) {
        toast('Tarif non configuré', { type: 'info', desc: 'Ajoutez un tarif à cette chambre ou définissez le tarif général dans Tarifs.' });
        return;
      }
      const guest = cu ? 'Client sans nom' : 'Walk-in · M. Idrissi';
      const rate = roomTypeOf(n).base;
      const stamp = cuStamp();
      if (cu && !recordSale(rate, 'walkin-' + n + '-' + stamp, 'Walk-in · Ch. ' + n)) {
        toast('Walk-in non enregistré', { type: 'warn', desc: 'La chambre reste libre. L’enregistrement du règlement est indisponible.' });
        return;
      }
      r.status = 'occ'; r.guest = guest; r.meta = 'Walk-in · 1 nuit · réglé d\'avance';
      F()[n] = { room: n, guest, src: 'walkin', pax: 1, nights: 1, lines: [
        { t: nowLabel(), label: 'Nuit 1 · ' + roomTypeOf(n).name, qty: '×1', amt: rate, src: 'room', paid: true },
        { t: 'auto', label: 'Taxe de séjour · 1 pers × 1 nuit', qty: '', amt: TAX_PP_NIGHT, src: 'taxe' },
      ], updatedAt: stamp };
      if (cu) { r.updatedAt = stamp; cuState().sold += 1; cuSave(); }
      openModal?.close?.();
      toast('Ch. ' + n + ' vendue · ' + MAD(rate), { type: 'success', desc: 'Walk-in enregistré · occupation ce soir ' + counts().occToNight + ' / ' + totalRooms() + (cu ? ' · vente réelle au compteur.' : '.') });
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
        if (r) { r.status = 'libre'; r.hk = 'clean'; r.guest = null; r.meta = 'Libre · propre'; r.updatedAt = cuStamp(); cuSave(); }
        openModal?.close?.();
        toast('Ch. ' + room + ' remise à blanc', { type: 'success', desc: 'Propre et relouable, visible « libre » sur le plan des chambres.' });
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
