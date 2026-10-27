
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
