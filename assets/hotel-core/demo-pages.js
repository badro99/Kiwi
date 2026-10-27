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
  function recordSale() { return hotelSection('folioActions').recordSale.apply(this, arguments); }

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
  function occupancyByDay() { return hotelSection('rateActions').occupancyByDay.apply(this, arguments); }
  function tapeBody() { return hotelSection('views').tapeBody.apply(this, arguments); }

  /* ═══════════════ PAGE · MÉNAGE ═══════════════ */
  function menageBody() { return window.__kiwiHotelInternal.part('housekeeping').menageBody.apply(this, arguments); }

  /* ═══════════════ PAGE · TARIFS & OCCUPATION ═══════════════ */
  function tarifsBody() { return hotelSection('editors').tarifsBody.apply(this, arguments); }

  /* ═══════════════ PAGE · CLIENTS & FIDÉLITÉ ═══════════════ */
  function donutCss() { return hotelSection('rateActions').donutCss.apply(this, arguments); }
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
