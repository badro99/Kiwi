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
        hotelSection('receptionState').replaceState(id, cuHydrate(doc));
        cuWriteLocal(hotelSection('receptionState').stateFor(id), id);
        return hotelSection('receptionState').stateFor(id);
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
