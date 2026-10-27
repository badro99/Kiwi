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
  function cuReceptionBuckets() { return hotelSection('arrivals').cuReceptionBuckets.apply(this, arguments); }
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
  function cuPhotoEditorMarkup() { return hotelSection('roomBoard').cuPhotoEditorMarkup.apply(this, arguments); }
  function cuRenderPhotoEditor() { return hotelSection('roomBoard').cuRenderPhotoEditor.apply(this, arguments); }
  function cuShrinkHotelPhoto() { return hotelSection('roomBoard').cuShrinkHotelPhoto.apply(this, arguments); }
  async function cuUploadTypePhotos() { return hotelSection('views').cuUploadTypePhotos.apply(this, arguments); }
  function cuTypeEditor() { return hotelSection('editors').cuTypeEditor.apply(this, arguments); }
  function cuFloorRows() {
    return Object.values(cuState().floors || {}).sort((a, b) => (+a.order || 0) - (+b.order || 0) || a.name.localeCompare(b.name, 'fr'));
  }
  function cuFloorsManager() { return hotelSection('editors').cuFloorsManager.apply(this, arguments); }
  function cuViewsAndCharsManager() { return hotelSection('editors').cuViewsAndCharsManager.apply(this, arguments); }
  function cuUpdateFloorsManagerModal() { return hotelSection('views').cuUpdateFloorsManagerModal.apply(this, arguments); }
  function cuRefreshFloorSelectors() { return hotelSection('roomBoard').cuRefreshFloorSelectors.apply(this, arguments); }
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
  async function cuStayStatus() { return hotelSection('arrivals').cuStayStatus.apply(this, arguments); }
  /* Le règlement du walk-in a échoué après son inscription : le séjour est
     défait par le chemin tracé (en maison → confirmé → annulé), jamais effacé. */
  async function cuStayCancel() { return hotelSection('arrivals').cuStayCancel.apply(this, arguments); }
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
  function cuLinkConnectingRooms() { return hotelSection('roomBoard').cuLinkConnectingRooms.apply(this, arguments); }
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
