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

  const hotelSections = Object.create(null);
  function hotelSection(name) {
    return hotelSections[name] || (hotelSections[name] = window.__kiwiHotelSections[name]({
      get ARRIVALS() { return ARRIVALS; },
      get DEFAULT_VIEWS() { return DEFAULT_VIEWS; },
      get DEPARTURES() { return DEPARTURES; },
      get F() { return F; },
      get FLOORS() { return FLOORS; },
      get FORECAST() { return FORECAST; },
      get GUESTS() { return GUESTS; },
      get HK_QUEUE() { return HK_QUEUE; },
      get HX_PDV_KINDS() { return HX_PDV_KINDS; },
      get HX_WEEKDAYS() { return HX_WEEKDAYS; },
      get K() { return K; },
      get MAD() { return MAD; },
      get NATIONALITIES() { return NATIONALITIES; },
      get NOSHOW_RISK() { return NOSHOW_RISK; },
      get R() { return R; },
      get RATES() { return RATES; },
      get RATE_DAYS() { return RATE_DAYS; },
      get ROOMS() { return ROOMS; },
      get STAYS() { return STAYS; },
      get TAPE_DAYS() { return TAPE_DAYS; },
      get TODAY_IDX() { return TODAY_IDX; },
      get TYPES() { return TYPES; },
      get aiApplied() { return aiApplied; },
      set aiApplied(value) { aiApplied = value; },
      get counts() { return counts; },
      get cuActiveFilterCount() { return cuActiveFilterCount; },
      get cuAllCharacteristics() { return cuAllCharacteristics; },
      get cuAllStays() { return cuAllStays; },
      get cuAllViews() { return cuAllViews; },
      get cuBillingBlocked() { return cuBillingBlocked; },
      get cuBillingBody() { return cuBillingBody; },
      get cuBillingLine() { return cuBillingLine; },
      get cuBirthDisplay() { return cuBirthDisplay; },
      get cuBirthIso() { return cuBirthIso; },
      get cuBoards() { return cuBoards; },
      get cuBulkPlan() { return cuBulkPlan; },
      set cuBulkPlan(value) { cuBulkPlan = value; },
      get cuBulkStaged() { return cuBulkStaged; },
      set cuBulkStaged(value) { cuBulkStaged = value; },
      get cuCaptureEconomatDraft() { return cuCaptureEconomatDraft; },
      get cuChannelMerchant() { return cuChannelMerchant; },
      get cuChannelState() { return cuChannelState; },
      get cuCharLabel() { return cuCharLabel; },
      get cuCommercialError() { return cuCommercialError; },
      get cuCommercialState() { return cuCommercialState; },
      get cuConnectingAvail() { return cuConnectingAvail; },
      get cuDay() { return cuDay; },
      get cuDefaultTypes() { return cuDefaultTypes; },
      get cuDirectQuote() { return cuDirectQuote; },
      get cuDispoCat() { return cuDispoCat; },
      set cuDispoCat(value) { cuDispoCat = value; },
      get cuDraftInput() { return cuDraftInput; },
      get cuDraftMoney() { return cuDraftMoney; },
      get cuDraftStatus() { return cuDraftStatus; },
      get cuEconomatBody() { return cuEconomatBody; },
      get cuEconomatDraft() { return cuEconomatDraft; },
      get cuEconomatState() { return cuEconomatState; },
      get cuEnsureFilterVenue() { return cuEnsureFilterVenue; },
      get cuEvaluateStayExceptions() { return cuEvaluateStayExceptions; },
      get cuFilterChipsMarkup() { return cuFilterChipsMarkup; },
      get cuFloorId() { return cuFloorId; },
      get cuFloorKey() { return cuFloorKey; },
      get cuFloorMatchesFilter() { return cuFloorMatchesFilter; },
      get cuFloorRows() { return cuFloorRows; },
      get cuFloors() { return cuFloors; },
      get cuHasActiveFilters() { return cuHasActiveFilters; },
      get cuHasGroupRecovery() { return cuHasGroupRecovery; },
      get cuInHouseSnapshots() { return cuInHouseSnapshots; },
      get cuKinds() { return cuKinds; },
      get cuLang() { return cuLang; },
      get cuLoadCommercial() { return cuLoadCommercial; },
      get cuMatchNationality() { return cuMatchNationality; },
      get cuMerchantSlug() { return cuMerchantSlug; },
      get cuMoney() { return cuMoney; },
      get cuNationalities() { return cuNationalities; },
      get cuNationalityLabel() { return cuNationalityLabel; },
      get cuNationalitySelectorHtml() { return cuNationalitySelectorHtml; },
      get cuNormalizeText() { return cuNormalizeText; },
      get cuOccupancyMemo() { return cuOccupancyMemo; },
      set cuOccupancyMemo(value) { cuOccupancyMemo = value; },
      get cuOutletsMapped() { return cuOutletsMapped; },
      get cuParseDelimitedLine() { return cuParseDelimitedLine; },
      get cuPendingBulk() { return cuPendingBulk; },
      get cuPerfState() { return cuPerfState; },
      get cuPerfWindows() { return cuPerfWindows; },
      get cuPrintDraft() { return cuPrintDraft; },
      get cuProductionState() { return cuProductionState; },
      get cuQty() { return cuQty; },
      get cuRackFilter() { return cuRackFilter; },
      get cuReceptionBuckets() { return cuReceptionBuckets; },
      get cuReceptionSelection() { return cuReceptionSelection; },
      get cuRenderPhotoEditor() { return cuRenderPhotoEditor; },
      get cuRoomLive() { return cuRoomLive; },
      get cuRoomMatchesFilter() { return cuRoomMatchesFilter; },
      get cuRoomStatus() { return cuRoomStatus; },
      get cuSafePhoto() { return cuSafePhoto; },
      get cuSejoursAvailabilityBody() { return cuSejoursAvailabilityBody; },
      get cuSelectedNumbers() { return cuSelectedNumbers; },
      get cuSelectedRooms() { return cuSelectedRooms; },
      get cuSelectionMode() { return cuSelectionMode; },
      set cuSelectionMode(value) { cuSelectionMode = value; },
      get cuShrinkHotelPhoto() { return cuShrinkHotelPhoto; },
      get cuStamp() { return cuStamp; },
      get cuStarter() { return cuStarter; },
      get cuState() { return cuState; },
      get cuStayCache() { return cuStayCache; },
      get cuStayLoads() { return cuStayLoads; },
      get cuStayQuoteSignature() { return cuStayQuoteSignature; },
      get cuStayScope() { return cuStayScope; },
      get cuStayView() { return cuStayView; },
      set cuStayView(value) { cuStayView = value; },
      get cuStaysChanged() { return cuStaysChanged; },
      get cuStaysKnown() { return cuStaysKnown; },
      get cuStrip() { return cuStrip; },
      get cuStripUnknown() { return cuStripUnknown; },
      set cuStripUnknown(value) { cuStripUnknown = value; },
      get cuTapeOffset() { return cuTapeOffset; },
      set cuTapeOffset(value) { cuTapeOffset = value; },
      get cuToday() { return cuToday; },
      get cuTonight() { return cuTonight; },
      get cuTypeId() { return cuTypeId; },
      get cuTypeOptions() { return cuTypeOptions; },
      get cuTypes() { return cuTypes; },
      get cuUploadTypePhotos() { return cuUploadTypePhotos; },
      get cuVenueId() { return cuVenueId; },
      get cuViewLabel() { return cuViewLabel; },
      get cuWarmStays() { return cuWarmStays; },
      get cuWireNationalitySelectors() { return cuWireNationalitySelectors; },
      get cuWireStayCommercial() { return cuWireStayCommercial; },
      get donutCss() { return donutCss; },
      get esc() { return esc; },
      get fmt() { return fmt; },
      get folioTotal() { return folioTotal; },
      get hotelCloud() { return hotelCloud; },
      set hotelCloud(value) { hotelCloud = value; },
      get hxColon() { return hxColon; },
      get hxLang() { return hxLang; },
      get hxLocale() { return hxLocale; },
      get hxTo() { return hxTo; },
      get isCustomHotel() { return isCustomHotel; },
      get ltr() { return ltr; },
      get occupancyByDay() { return occupancyByDay; },
      get openDrawer() { return openDrawer; },
      set openDrawer(value) { openDrawer = value; },
      get openFolio() { return openFolio; },
      get openModal() { return openModal; },
      set openModal(value) { openModal = value; },
      get rerender() { return rerender; },
      get roomCountLabel() { return roomCountLabel; },
      get roomTypeOf() { return roomTypeOf; },
      get srcPill() { return srcPill; },
      get toast() { return toast; },
      get totalRooms() { return totalRooms; },
      get trL() { return trL; },
      get tx() { return tx; },
      get txk() { return txk; },
      get txn() { return txn; },
      get typeOf() { return typeOf; },
    }));
  }

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
  function cuActiveActor() { return hotelSection('model').cuActiveActor.apply(this, arguments); }
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

  async function cuFetchStaysForWindow() { return hotelSection('model').cuFetchStaysForWindow.apply(this, arguments); }

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
  function cuSeed() { return hotelSection('model').cuSeed.apply(this, arguments); }
  function cuHydrate() { return hotelSection('model').cuHydrate.apply(this, arguments); }
  function cuDocument() { return hotelSection('model').cuDocument.apply(this, arguments); }
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
  function cuMerge() { return hotelSection('model').cuMerge.apply(this, arguments); }
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
  function rerender() { return hotelSection('editors').rerender.apply(this, arguments); }

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
  function counts() { return hotelSection('views').counts.apply(this, arguments); }
  function receptionBody() { return hotelSection('views').receptionBody.apply(this, arguments); }

  /* ═══════════════ PAGE · PLAN DES CHAMBRES ═══════════════ */
  function rackBody() { return hotelSection('views').rackBody.apply(this, arguments); }
  function cuConnectingAvail() { return hotelSection('views').cuConnectingAvail.apply(this, arguments); }
  function roomModal() { return hotelSection('editors').roomModal.apply(this, arguments); }

  /* ═══════════════ PAGE · RÉSERVATIONS (TAPE CHART) ═══════════════ */
  function occupancyByDay() {
    return TAPE_DAYS.map((_, di) => {
      const cnt = STAYS.filter((s) => di >= s.s && di < s.s + s.n).length;
      return Math.min(cnt, 23);
    });
  }
  function tapeBody() { return hotelSection('views').tapeBody.apply(this, arguments); }

  /* ═══════════════ PAGE · MÉNAGE ═══════════════ */
  function menageBody() { return window.__kiwiHotelInternal.part('housekeeping').menageBody.apply(this, arguments); }

  /* ═══════════════ PAGE · TARIFS & OCCUPATION ═══════════════ */
  function tarifsBody() { return hotelSection('editors').tarifsBody.apply(this, arguments); }

  /* ═══════════════ PAGE · CLIENTS & FIDÉLITÉ ═══════════════ */
  function donutCss(parts) {
    let acc = 0;
    const stops = parts.map((p) => { const s = `${p.color} ${acc}% ${acc + p.pct}%`; acc += p.pct; return s; }).join(', ');
    return `background: conic-gradient(${stops});`;
  }
  function hotesBody() { return hotelSection('views').hotesBody.apply(this, arguments); }
  function guestModal() { return hotelSection('editors').guestModal.apply(this, arguments); }

  /* ═══════════════ PAGE · FOLIOS ═══════════════ */
  function foliosBody() { return window.__kiwiHotelInternal.part('folio').foliosBody.apply(this, arguments); }

  /* ═══════════════ PAGE · CANAUX & OTA ═══════════════ */
  function canauxBody() { return window.__kiwiHotelInternal.part('channels').canauxBody.apply(this, arguments); }

  /* ═══════════════ PAGE · INTELLIGENCE ═══════════════ */
  function forecastSvg() { return hotelSection('views').forecastSvg.apply(this, arguments); }
  function intelBody() { return hotelSection('views').intelBody.apply(this, arguments); }

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
  function cuStrip() { return hotelSection('editors').cuStrip.apply(this, arguments); }
  let cuStripUnknown = false;
  function cuEvaluateStayExceptions() { return hotelSection('views').cuEvaluateStayExceptions.apply(this, arguments); }

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
  function cuReceptionJournal() { return hotelSection('views').cuReceptionJournal.apply(this, arguments); }
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
  async function cuFetchInHouseStays() { return hotelSection('model').cuFetchInHouseStays.apply(this, arguments); }
  function cuReceptionBody() { return hotelSection('views').cuReceptionBody.apply(this, arguments); }
  function cuTypes() {
    return Object.values(cuState().roomTypes || {}).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  }
  function cuTypeOptions(selected) {
    return cuTypes().map((t) => `<option value="${esc(t.id)}" ${t.id === selected ? 'selected' : ''}>${esc(t.name)}${t.rate == null ? '' : ' · ' + MAD(t.rate)}</option>`).join('');
  }
  function cuParseRoomNumbers() { return hotelSection('views').cuParseRoomNumbers.apply(this, arguments); }
  function cuRoomBatchEditor() { return hotelSection('editors').cuRoomBatchEditor.apply(this, arguments); }
  function cuRoomEditor() { return hotelSection('editors').cuRoomEditor.apply(this, arguments); }
  function cuTypesManager() { return hotelSection('editors').cuTypesManager.apply(this, arguments); }
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
  async function cuUploadTypePhotos() { return hotelSection('views').cuUploadTypePhotos.apply(this, arguments); }
  function cuTypeEditor() { return hotelSection('editors').cuTypeEditor.apply(this, arguments); }
  function cuFloorRows() {
    return Object.values(cuState().floors || {}).sort((a, b) => (+a.order || 0) - (+b.order || 0) || a.name.localeCompare(b.name, 'fr'));
  }
  function cuFloorsManager() { return hotelSection('editors').cuFloorsManager.apply(this, arguments); }
  function cuViewsAndCharsManager() { return hotelSection('editors').cuViewsAndCharsManager.apply(this, arguments); }
  function cuUpdateFloorsManagerModal() { return hotelSection('views').cuUpdateFloorsManagerModal.apply(this, arguments); }
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
  function cuFloorEditor() { return hotelSection('editors').cuFloorEditor.apply(this, arguments); }
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
  function cuRoomOccupancy() { return hotelSection('model').cuRoomOccupancy.apply(this, arguments); }
  function cuRoomLive(room) {
    // La maquette de démonstration porte déjà ses statuts en dur.
    if (!room || !room.id || !isCustomHotel()) return null;
    try { return cuRoomOccupancy().get(room.id) || null; } catch (_) { return null; }
  }
  function cuRoomStatus() { return hotelSection('model').cuRoomStatus.apply(this, arguments); }
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
  async function cuRegisterWalkin() { return hotelSection('views').cuRegisterWalkin.apply(this, arguments); }
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
  function cuUnlinkConnectingRooms() { return hotelSection('views').cuUnlinkConnectingRooms.apply(this, arguments); }
  function cuSetConnectingRooms() { return hotelSection('views').cuSetConnectingRooms.apply(this, arguments); }
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
  function cuRoomMatchesFilter() { return hotelSection('views').cuRoomMatchesFilter.apply(this, arguments); }
  function cuFilterChipsMarkup() { return hotelSection('views').cuFilterChipsMarkup.apply(this, arguments); }
  function cuRackBody() { return hotelSection('editors').cuRackBody.apply(this, arguments); }
  function cuFiltersModal() { return hotelSection('editors').cuFiltersModal.apply(this, arguments); }
  let cuBulkStaged = null;
  function cuBulkEditModal() { return hotelSection('editors').cuBulkEditModal.apply(this, arguments); }
  function cuBulkReviewModal() { return hotelSection('editors').cuBulkReviewModal.apply(this, arguments); }
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
  async function cuLoadPerformance() { return hotelSection('editors').cuLoadPerformance.apply(this, arguments); }
  function cuPerformanceBlock() { return window.__kiwiHotelInternal.part('rates').cuPerformanceBlock.apply(this, arguments); }
  function cuTarifsBody() { return window.__kiwiHotelInternal.part('rates').cuTarifsBody.apply(this, arguments); }
  function cuFoliosBody() { return hotelSection('editors').cuFoliosBody.apply(this, arguments); }
  function cuSejoursBody() { return hotelSection('editors').cuSejoursBody.apply(this, arguments); }

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
  function cuDispoBody() { return hotelSection('editors').cuDispoBody.apply(this, arguments); }
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

  function cuMatchNationality() { return hotelSection('views').cuMatchNationality.apply(this, arguments); }

  function cuNationalityLabel(code, l) {
    if (!code) return '';
    const lang = l || cuLang() || 'fr';
    const item = cuNationalities.find((n) => n.code === code.toUpperCase());
    if (!item) return code;
    return item.demonym[lang] || item.demonym.fr || item.demonym.en || item.name[lang] || item.name.fr || code;
  }

  function cuNationalitySelectorHtml() { return hotelSection('views').cuNationalitySelectorHtml.apply(this, arguments); }

  function cuWireNationalitySelectors() { return hotelSection('views').cuWireNationalitySelectors.apply(this, arguments); }

  function cuStayEditor() { return hotelSection('editors').cuStayEditor.apply(this, arguments); }

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
  async function cuOpenDossier() { return hotelSection('editors').cuOpenDossier.apply(this, arguments); }

  function cuParseDelimitedLine() { return hotelSection('views').cuParseDelimitedLine.apply(this, arguments); }

  function cuHasGroupRecovery() { return hotelSection('views').cuHasGroupRecovery.apply(this, arguments); }

  async function cuGroupReservationModal() { return hotelSection('groups').cuGroupReservationModal.apply(this, arguments); }

  async function cuSubmitStay() { return hotelSection('editors').cuSubmitStay.apply(this, arguments); }

  async function cuCancelStay() { return hotelSection('editors').cuCancelStay.apply(this, arguments); }
  /* Arrivée et départ, depuis le journal de réception.
   *
   * Le journal listait les mouvements du jour sans permettre de les
   * enregistrer. On passe par l'action `status`, qui ne touche que le statut :
   * un `save` complet reconstruit le dossier à partir de ce qu'on envoie et
   * effacerait le téléphone, l'e-mail ou les voyageurs non renvoyés. */
  async function cuMoveStayStatus() { return hotelSection('views').cuMoveStayStatus.apply(this, arguments); }
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
  function cuBirthIso() { return hotelSection('views').cuBirthIso.apply(this, arguments); }
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
  async function cuAwaitTariffAck() { return hotelSection('editors').cuAwaitTariffAck.apply(this, arguments); }
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
  function cuCommercialError() { return hotelSection('views').cuCommercialError.apply(this, arguments); }
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
  function cuCommercialBody() { return hotelSection('views').cuCommercialBody.apply(this, arguments); }
  const cuProductionByScope = new Map();
  function cuProductionState() {
    const scope = cuStayScope();
    if (!cuProductionByScope.has(scope)) cuProductionByScope.set(scope, {
      month: new (globalThis.KiwiZoneLaw?.DateTimeFormat || Intl.DateTimeFormat)('en-CA', { timeZone: 'Africa/Casablanca', year: 'numeric', month: '2-digit' }).format(new Date()).slice(0, 7),
      report: null, loading: false, error: '', request: 0,
    });
    return cuProductionByScope.get(scope);
  }
  async function cuLoadProduction() { return hotelSection('editors').cuLoadProduction.apply(this, arguments); }
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
  async function cuCommercialEditor() { return hotelSection('views').cuCommercialEditor.apply(this, arguments); }
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
      </div><div class="hx-room-form-actions"><button class="hx-btn ghost" data-action="hx-channel-close">${tx('Annuler')}</button><button data-activation=write class="hx-btn atlas" data-action="hx-channel-save" data-arg="${provider}">${tx('Connecter et vérifier')}</button></div>` });
    m.el.querySelector('.kiwi-modal')?.classList.add('hx-hotel-modal'); openModal={el:m.el,close:m.close};
  }
  /* Ticket #0009 · where each extranet hides its iCal export. Generic on
   * purpose: extranet menus move, but every platform below ships an iCal
   * export per listing — except B2B allotment (JumboTours), which stays
   * manual entry via + Réservation. */
  function cuChannelGuide() { return hotelSection('editors').cuChannelGuide.apply(this, arguments); }
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
  function cuCaptureEconomatDraft() { return hotelSection('editors').cuCaptureEconomatDraft.apply(this, arguments); }
  function cuEconomatBody() { return hotelSection('views').cuEconomatBody.apply(this, arguments); }
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
  function cuUnitsEditorHtml() { return hotelSection('views').cuUnitsEditorHtml.apply(this, arguments); }
  /* Points de vente: the outlet-facing host for the same shared draft.
   * Rename a restaurant here and the Économat page shows it, because both
   * read cuEconomatState — never a second establishment list. */
  const HX_PDV_KINDS = { get restaurant() { return tx('Restaurant'); }, get bar() { return tx('Bar'); }, get cafe() { return tx('Café'); }, get spa() { return tx('Spa'); } };
  function cuPdvBody() { return hotelSection('views').cuPdvBody.apply(this, arguments); }
  async function cuLoadEconomat() { return hotelSection('views').cuLoadEconomat.apply(this, arguments); }
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
  async function cuSaveEconomat() { return hotelSection('views').cuSaveEconomat.apply(this, arguments); }
  function cuIntelBody() { return hotelSection('editors').cuIntelBody.apply(this, arguments); }

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
      foot: `<button data-activation=write class="kb atlas" data-ob-create type="button" style="width:100%;justify-content:center;padding:13px;font-size:15px;">${trL({fr:'Créer mon tableau de bord →', en:'Create my dashboard →', ar:'أنشئ لوحة التحكم ←'})}</button>`,
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
      const foot = `<p class="hx-outlet-shared">${tx('Prix partagés par tout l’hôtel : le catalogue est commun à tous les points de vente. Modifier un prix change ce que toutes les caisses vendent.')}</p><button data-activation=write type="button" class="hx-btn ghost" data-action="hx-outlet-edit-menu">${tx('Modifier dans le catalogue')}</button>`;
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
              <button data-activation=write class="hx-btn atlas hx-close-finalize">${tx('Valider le contrôle du mois (Réservé Direction)')}</button>
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
          <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:20px;"><button data-activation=write class="hx-btn warn" data-action="hx-room-delete" data-arg="${n}">${tx('Confirmer la suppression')}</button></div>`,
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
          <div style="display:flex;justify-content:flex-end;margin-top:16px;"><button data-activation=write class="hx-btn atlas" data-action="hx-rate-save" data-arg="${ty}|${di}">Enregistrer</button></div>`,
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
