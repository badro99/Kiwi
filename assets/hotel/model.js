/* Owner: hotel model. Exposes a private factory; immutable dependencies are explicit, mutable owner state is accessed through live scope getters/setters. */
(window.__kiwiHotelSections ||= {}).model = (scope) => {
'use strict';
const { DEFAULT_VIEWS, cuAllStays, cuDefaultTypes, cuFloorId, cuInHouseSnapshots, cuRoomLive, cuSafePhoto, cuStamp, cuStayCache, cuStayLoads, cuStayScope, cuToday, cuTypeId, cuVenueId, isCustomHotel, tx, txk } = scope;
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
      const res = await (await import('../request-deadline.mjs').catch(function () { return { deadlineFetch: function (u, o) { return fetch(u, o); } }; })).deadlineFetch(`/api/hotel/stays?merchant=${encodeURIComponent(slug)}&from=${encodeURIComponent(start)}&to=${encodeURIComponent(end)}&includeCancelled=1`, { cache: 'no-store' });
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

async function cuFetchInHouseStays() {
    const slug = window.KiwiStore?.slugFor?.(cuVenueId()) || '';
    if (!slug) return;
    const scope = cuStayScope(), cache = cuStayCache();
    const startedAt = Date.now();
    try {
      const res = await (await import('../request-deadline.mjs').catch(function () { return { deadlineFetch: function (u, o) { return fetch(u, o); } }; })).deadlineFetch('/api/hotel/stays?merchant=' + encodeURIComponent(slug) + '&status=checked_in', { cache: 'no-store' });
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

function cuRoomOccupancy() {
    const stays = cuAllStays();
    /* Le cache se périme tout seul : se fier au seul `rerender()` rendrait la
     * réponse fausse pour tout appel fait entre deux peintures. */
    let freshest = 0;
    stays.forEach((b) => { const u = +b?.updatedAt || 0; if (u > freshest) freshest = u; });
    const signature = cuStayScope() + ':' + stays.size + ':' + freshest;
    if (scope.cuOccupancyMemo && scope.cuOccupancyMemo.signature === signature) return scope.cuOccupancyMemo.map;
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
    scope.cuOccupancyMemo = { signature, map, completed };
    return map;
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
    const lastCheckout = isCustomHotel() && room.id ? (scope.cuOccupancyMemo?.completed?.get(room.id) || 0) : 0;
    if (lastCheckout > (+room.updatedAt || 0) || room.status === 'sale') return { key: 'sale', label: tx('À nettoyer') };
    if (live) return { key: 'arrivee', label: tx('Arrivée attendue') };
    if (room.status === 'occ') return { key: 'occ', label: tx('Occupée') };
    if (room.status === 'depart') return { key: 'occ', label: tx('Départ aujourd’hui') };
    if (room.status === 'arrivee') return { key: 'arrivee', label: tx('Arrivée attendue') };
    if (room.status === 'sale') return { key: 'sale', label: tx('À nettoyer') };
    return { key: 'libre', label: tx('Libre · propre') };
  }

return Object.freeze({ cuActiveActor, cuFetchStaysForWindow, cuSeed, cuHydrate, cuDocument, cuMerge, cuFetchInHouseStays, cuRoomOccupancy, cuRoomStatus });
};

/* Owner: hotel receptionState. Exports named methods below. Reads only the declared scope and browser globals in tools/fixtures/hotel/reception-interfaces.json. */
(window.__kiwiHotelSections ||= {}).receptionState = (scope) => {
'use strict';
function cuDocument(...args) { return scope.cuDocument.apply(this, args); }
function cuEnsureFilterVenue(...args) { return scope.cuEnsureFilterVenue.apply(this, args); }
function cuHydrate(...args) { return scope.cuHydrate.apply(this, args); }
function cuSeed(...args) { return scope.cuSeed.apply(this, args); }
function cuStamp(...args) { return scope.cuStamp.apply(this, args); }
function cuStayScope(...args) { return scope.cuStayScope.apply(this, args); }
function cuVenueId(...args) { return scope.cuVenueId.apply(this, args); }
function toast(...args) { return scope.toast.apply(this, args); }
function trL(...args) { return scope.trL.apply(this, args); }
function tx(...args) { return scope.tx.apply(this, args); }
const CUSTOM_HX = {};
const HX_STORE_PREFIX = 'kiwi:hotel-rooms:v2:';
let hotelCloud = null;
const cuD1Stays = new Map();
const cuStayLoads = new Map();
const cuInHouseSnapshots = new Map();
const cuReceptionFilters = new Map();
function cuStayCache() {
    const scope = cuStayScope();
    if (!cuD1Stays.has(scope)) cuD1Stays.set(scope, new Map());
    return cuD1Stays.get(scope);
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

return Object.freeze({ cuStayCache, cuAllStays, cuStateId, cuStoreKey, cuWriteLocal, cuReadLocal, cuState, cuSave, cuSaveCloud, cuCommitDraft, cloud: () => hotelCloud, setCloud: value => { hotelCloud = value; }, stateFor: id => CUSTOM_HX[id], replaceState: (id, value) => { CUSTOM_HX[id] = value; return value; }, stayLoads: () => cuStayLoads, inHouseSnapshots: () => cuInHouseSnapshots, receptionFilters: () => cuReceptionFilters });
};
