
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

  function cuVenueId() {
    try { return String(window.KiwiVenue?.getVenue?.() || ''); } catch (_) { return ''; }
  }
  const cuStayLoads = hotelSection('receptionState').stayLoads();
  const cuInHouseSnapshots = hotelSection('receptionState').inHouseSnapshots();
  const cuReceptionFilters = hotelSection('receptionState').receptionFilters();
  function cuStayScope() {
    return String(window.KiwiStore?.slugFor?.(cuVenueId()) || cuStateId());
  }
  function cuStayCache() { return hotelSection('receptionState').cuStayCache.apply(this, arguments); }

  async function cuFetchStaysForWindow() { return hotelSection('model').cuFetchStaysForWindow.apply(this, arguments); }

  function cuAllStays() { return hotelSection('receptionState').cuAllStays.apply(this, arguments); }

  function cuStateId() { return hotelSection('receptionState').cuStateId.apply(this, arguments); }
  function cuStoreKey() { return hotelSection('receptionState').cuStoreKey.apply(this, arguments); }
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
  function cuWriteLocal() { return hotelSection('receptionState').cuWriteLocal.apply(this, arguments); }
  function cuReadLocal() { return hotelSection('receptionState').cuReadLocal.apply(this, arguments); }
  function cuMerge() { return hotelSection('model').cuMerge.apply(this, arguments); }
  function cuState() { return hotelSection('receptionState').cuState.apply(this, arguments); }
  function cuSave() { return hotelSection('receptionState').cuSave.apply(this, arguments); }
  async function cuSaveCloud() { return hotelSection('receptionState').cuSaveCloud.apply(this, arguments); }
  async function cuCommitDraft() { return hotelSection('receptionState').cuCommitDraft.apply(this, arguments); }
  function cuCloudWrite(doc) {
    const id = cuStateId();
    if (!id) return;
    hotelSection('receptionState').replaceState(id, cuHydrate(doc));
    cuWriteLocal(hotelSection('receptionState').stateFor(id), id);
    if (openDrawer && isCustomHotel()) rerender();
  }
  function bindCuCloud() {
    let hotelCloud = hotelSection('receptionState').cloud();
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
    hotelSection('receptionState').setCloud(hotelCloud);
    hotelCloud.bind();
  }
