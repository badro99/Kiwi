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
  const cuRackFilter = { floor: 'all', status: 'all', q: '' };
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
    if (!/^\/api\/media\/[a-z0-9][a-z0-9-]{2,63}\/(?:hotel-room\/)?[a-z0-9-]{6,80}\.(?:jpe?g|png|webp|gif|avif)$/i.test(url)) return null;
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
      roomTypes[id] = {
        id, name: String(x.name || 'Chambre').trim().slice(0, 60) || 'Chambre',
        rate: x.rate != null && Number.isFinite(+x.rate) && +x.rate >= 0 ? +x.rate : null,
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
      floors[id] = { id, name: String(x.name || 'Vos chambres').trim().slice(0, 60) || 'Vos chambres', order: Number.isFinite(+x.order) ? +x.order : index, updatedAt: +x.updatedAt || 0 };
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
      };
    });
    const folios = {};
    const folioRows = Array.isArray(raw.folios) ? raw.folios : Object.values(raw.folios || {});
    folioRows.forEach((f) => { if (f && rooms[+f.room]) folios[+f.room] = f; });
    return {
      v: 4, rooms, roomRecords: roomRecords.slice(), roomTypes, typeRecords: typeRecords.slice(), floors,
      floorRecords: floorRecords.slice(), folios,
      baseRate: raw.baseRate != null && Number.isFinite(+raw.baseRate) && +raw.baseRate >= 0 ? +raw.baseRate : null,
      rateUpdatedAt: +raw.rateUpdatedAt || 0,
      sold: Math.max(0, +raw.sold || 0), updatedAt: +raw.updatedAt || 0,
      count: Object.keys(rooms).length,
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
      v: 4, rooms: Object.values(byId), roomTypes: Object.values(typeById), floors: Object.values(floorById), folios: Object.values(st.folios || {}),
      baseRate: st.baseRate, rateUpdatedAt: st.rateUpdatedAt || 0,
      sold: st.sold || 0, updatedAt: st.updatedAt || 0,
    };
  }
  function cuWriteLocal(st, id) {
    try { localStorage.setItem(cuStoreKey(id), JSON.stringify(cuDocument(st))); } catch (_) {}
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
      if (!old || xt >= ot) rows[id] = x;
    };
    (Array.isArray(b.rooms) ? b.rooms : []).forEach(take);
    (Array.isArray(a.rooms) ? a.rooms : []).forEach(take);
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
    return {
      v: 4, rooms: Object.values(rows), roomTypes: Object.values(types), floors: Object.values(floors), folios: Object.values(folios),
      baseRate: rateOwner.baseRate == null ? null : +rateOwner.baseRate,
      rateUpdatedAt: +rateOwner.rateUpdatedAt || 0,
      sold: Math.max(+a.sold || 0, +b.sold || 0), updatedAt: Math.max(+a.updatedAt || 0, +b.updatedAt || 0),
    };
  }
  function cuState() {
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
    cuWriteLocal(st, cuStateId());
    if (hotelCloud) hotelCloud.push();
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
      isEmpty: (d) => !d || !Array.isArray(d.rooms) || !d.rooms.some((r) => r && !r.deletedAt),
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
      base: type ? (type.rate == null ? st.baseRate : type.rate) : (r.rate == null ? st.baseRate : r.rate),
    };
  };
  const totalRooms = () => (isCustomHotel() ? cuState().count : 24);
  const roomCountLabel = () => totalRooms() + ' chambre' + (totalRooms() === 1 ? '' : 's');
  const vName = () => ((window.KiwiVenue && window.KiwiVenue.getCurrentVenueData && window.KiwiVenue.getCurrentVenueData()) || {}).name || 'Votre établissement';
  /* A custom hotel's encaissements are REAL — feed the merchant sales store
   * so the hero, KPI band and feed recompute from them (same pipeline as
   * the POS «Nouvelle vente»). */
  function recordSale(amount) {
    const KV = window.KiwiVenue;
    if (!isCustomHotel() || !window.KiwiSales || !KV) return;
    if (amount > 0) window.KiwiSales.add(KV.getVenue(), { amount: Math.round(amount), method: 'card' });
  }

  function page(pageKey, title, subtitle, bodyFn) {
    const p = K().appPage(pageKey, { title, subtitle, body: bodyFn() });
    openDrawer = { el: p.el, page: pageKey, bodyFn, close: p.close };
    return p;
  }
  function rerender() {
    if (!openDrawer) return;
    const body = openDrawer.el.querySelector('.genpage-body') || openDrawer.el.querySelector('.kiwi-drawer-body');
    if (body) body.innerHTML = openDrawer.bodyFn();
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
    if (sim) return sim.simHourLabel.replace('h', 'h') + String(sim.simMinute).padStart(2, '0');
    return '14h37';
  }
  function postCharge(room, label, amt, src, silent) {
    const f = F()[room];
    if (!f) return;
    f.lines.push({ t: nowLabel(), label, qty: '', amt, src, isNew: true });
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
  function roomModal(n) {
    const r = R()[n];
    if ((r.status === 'occ' || r.status === 'depart') && F()[n]) return openFolio(n);
    if (r.status === 'arrivee' && F()[n]) return openFolio(n);
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
  function cuReceptionBody() {
    const sold = cuState().sold;
    return `<div class="hx-page">
      ${cuStrip()}
      <div class="hx-h"><span class="t">Arrivées & départs</span><span class="s">vos réservations apparaîtront ici · le walk-in fonctionne dès maintenant</span>
        <button class="hx-btn atlas" data-action="hx-walkin">+ Walk-in · vendre une chambre</button>
      </div>
      <div class="block" style="padding:8px 14px;">
        ${cuStarter(
          sold ? 'La réception tourne.' : 'Encore rien ici, et c\'est normal.',
          sold ? 'Vos walk-ins de ce soir sont sur le plan des chambres ; chaque vente alimente votre chiffre réel.'
               : 'Votre journal d\'arrivées et de départs se remplit avec vos réservations et vos walk-ins.',
          ['Check-in en un geste, la chambre passe « occupée », le folio s\'ouvre',
           'Restaurant et spa postent sur la note de chambre automatiquement',
           'Taxe de séjour calculée par personne et par nuit, prête à déclarer'],
          '<button class="hx-btn ghost" data-action="nav-chambres">Plan des chambres →</button>'
        )}
      </div>
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
        <label><span>État</span><select data-hx-room-status ${locked ? 'disabled' : ''}>
          <option value="libre" ${status === 'libre' ? 'selected' : ''}>Libre · propre</option>
          <option value="sale" ${status === 'sale' ? 'selected' : ''}>Libre · à nettoyer</option>
          <option value="hs" ${status === 'hs' ? 'selected' : ''}>Hors-service</option>
          ${locked ? `<option value="${status}" selected>${status === 'occ' ? 'Occupée' : status === 'depart' ? 'Départ du jour' : 'Arrivée attendue'}</option>` : ''}
        </select>${locked ? '<small>Le statut du séjour se gère depuis le folio.</small>' : ''}</label>
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
        <button class="hx-type-add" type="button" data-action="hx-floor-new">+ Créer une section</button>`,
    });
    m.el.querySelector('.kiwi-modal')?.classList.add('hx-hotel-modal', 'hx-floors-modal');
    openModal = { el: m.el, close: m.close };
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
  function cuRackBody() {
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
    const floorTabs = [`<button class="${cuRackFilter.floor === 'all' ? 'on' : ''}" data-action="hx-room-floor" data-arg="all">Tous les étages <b>${counts.all}</b></button>`]
      .concat(floorRows.map((f) => `<button class="${cuRackFilter.floor === f.lbl ? 'on' : ''}" data-action="hx-room-floor" data-arg="${esc(f.lbl)}">${esc(f.lbl)} <b>${f.rooms.length}</b></button>`)).join('');
    const floorSections = floorRows.filter((f) => cuRackFilter.floor === 'all' || cuRackFilter.floor === f.lbl).map((f) => {
      const rooms = f.rooms.map((n) => R()[n]).filter((r) => {
        if (cuRackFilter.status !== 'all' && cuRoomStatus(r).key !== cuRackFilter.status) return false;
        const q = cuRackFilter.q.toLocaleLowerCase('fr');
        return !q || [r.n, roomTypeOf(r.n).name, r.guest, r.meta].some((x) => String(x || '').toLocaleLowerCase('fr').includes(q));
      });
      if (!rooms.length) return '';
      return `<section class="hx-floor-section" data-hx-floor-section>
        <div class="hx-floor-head"><div><b>${esc(f.lbl)}</b><span>${rooms.length} affichée${rooms.length === 1 ? '' : 's'}</span></div><div class="hx-floor-head-actions"><button data-action="hx-floor-edit" data-arg="${esc(f.id)}">Gérer</button><button data-action="hx-room-add-floor" data-arg="${esc(f.id)}">+ Ajouter ici</button></div></div>
        <div class="hx-rack">${rooms.map((r) => {
          const status = cuRoomStatus(r);
          const type = roomTypeOf(r.n);
          return `<div class="hx-room st-${r.status}" data-action="hx-room" data-arg="${r.n}" data-hx-room-card>
            <button class="hx-room-edit" type="button" data-action="hx-room-edit" data-arg="${r.n}" aria-label="Modifier la chambre ${r.n}" title="Modifier">✎</button>
            <div class="hx-room-top"><span class="no">${r.n}</span><span class="hx-room-state ${status.key}">${esc(status.label)}</span></div>
            <div class="ty">${esc(type.name)}</div>
            <div class="hx-room-bottom"><span class="gu">${esc(r.guest || (r.status === 'libre' ? 'Prête à vendre' : r.meta || status.label))}</span><span class="hx-room-price">${type.base == null ? '—' : fmt(type.base)}<small>${type.base == null ? '' : ' MAD'}</small></span></div>
          </div>`;
        }).join('')}</div>
      </section>`;
    }).join('');
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
    const noMatch = !floorSections ? `<div class="hx-room-no-match"><b>Aucune chambre ne correspond.</b><span>Changez l’étage, le statut ou la recherche.</span><button class="hx-link-btn" data-action="hx-room-filter-reset">Réinitialiser les filtres</button></div>` : '';
    const kpis = [
      ['all', '', 'Total', 'inventaire'], ['libre', 'ready', 'Prêtes', 'à vendre'],
      ['occ', 'occupied', 'Occupées', 'en maison'], ['arrivee', 'arrival', 'Arrivées', 'attendues'],
      ['sale', 'dirty', 'À nettoyer', 'ménage'], ['hs', 'offline', 'Hors-service', 'maintenance'],
    ].filter(([key]) => !compactProperty || ['all', 'libre', 'occ', 'sale'].includes(key) || counts[key] > 0);
    return `<div class="hx-page hx-room-workspace ${compactProperty ? 'hx-room-compact-property' : ''}">
      <div class="hx-room-section-tabs" role="tablist" aria-label="Espaces hôtel">
        <button class="on" role="tab" aria-selected="true" data-action="nav-chambres"><span>Plan</span><small>${counts.all} chambres</small></button>
        <button role="tab" aria-selected="false" data-action="nav-menage"><span>Ménage</span><small>${counts.sale} à nettoyer</small></button>
        <button role="tab" aria-selected="false" data-action="nav-tarifs"><span>Tarifs</span><small>par catégorie</small></button>
      </div>
      <div class="hx-room-kpis" style="--hx-kpi-count:${kpis.length}">${kpis.map(([key, cls, label, note]) => `<button class="${cls} ${cuRackFilter.status === key ? 'on' : ''}" data-action="hx-room-status" data-arg="${key}"><span>${label}</span><b>${counts[key]}</b><small>${note}</small></button>`).join('')}</div>
      <div class="hx-room-toolbar">
        ${compactProperty ? '<div class="hx-room-compact-hint">Touchez une chambre pour la vendre ou ouvrir son folio.</div>' : `<label class="hx-room-search"><span>⌕</span><input data-hx-room-search value="${esc(cuRackFilter.q)}" placeholder="Rechercher une chambre, un client…"><button data-action="hx-room-search">Rechercher</button></label>`}
        <div class="hx-room-toolbar-actions"><button class="hx-btn ghost" data-action="hx-floors">Gérer les sections</button><button class="hx-btn ghost" data-action="hx-room-types">Gérer les catégories</button><button class="hx-btn atlas" data-action="hx-room-add">+ Ajouter des chambres</button></div>
      </div>
      ${floorRows.length > 1 ? `<div class="hx-floor-tabs">${floorTabs}</div>` : ''}
      ${floorSections}${noMatch}
    </div>`;
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
      <div class="hx-h"><span class="t">Tarif général</span><span class="s">utilisé uniquement par les types sans tarif propre</span></div>
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
    const doc = window.KiwiReservations?.get?.() || { bookings: [] };
    const active = { requested: 1, confirmed: 1, checked_in: 1 };
    const channels = { direct: 'Direct', booking: 'Booking.com', airbnb: 'Airbnb', expedia: 'Expedia', walkin: 'Walk-in', other: 'Autre OTA' };
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Casablanca', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const add = (ymd, n) => { const d = new Date(ymd + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
    const distance = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 86400000);
    const start = add(today, cuTapeOffset);
    const end = add(start, 14);
    const dates = Array.from({ length: 14 }, (_, i) => add(start, i));
    const real = (doc.bookings || []).filter((b) => b.hotel && b.hotel.checkIn && b.hotel.checkOut && b.status !== 'cancelled' && b.status !== 'no_show');
    const matched = new Set(real.map((b) => b.resourceId));
    const walkins = Object.values(st.folios || {}).filter((f) => f && !matched.has(st.rooms?.[f.room]?.id)).map((f) => {
      const room = st.rooms?.[f.room], stamp = +f.updatedAt || Date.now();
      const cin = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Casablanca', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(stamp));
      return room ? { id: 'folio:' + room.id, resourceId: room.id, customer: { name: f.guest || room.guest || 'Walk-in' }, status: 'checked_in', hotel: { checkIn: cin, checkOut: add(cin, +f.nights || 1), channel: 'walkin', roomTypeName: roomTypeOf(room.n).name } } : null;
    }).filter(Boolean);
    const stays = real.concat(walkins);
    const barsFor = (room) => stays.filter((b) => b.resourceId === room.id && b.hotel.checkIn < end && b.hotel.checkOut > start).map((b) => {
      const from = Math.max(0, distance(start, b.hotel.checkIn));
      const to = Math.min(14, distance(start, b.hotel.checkOut));
      const channel = channels[b.hotel.channel] ? b.hotel.channel : (b.source === 'public' ? 'direct' : 'other');
      const left = from / 14 * 100, width = Math.max(1, (to - from) / 14 * 100);
      return `<button class="hx-cu-stay src-${channel} status-${esc(b.status)} ${b.hotel.conflict ? 'has-conflict' : ''}" style="left:${left}%;width:calc(${width}% - 3px)" data-action="hx-stay-edit" data-arg="${esc(b.id)}" title="${esc((b.hotel.conflict ? 'CONFLIT À RÉSOUDRE · ' : '') + (b.customer?.name || '') + ' · ' + channels[channel] + ' · ' + b.hotel.checkIn + ' → ' + b.hotel.checkOut)}"><b>${esc(b.customer?.name || 'Séjour')}</b><span>${b.hotel.conflict ? '⚠ CONFLIT' : esc(channels[channel])}</span></button>`;
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
        <div class="hx-cu-tape-head"><div><span class="hx-kicker">DISPONIBILITÉ UNIFIÉE</span><h3>Chambres × 14 jours</h3><p>Direct, saisie manuelle et OTA bloquent tous la même chambre.</p></div><div class="hx-cu-tape-actions"><button class="hx-btn ghost" data-action="hx-tape-prev" aria-label="14 jours précédents">←</button><button class="hx-btn ghost" data-action="hx-tape-today">Aujourd’hui</button><button class="hx-btn ghost" data-action="hx-tape-next" aria-label="14 jours suivants">→</button><button class="hx-btn atlas" data-action="hx-stay-new">+ Réservation</button></div></div>
        <div class="hx-cu-legend">${Object.keys(channels).map((c) => `<span class="src-${c}"><i></i>${channels[c]}</span>`).join('')}</div>
        ${rooms.length ? `<div class="hx-cu-tape-scroll"><div class="hx-cu-tape-grid"><div class="hx-cu-date-row"><div class="hx-cu-room"><span>CHAMBRE</span></div><div class="hx-cu-date-days">${dateHead}</div></div>${rows}<div class="hx-cu-occupancy"><div class="hx-cu-room"><b>Occupation</b><span>vendues</span></div><div>${occupancy}</div></div></div></div>` : `<div class="hx-cu-tape-empty"><b>Ajoutez d’abord vos chambres</b><p>Le tape chart attribue chaque séjour à une chambre réelle.</p><button class="hx-btn atlas" data-action="hx-room-add">Configurer les chambres</button></div>`}
      </div>
    </div>`;
  }

  function cuStayEditor(booking) {
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
    const m = K().modal({ tag: booking ? booking.code || 'SÉJOUR' : 'NOUVEAU SÉJOUR', title: booking ? 'Modifier la réservation' : 'Ajouter une réservation', desc: 'La chambre est contrôlée et bloquée côté serveur avant confirmation.', width: 720,
      body: `<form class="hx-stay-form" data-hx-stay-form>
        <div class="hx-room-form hx-type-form">
          <label class="hx-room-form-wide"><span>Nom du client</span><input name="name" maxlength="100" required value="${esc(booking?.customer?.name || '')}" placeholder="Nom et prénom"></label>
          <label><span>Arrivée</span><input name="checkIn" type="date" required value="${esc(booking?.hotel?.checkIn || today)}"></label>
          <label><span>Départ</span><input name="checkOut" type="date" required value="${esc(booking?.hotel?.checkOut || add(today, 1))}"></label>
          <label><span>Catégorie</span><select name="roomTypeId">${types.map((t) => `<option value="${esc(t.id)}" ${t.id === typeId ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></label>
          <label><span>Chambre</span><select name="resourceId"><option value="">Attribution automatique</option>${rooms.map((r) => `<option value="${esc(r.id)}" data-type="${esc(r.typeId)}" ${r.id === booking?.resourceId ? 'selected' : ''}>Ch. ${r.n} · ${esc(roomTypeOf(r.n).name)}</option>`).join('')}</select></label>
          <label><span>Canal</span><select name="channel"><option value="direct">Direct</option><option value="booking">Booking.com</option><option value="airbnb">Airbnb</option><option value="expedia">Expedia</option><option value="walkin">Walk-in</option><option value="other">Autre OTA</option></select></label>
          <label><span>Statut</span><select name="status">${statusChoices.map((value) => `<option value="${value}">${statusLabels[value]}</option>`).join('')}</select></label>
          <label><span>Voyageurs</span><input name="partySize" type="number" min="1" max="12" value="${booking?.partySize || 1}"></label>
          <label><span>Référence OTA <small>· optionnel</small></span><input name="externalRef" maxlength="80" value="${esc(booking?.hotel?.externalRef || '')}" placeholder="Ex. 4219-8840"></label>
          <label><span>Téléphone <small>· optionnel</small></span><input name="phone" maxlength="32" value="${esc(booking?.customer?.phone || '')}"></label>
          <label><span>E-mail <small>· optionnel</small></span><input name="email" type="email" maxlength="160" value="${esc(booking?.customer?.email || '')}"></label>
          <label class="hx-room-form-wide"><span>Note interne</span><textarea name="note" maxlength="600" rows="2">${esc(booking?.note || '')}</textarea></label>
        </div><p class="hx-stay-error" data-hx-stay-error></p><div class="hx-room-form-actions">${booking && booking.status !== 'cancelled' ? `<button type="button" class="hx-btn warn" data-action="hx-stay-cancel" data-arg="${esc(booking.id)}">Annuler le séjour</button>` : '<span></span>'}<button class="hx-btn atlas" type="submit">${booking ? 'Enregistrer' : 'Bloquer la chambre'}</button></div>
      </form>` });
    const form = m.el.querySelector('[data-hx-stay-form]');
    form.elements.channel.value = booking?.hotel?.channel || (booking?.source === 'public' ? 'direct' : 'other');
    form.elements.status.value = booking?.status || 'confirmed';
    const filterRooms = () => { const selected = form.elements.resourceId.value; Array.from(form.elements.resourceId.options).forEach((o, i) => { if (!i) return; o.hidden = o.dataset.type !== form.elements.roomTypeId.value; }); if (selected && form.elements.resourceId.selectedOptions[0]?.hidden) form.elements.resourceId.value = ''; };
    form.elements.roomTypeId.addEventListener('change', filterRooms); filterRooms();
    form.addEventListener('submit', (e) => { e.preventDefault(); cuSubmitStay(form, booking, m); });
    openModal = { el: m.el, close: m.close };
  }

  async function cuSubmitStay(form, booking, modal) {
    const fd = new FormData(form), submit = form.querySelector('[type="submit"]'), error = form.querySelector('[data-hx-stay-error]');
    const slug = window.KiwiStore?.slugFor?.(cuVenueId()) || '';
    const payload = { action: 'save', merchant: slug, id: booking?.id || '', clientRef: booking?.publicRef || ('staff-' + crypto.randomUUID()), roomTypeId: fd.get('roomTypeId'), resourceId: fd.get('resourceId'), checkIn: fd.get('checkIn'), checkOut: fd.get('checkOut'), partySize: fd.get('partySize'), channel: fd.get('channel'), status: fd.get('status'), externalRef: fd.get('externalRef'), note: fd.get('note'), customer: { name: fd.get('name'), phone: fd.get('phone'), email: fd.get('email') } };
    if (!slug) { error.textContent = 'Cette boutique n’est pas encore reliée à son compte Kiwi.'; return; }
    submit.disabled = true; error.textContent = '';
    try {
      const res = await fetch('/api/hotel/stays', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.booking) {
        const messages = { 'room-unavailable': 'Cette chambre vient d’être prise sur ces dates. Choisissez-en une autre.', 'duplicate-reference': 'Cette référence OTA existe déjà.', 'invalid-dates': 'Les dates du séjour sont invalides.', invalid: 'Complétez le nom, les dates et la catégorie.', unauthorized: 'Votre session a expiré. Reconnectez-vous.' };
        error.textContent = messages[body.error] || 'Impossible d’enregistrer ce séjour pour le moment.'; return;
      }
      const doc = window.KiwiReservations.get(), i = doc.bookings.findIndex((x) => x.id === body.booking.id);
      if (i < 0) doc.bookings.push(body.booking); else doc.bookings[i] = body.booking;
      window.KiwiReservations.set(doc); modal.close(); openModal = null;
      toast('Séjour enregistré · ch. ' + (cuState().rooms && Object.values(cuState().rooms).find((r) => r.id === body.booking.resourceId)?.n || ''), { type: 'success', desc: body.booking.hotel.checkIn + ' → ' + body.booking.hotel.checkOut + ' · ' + (body.booking.hotel.channel || 'direct') });
      rerender();
    } catch (_) { error.textContent = 'Réseau indisponible : rien n’a été enregistré.'; }
    finally { submit.disabled = false; }
  }

  async function cuCancelStay(id, button, modal) {
    const slug = window.KiwiStore?.slugFor?.(cuVenueId()) || '';
    if (!slug || !id) return;
    button.disabled = true;
    try {
      const res = await fetch('/api/hotel/stays', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'cancel', merchant: slug, id }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.booking) { toast('Annulation impossible', { type: 'warn', desc: body.error || 'Réessayez.' }); return; }
      const doc = window.KiwiReservations.get(), i = doc.bookings.findIndex((x) => x.id === body.booking.id);
      if (i >= 0) doc.bookings[i] = body.booking;
      window.KiwiReservations.set(doc); modal?.close?.(); openModal?.close?.(); openModal = null;
      toast('Séjour annulé', { type: 'success', desc: 'La chambre est de nouveau disponible sur tous les canaux.' });
      rerender();
    } catch (_) { toast('Réseau indisponible', { type: 'warn', desc: 'Le séjour n’a pas été annulé.' }); }
    finally { button.disabled = false; }
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
  function cuChannelMerchant() { return window.KiwiStore?.slugFor?.(cuVenueId()) || ''; }
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
    const choices = [{id:'booking',name:'Booking.com',fee:'15–18 %'},{id:'airbnb',name:'Airbnb',fee:'3 % + frais voyageur'}].map((c)=>`<div class="hx-arr"><span class="tm">ICAL</span><div class="who"><b>${c.name}</b><div class="sub">commission ${c.fee} · import automatique chambre par chambre</div></div><button class="hx-btn ghost" data-action="hx-cb-connect" data-arg="${c.id}">Connecter</button></div>`).join('');
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
          'Le vrai prix des OTA, enfin visible.',
          'Une fois vos canaux connectés, Kiwi calcule ce que chaque canal vous coûte réellement, et combien la réservation directe vous fait économiser.',
          ['Répartition des nuitées par canal', 'Commissions cumulées par mois, en MAD', 'Plan de reconquête des clients fidèles vers le direct']
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
    if (!openDrawer || openDrawer.page !== 'hotelintel' || !cuEconomatState.draft) return;
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
    const outlets = d.units.filter((unit) => unit.kind === 'outlet' && unit.active);
    const mapped = new Set(d.terminals.filter((row) => row.terminalId && row.unitId).map((row) => row.unitId));
    const allOutletsMapped = outlets.length > 0 && outlets.every((unit) => mapped.has(unit.id));
    const registryReady = s.registry.units.length > 0 && allOutletsMapped;
    const inventory = s.report ? `<div class="hx-econ-kpis">
      <div><span>Stock hôtel consolidé</span><b>${cuQty(s.report.consolidated?.closingMilli)}</b><small>${s.report.consolidated?.items?.length || 0} références</small></div>
      <div><span>Unités suivies</span><b>${s.report.units?.length || 0}</b><small>${s.report.units?.every((u) => u.reconciliation?.balanced) ? 'réconciliées' : 'écart à examiner'}</small></div>
      <div><span>Comptages physiques</span><b>${s.report.physicalCounts?.observed || 0}</b><small>${s.report.physicalCounts?.applied || 0} appliqués</small></div>
    </div><div class="hx-econ-unit-report">${(s.report.units || []).map((unit) => `<div><span><b>${esc(unit.locationId)}</b><small>${unit.items?.length || 0} références</small></span><strong>${cuQty(unit.reconciliation?.closingMilli)}</strong><i class="${unit.reconciliation?.balanced ? 'ok' : 'bad'}">${unit.reconciliation?.balanced ? 'équilibré' : 'à vérifier'}</i></div>`).join('')}</div>`
      : `<div class="hx-econ-empty">${esc(s.reportError || (s.registry.units.length ? 'Le rapport sera disponible après les migrations de production.' : 'Configurez les unités pour ouvrir le rapport consolidé.'))}</div>`;
    const shiftRows = s.shifts.length ? s.shifts.map((shift) => `<button data-action="hx-econ-shift" data-arg="${esc(shift.shiftId)}" class="${s.selectedShift === shift.shiftId ? 'on' : ''}"><span><b>${new Date(shift.lastTs).toLocaleString('fr-FR')}</b><small>${shift.chargeCount} charges · ${shift.reversalCount} annulations</small></span><strong>${cuMoney(shift.netCents)}</strong></button>`).join('') : '<div class="hx-econ-empty">Aucune charge chambre enregistrée sur les 30 derniers jours.</div>';
    const cashiers = s.shiftReport ? `<div class="hx-econ-cashiers">${(s.shiftReport.cashiers || []).map((row) => `<div><span><b>${esc(row.cashierName || row.cashierId)}</b><small>${row.chargeCount} charges · ${row.reversalCount} annulations</small></span><strong>${cuMoney(row.netCents)}</strong></div>`).join('')}</div>` : '';
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
    return `<div class="hx-econ-shell" data-hx-economat>
      <div class="hx-econ-head"><div><span>ÉCONOMAT · PILOTE</span><h3>La vérité opérationnelle de l’hôtel</h3><p>Configuration des unités, stock consolidé et charges chambre, sans données client.</p></div><button class="hx-btn ghost" data-action="hx-econ-refresh">Actualiser</button></div>
      ${s.error ? `<div class="hx-econ-alert bad">${esc(s.error)}</div>` : ''}
      <div class="hx-econ-readiness"><div class="${registryReady ? 'ok' : 'wait'}"><b>${registryReady ? 'Registre prêt' : 'Registre incomplet'}</b><span>${s.registry.units.length ? `${s.registry.units.length} unités · ${Object.keys(s.registry.terminalUnits || {}).length} caisses` : 'aucune écriture en production'}</span></div><div class="${s.report ? 'ok' : 'wait'}"><b>${s.report ? 'Rapports disponibles' : 'Migration à confirmer'}</b><span>${s.report ? 'stock et comptages lisibles' : esc(s.reportError || 'aucune donnée fabriquée')}</span></div><div class="wait"><b>Discovery D</b><span>visite terrain requise · jamais validée par logiciel</span></div></div>
      <div class="hx-econ-section"><div class="hx-h"><span class="t">Stock consolidé</span><span class="s">équation par unité et vue hôtel</span></div>${inventory}</div>
      <div class="hx-econ-section"><div class="hx-h"><span class="t">Charges chambre par poste</span><span class="s">aucun nom de client ni numéro de chambre</span></div><div class="hx-econ-shifts">${shiftRows}</div>${cashiers}</div>
      <div class="hx-econ-section"><div class="hx-h"><span class="t">Unités et caisses</span><span class="s">un seul enregistrement atomique</span></div><div class="hx-econ-units">${unitRows}</div><div class="hx-econ-add"><button class="hx-btn ghost" data-action="hx-econ-add-unit" data-arg="outlet">+ Point de vente</button><button class="hx-btn ghost" data-action="hx-econ-add-unit" data-arg="department">+ Département</button></div>
        <div class="hx-econ-terminal-head"><b>Assignation des caisses</b><span>Copiez l’identifiant depuis chaque caisse physique.</span><button class="hx-btn ghost" data-action="hx-econ-add-terminal">+ Caisse</button></div><div>${terminalRows || '<div class="hx-econ-empty">Aucune caisse assignée. Le premier registre ne peut pas être activé ainsi.</div>'}</div>
        <label class="hx-econ-confirm"><input type="checkbox" data-hx-econ-confirm> J’ai relevé toutes les caisses physiques et vérifié leur point de vente.</label>
        <div class="hx-econ-save"><span>${allOutletsMapped ? 'Chaque point de vente actif a au moins une caisse.' : 'Chaque point de vente actif doit avoir une caisse.'}</span><button class="hx-btn atlas" data-action="hx-econ-save" ${s.saving ? 'disabled' : ''}>${s.saving ? 'Enregistrement…' : 'Enregistrer unités + caisses'}</button></div>
      </div>
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
        if (isCustomHotel() && openDrawer?.page === 'sejours') rerender();
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
      ? page('reception', 'Réception', vName() + ' · arrivées, départs, walk-ins, en un geste', cuReceptionBody)
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
    handlers['nav-hotes'] = () => handlers['clients-directory']?.();
    handlers['nav-folios'] = () => cu()
      ? page('folios', 'Notes clients · folios', 'Chambres + extras + taxe de séjour, une seule note par séjour', cuFoliosBody)
      : page('folios', 'Notes clients · folios', 'Chambres + restaurant + hammam + taxe de séjour, une seule note par séjour', foliosBody);
    handlers['nav-canaux'] = () => cu()
      ? (page('canaux', 'Canaux & OTA', '100 % direct aujourd\'hui · connectez vos canaux quand vous êtes prêt', cuCanauxBody), setTimeout(()=>cuLoadChannels(false),0))
      : page('canaux', 'Canaux & OTA', 'Booking.com, Expedia, Airbnb, direct · commissions visibles, enfin', canauxBody);
    handlers['nav-hotelintel'] = () => cu()
      ? (page('hotelintel', 'Intelligence hôtel', 'Prévisions, Économat et contrôle opérationnel', cuIntelBody), setTimeout(() => cuLoadEconomat(false), 0))
      : page('hotelintel', 'Intelligence hôtel', 'Prévision d\'occupation · tarification · no-shows · où part l\'argent', intelBody);

    handlers['hx-econ-refresh'] = () => { cuEconomatState.loaded = false; cuLoadEconomat(true); };
    handlers['hx-econ-add-unit'] = (el, arg) => { cuCaptureEconomatDraft(); cuEconomatState.draft.units.push(cuNewUnit(arg === 'department' ? 'department' : 'outlet')); rerender(); };
    handlers['hx-econ-add-terminal'] = () => { cuCaptureEconomatDraft(); cuEconomatState.draft.terminals.push({ terminalId: '', unitId: '' }); rerender(); };
    handlers['hx-econ-remove-terminal'] = (el, arg) => { cuCaptureEconomatDraft(); cuEconomatState.draft.terminals.splice(Math.max(0, parseInt(arg, 10) || 0), 1); rerender(); };
    handlers['hx-econ-save'] = (el) => cuSaveEconomat(el);
    handlers['hx-econ-shift'] = (el, arg) => cuLoadRoomShift(String(arg || ''));

    /* — custom-hotel controls — */
    handlers['hx-tape-prev'] = () => { cuTapeOffset -= 14; rerender(); };
    handlers['hx-tape-next'] = () => { cuTapeOffset += 14; rerender(); };
    handlers['hx-tape-today'] = () => { cuTapeOffset = 0; rerender(); };
    handlers['hx-stay-new'] = () => { if (isCustomHotel()) cuStayEditor(null); };
    handlers['hx-stay-edit'] = (el, arg) => {
      if (!isCustomHotel() || String(arg).startsWith('folio:')) return;
      const booking = window.KiwiReservations?.get?.().bookings.find((b) => b.id === String(arg));
      if (booking?.hotel) cuStayEditor(booking);
    };
    handlers['hx-stay-cancel'] = (el, arg) => {
      const booking = window.KiwiReservations?.get?.().bookings.find((b) => b.id === String(arg));
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
          status: 'libre', hk: 'clean', guest: null, meta: 'Libre · propre', updatedAt: now + i,
        };
      });
      cuSave(st);
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
      const prior = st.rooms[oldN];
      if (!prior) return;
      const active = prior && ['occ', 'depart', 'arrivee'].includes(prior.status);
      const savedStatus = active ? prior.status : (['libre', 'sale', 'hs'].includes(status) ? status : 'libre');
      const now = cuStamp();
      const room = {
        ...prior, n, typeId, typeName: st.roomTypes[typeId].name,
        floorId, floor: st.floors[floorId].name, rate: null, status: savedStatus,
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
      cuSave(st);
      openModal?.close?.();
      toast('Chambre ' + n + ' enregistrée', { type: 'success', desc: st.roomTypes[typeId].name + ' · ' + st.floors[floorId].name });
      rerender();
    };
    handlers['hx-room-types'] = () => { if (isCustomHotel()) cuTypesManager(); };
    handlers['hx-floors'] = () => { if (isCustomHotel()) cuFloorsManager(); };
    handlers['hx-floor-new'] = () => { if (isCustomHotel()) cuFloorEditor(null); };
    handlers['hx-floor-edit'] = (el, arg) => { if (isCustomHotel()) cuFloorEditor(String(arg || '')); };
    handlers['hx-floor-save'] = (el, arg) => {
      if (!isCustomHotel()) return;
      const root = el.closest('.kiwi-modal');
      const name = String(root?.querySelector('[data-hx-floor-name]')?.value || '').trim();
      const st = cuState();
      if (!name) {
        toast('Donnez un nom à cette section', { type: 'warn', desc: 'Ex. 1er étage, Patio, Aile Atlas.' });
        root?.querySelector('[data-hx-floor-name]')?.focus();
        return;
      }
      const duplicate = Object.values(st.floors).find((f) => f.name.toLocaleLowerCase('fr') === name.toLocaleLowerCase('fr') && f.id !== arg);
      if (duplicate) {
        toast('Cette section existe déjà', { type: 'warn' });
        return;
      }
      const now = cuStamp();
      const id = arg === 'new' ? cuFloorId(name, now) : String(arg);
      const order = arg === 'new' ? cuFloorRows().length : (st.floors[id]?.order || 0);
      st.floors[id] = { ...(st.floors[id] || {}), id, name: name.slice(0, 60), order, updatedAt: now };
      Object.values(st.rooms).filter((r) => r.floorId === id).forEach((r) => { r.floor = name.slice(0, 60); r.updatedAt = now; });
      cuRackFilter.floor = 'all';
      cuSave(st);
      openModal?.close?.();
      toast('Section « ' + name + ' » enregistrée', { type: 'success' });
      rerender();
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
      openModal?.close?.();
      if (el) cuFloorsManager();
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
    handlers['hx-room-floor'] = (el, arg) => { cuRackFilter.floor = String(arg || 'all'); rerender(); };
    handlers['hx-room-status'] = (el, arg) => { cuRackFilter.status = String(arg || 'all'); rerender(); };
    handlers['hx-room-search'] = (el) => {
      cuRackFilter.q = String(el.closest('.hx-room-search')?.querySelector('[data-hx-room-search]')?.value || '').trim();
      rerender();
    };
    handlers['hx-room-filter-reset'] = () => { cuRackFilter.floor = 'all'; cuRackFilter.status = 'all'; cuRackFilter.q = ''; rerender(); };
    if (!window.__kiwiHotelRoomSearchWired) {
      window.__kiwiHotelRoomSearchWired = true;
      document.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' || !event.target?.matches?.('[data-hx-room-search]')) return;
        event.preventDefault();
        handlers['hx-room-search'](event.target);
      });
    }
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
      const tombstone = { ...room, updatedAt: cuStamp(), deletedAt: cuStamp() };
      const records = st.roomRecords || (st.roomRecords = []);
      const i = records.findIndex((r) => r && r.id === room.id);
      if (i >= 0) records[i] = tombstone; else records.push(tombstone);
      delete st.rooms[n];
      cuSave(st);
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
    handlers['hx-room'] = (el, arg) => roomModal(parseInt(arg, 10));
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
      const due = folioTotal(f) - folioPaid(f);
      openModal?.close?.();
      toast('Folio Ch. ' + room + ' encaissé · ' + MAD(due), { type: 'success', desc: 'Taxe de séjour incluse · règlement T+1 demain 9h00 sur votre IBAN.' });
      if (isCustomHotel()) {
        recordSale(due);
        const r = R()[room];
        r.status = 'sale'; r.hk = 'dirty'; r.guest = null;
        r.meta = 'Départ soldé · à remettre à blanc'; r.updatedAt = cuStamp();
        delete F()[room];
        cuSave();
        setTimeout(() => toast('Ch. ' + room + ' → à remettre à blanc', { type: 'info', desc: 'Marquez-la propre depuis Ménage pour la revendre ce soir.' }), 1400);
        rerender();
        return;
      }
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
      if (cu && roomTypeOf(n).base == null) {
        toast('Tarif non configuré', { type: 'info', desc: 'Ajoutez un tarif à cette chambre ou définissez le tarif général dans Tarifs.' });
        return;
      }
      const guest = cu ? 'Client sans nom' : 'Walk-in · M. Idrissi';
      const rate = roomTypeOf(n).base;
      r.status = 'occ'; r.guest = guest; r.meta = 'Walk-in · 1 nuit · réglé d\'avance';
      F()[n] = { room: n, guest, src: 'walkin', pax: 1, nights: 1, lines: [
        { t: nowLabel(), label: 'Nuit 1 · ' + roomTypeOf(n).name, qty: '×1', amt: rate, src: 'room', paid: true },
        { t: 'auto', label: 'Taxe de séjour · 1 pers × 1 nuit', qty: '', amt: TAX_PP_NIGHT, src: 'taxe' },
      ], updatedAt: cuStamp() };
      if (cu) { r.updatedAt = cuStamp(); recordSale(rate); cuState().sold += 1; cuSave(); }
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
    hydrate: (doc) => cuHydrate(doc),
  });

  register();
  /* Same insurance as pages-pro's starter wraps: modules that re-install
   * handlers at load+setTimeout(0) must not clobber the wizard override. */
  window.addEventListener('load', () => setTimeout(() => {
    if (window.Kiwi && window.Kiwi.handlers) window.Kiwi.handlers['onboard'] = obOnboard;
  }, 200));
})();
