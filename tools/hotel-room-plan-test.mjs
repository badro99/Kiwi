#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(ROOT, 'assets/hotel.js'), 'utf8');
const styles = fs.readFileSync(path.join(ROOT, 'assets/hotel.css'), 'utf8');

let failures = 0;
const ok = (condition, message) => {
  if (condition) console.log('  ✓ ' + message);
  else { failures++; console.error('  ✗ ' + message); }
};

class MockElement {
  constructor(tag = 'div', attrs = {}) {
    this.tagName = tag.toUpperCase();
    this.attributes = { ...attrs };
    this.children = [];
    this.parentNode = null;
    this.innerHTML = '';
    this.textContent = '';
    this.value = attrs.value || '';
    this.checked = Boolean(attrs.checked);
    this.hidden = false;
    this.disabled = false;
    this.classList = new Set();
    if (attrs.class) {
      attrs.class.split(/\s+/).filter(Boolean).forEach((c) => this.classList.add(c));
    }
  }
  getAttribute(name) { return this.attributes[name] ?? null; }
  setAttribute(name, val) {
    this.attributes[name] = String(val);
    if (name === 'class') {
      this.classList.clear();
      String(val).split(/\s+/).filter(Boolean).forEach((c) => this.classList.add(c));
    }
  }
  hasAttribute(name) { return name in this.attributes; }
  removeAttribute(name) {
    delete this.attributes[name];
    if (name === 'class') this.classList.clear();
  }
  focus() {}
  closest(selector) {
    let curr = this;
    while (curr) {
      if (curr.matches && curr.matches(selector)) return curr;
      curr = curr.parentNode;
    }
    return null;
  }
  matchesSimple(sel) {
    sel = sel.trim();
    if (!sel) return false;
    let tag = '';
    let rest = sel;
    const tagMatch = sel.match(/^([a-zA-Z0-9_-]+)/);
    if (tagMatch) {
      tag = tagMatch[1].toUpperCase();
      rest = sel.slice(tagMatch[1].length);
    }
    if (tag && this.tagName !== tag) return false;

    const classes = rest.match(/\.([a-zA-Z0-9_-]+)/g) || [];
    for (const c of classes) {
      if (!this.classList.has(c.slice(1))) return false;
    }

    const attrs = rest.match(/\[([a-zA-Z0-9_:-]+)(?:="?([^"\]]*)"?)?\]/g) || [];
    for (const a of attrs) {
      const m = a.match(/\[([a-zA-Z0-9_:-]+)(?:="?([^"\]]*)"?)?\]/);
      if (!m) continue;
      const attrName = m[1];
      const attrVal = m[2];
      if (!this.hasAttribute(attrName)) return false;
      if (attrVal !== undefined && this.getAttribute(attrName) !== attrVal) return false;
    }
    return true;
  }
  matches(sel) {
    if (sel.includes(',')) {
      return sel.split(',').some((s) => this.matches(s.trim()));
    }
    const parts = sel.trim().split(/\s+/);
    if (parts.length === 1) return this.matchesSimple(parts[0]);
    if (!this.matchesSimple(parts[parts.length - 1])) return false;
    let curr = this.parentNode;
    let pIdx = parts.length - 2;
    while (curr && pIdx >= 0) {
      if (curr.matchesSimple && curr.matchesSimple(parts[pIdx])) {
        pIdx--;
      }
      curr = curr.parentNode;
    }
    return pIdx < 0;
  }
  querySelector(sel) {
    const list = this.querySelectorAll(sel);
    return list.length ? list[0] : null;
  }
  querySelectorAll(sel) {
    const results = [];
    const walk = (node) => {
      for (const ch of node.children || []) {
        if (ch.matches && ch.matches(sel)) results.push(ch);
        walk(ch);
      }
    };
    walk(this);
    return results;
  }
}

function boot(initialVenue = 'vhotel', savedData = null, options = {}) {
  const data = savedData || new Map();
  let storageFails = false;
  const localStorage = {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => {
      if (storageFails) throw new Error('QuotaExceededError: localStorage write failed');
      data.set(k, String(v));
    },
    removeItem: (k) => data.delete(k),
  };
  const handlers = {};
  const toasts = [];
  let curVenue = initialVenue;
  const domElements = [];
  let mockPushResult = options.mockPushResult || null;
  let mockCloudResult = options.mockCloudResult || null;
  const bulkRequests = [];
  const bulkOperations = new Map();
  let bulkRevision = 1;
  let bulkDocument = null;

  const jsonResponse = (status, body) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
  const bulkFetch = async (url, request = {}) => {
    if (url !== '/api/hotel/rooms-bulk') return jsonResponse(404, { ok: false, error: 'not-mocked' });
    const body = JSON.parse(request.body || '{}');
    bulkRequests.push(body);
    if (options.bulkResponse) return jsonResponse(options.bulkResponse.status || 200, options.bulkResponse.body || options.bulkResponse);
    if (mockPushResult) {
      const result = await mockPushResult(body);
      return jsonResponse(result.status || (result.ok === false ? 409 : 200), result);
    }
    const prior = bulkOperations.get(body.operationId);
    if (prior) return jsonResponse(prior.status, prior.body);
    if (!bulkDocument) return jsonResponse(503, { ok: false, error: 'mock-document-not-configured' });
    const next = JSON.parse(JSON.stringify(bulkDocument));
    const floors = new Map((next.floors || []).map((f) => [String(f.id), f]));
    const types = new Map((next.roomTypes || []).map((t) => [String(t.id), t]));
    const byId = new Map((next.rooms || []).map((r) => [String(r.id), r]));
    for (const target of body.targets || []) {
      const room = byId.get(String(target.id));
      if (!room || Number(room.updatedAt || 0) !== Number(target.expectedUpdatedAt || 0)) {
        const conflict = { ok: false, error: 'room-conflict', operation: { id: body.operationId } };
        bulkOperations.set(body.operationId, { status: 409, body: conflict });
        return jsonResponse(409, conflict);
      }
      const change = body.changes || {};
      if (change.floorId) { room.floorId = change.floorId; room.floor = floors.get(String(change.floorId))?.name || room.floor; }
      if (change.typeId) { room.typeId = change.typeId; room.typeName = types.get(String(change.typeId))?.name || room.typeName; }
      if (change.view !== null && change.view !== undefined) room.view = change.view || null;
      if (change.charMode === 'add') room.characteristics = Array.from(new Set([...(room.characteristics || []), ...(change.characteristics || [])]));
      if (change.charMode === 'remove') room.characteristics = (room.characteristics || []).filter((c) => !(change.characteristics || []).includes(c));
      room.updatedAt = Number(room.updatedAt || 0) + 1;
    }
    next.roomAudits = [...(next.roomAudits || []), {
      id: 'audit:' + body.operationId, action: 'bulk_edit', roomNumbers: (body.targets || []).map((t) => t.n),
      before: (body.targets || []).map((t) => ({ id: t.id, n: t.n, expectedUpdatedAt: t.expectedUpdatedAt })),
      actor: { id: 'usr_emp_42', name: 'Nadia Alaoui', role: 'reception' }, at: Date.now(),
    }];
    const responseBody = { ok: true, rev: bulkRevision++, data: next, operation: { id: body.operationId, status: 'applied' } };
    bulkOperations.set(body.operationId, { status: 200, body: responseBody });
    bulkDocument = next;
    return jsonResponse(200, responseBody);
  };

  const document = {
    addEventListener() {},
    querySelector(sel) {
      const all = this.querySelectorAll(sel);
      return all.length ? all[0] : null;
    },
    querySelectorAll(sel) {
      const results = [];
      const walk = (node) => {
        if (node.matches && node.matches(sel)) results.push(node);
        for (const ch of node.children || []) {
          walk(ch);
        }
      };
      for (const el of domElements) {
        walk(el);
      }
      return results;
    },
    createElement(tag) {
      return new MockElement(tag);
    },
  };

  const window = {
    localStorage,
    document,
    addEventListener() {},
    Kiwi: {
      handlers,
      appPage() { return { el: new MockElement('div'), close() {} }; },
      modal(opts) {
        const el = new MockElement('div', { class: 'kiwi-backdrop' });
        const modal = new MockElement('div', { class: 'kiwi-modal' });
        el.children.push(modal);
        modal.parentNode = el;
        modal.innerHTML = opts.body || '';
        domElements.push(el);
        return { el, close: () => {
          const idx = domElements.indexOf(el);
          if (idx >= 0) domElements.splice(idx, 1);
        } };
      },
      toast(title, opts) {
        toasts.push({ title, ...opts });
      },
    },
    KiwiVenue: {
      getVenue: () => curVenue,
      getCurrentVenueData: () => ({ id: curVenue, slug: 'slug-' + curVenue, name: 'Hôtel ' + curVenue, type: 'hotel', subtype: 'hotel', custom: true }),
      getVenueType: () => 'hotel',
      isCustom: () => true,
      subscribe() { return () => {}; },
      setVenue: (v) => { curVenue = v; },
    },
    KiwiCloudDoc: {
      attach(cfg) {
        return {
          bind() {},
          push() {},
          save: async (doc) => mockCloudResult ? (typeof mockCloudResult === 'function' ? mockCloudResult(doc) : mockCloudResult) : ({ ok: true, status: 200, rev: 1, data: doc, operation: { status: 'applied' } }),
          pushNow: async (opts) => {
            if (mockPushResult) return mockPushResult(opts, cfg);
            return { ok: true, status: 200, rev: 1 };
          },
        };
      },
      slugFor: (id) => 'slug-' + id,
    },
    KiwiMe: {
      id: 'usr_emp_42',
      name: 'Nadia Alaoui',
      role: 'reception',
      merchant: 'slug-' + curVenue,
    },
    KiwiReservations: {
      get: () => ({ bookings: [] }),
      resourceFree: (doc, resId, startAt, endAt) => resId !== 'room:busy',
    },
  };

  const context = {
    window, localStorage, document, console,
    fetch: bulkFetch,
    setTimeout() { return 0; }, clearTimeout() {},
    Date, Math, JSON, Object, Array, String, Number, Map, Set,
  };
  vm.runInNewContext(source, context, { filename: 'assets/hotel.js' });

  return {
    data,
    window,
    handlers,
    toasts,
    domElements,
    setVenue: window.KiwiVenue.setVenue,
    setBulkDocument: (doc) => { bulkDocument = JSON.parse(JSON.stringify(doc)); },
    bulkRequests,
    bulkOperations,
    replayLastBulk: async () => {
      const last = bulkRequests[bulkRequests.length - 1];
      return last ? bulkFetch('/api/hotel/rooms-bulk', { method: 'POST', body: JSON.stringify(last) }) : null;
    },
    setStorageFails: (f) => { storageFails = f; },
    setMockPush: (fn) => { mockPushResult = fn; },
    setMockCloud: (result) => { mockCloudResult = result; },
  };
}

function makeEditor(fields, extra = {}) {
  const controls = {};
  for (const [k, v] of Object.entries(fields)) {
    const el = new MockElement('input');
    if (typeof v === 'boolean') {
      el.checked = v;
      el.value = v ? 'on' : '';
    } else {
      el.value = String(v);
    }
    controls[k] = el;
  }
  const root = new MockElement('div', { class: 'kiwi-modal' });
  root.querySelector = (sel) => controls[sel] || null;
  root.querySelectorAll = (sel) => {
    const match = [];
    for (const [k, el] of Object.entries(controls)) {
      if (sel.includes(':checked') && !el.checked) continue;
      const baseSel = sel.replace(':checked', '');
      if (k === baseSel || k.startsWith(baseSel)) match.push(el);
    }
    return match;
  };
  Object.assign(root, extra);
  return { closest: () => root, disabled: false };
}

async function runAllTests() {
  console.log('\n■ 1. Section Management: Live modal update, empty sections & storage safety');
  {
    const env = boot('vhotel');
    const mod = env.window.KiwiHotelRooms;
    const initial = mod.current();
    const floor1 = initial.floors[0];

    // Set up an open floors manager modal in DOM
    const floorsModalBackdrop = new MockElement('div');
    const floorsModal = new MockElement('div', { class: 'kiwi-modal hx-hotel-modal hx-floors-modal' });
    floorsModalBackdrop.children.push(floorsModal);
    floorsModal.parentNode = floorsModalBackdrop;
    const listEl = new MockElement('div', { class: 'hx-floor-manager-list' });
    listEl.innerHTML = `<div class="hx-floor-manager-row"><b>${floor1.name}</b></div>`;
    floorsModal.children.push(listEl);
    listEl.parentNode = floorsModal;
    env.domElements.push(floorsModalBackdrop);

    // Set up an open room-assignment select in DOM
    const roomFloorSelect = new MockElement('select', { 'data-hx-room-floor-id': '' });
    roomFloorSelect.innerHTML = `<option value="${floor1.id}">${floor1.name}</option>`;
    env.domElements.push(roomFloorSelect);

    // 1.1 Empty section creation
    const editorBtn = makeEditor({ '[data-hx-floor-name]': '2ème Étage' });
    await env.handlers['hx-floor-save'](editorBtn, 'new');

    const updatedDoc = mod.current();
    const floor2 = updatedDoc.floors.find((f) => f.name === '2ème Étage' && !f.deletedAt);
    ok(Boolean(floor2), 'new section « 2ème Étage » is persisted in state');

    // Check live floors modal update
    ok(listEl.innerHTML.includes('2ème Étage'), 'new section appears immediately in the still-open management modal DOM');
    ok(roomFloorSelect.innerHTML.includes('2ème Étage'), 'open room-assignment select updates with the new section');

    // 1.2 The floor action reports the acknowledged cloud write.
    const lastToast = env.toasts[env.toasts.length - 1];
    ok(lastToast && lastToast.desc && lastToast.desc.includes('serveur confirmé'), 'toast reports server-confirmed floor persistence');

    // 1.3 Empty section rendering in rack
    mod.filter.floor = floor2.name;
    ok(mod.matchesFilter({ floor: floor2.name, floorId: floor2.id }), 'filter matches empty floor');

    // 1.4 Prevent duplicate section creation
    const prevToastCount = env.toasts.length;
    const dupBtn = makeEditor({ '[data-hx-floor-name]': '2ème Étage' });
    await env.handlers['hx-floor-save'](dupBtn, 'new');
    ok(env.toasts.length > prevToastCount && env.toasts[env.toasts.length - 1].type === 'error', 'duplicate section name is rejected without a false success');

    // 1.5 Safe reassignment on section deletion
    const delBtn = makeEditor({ '[data-hx-floor-target]': floor2.id });
    env.handlers['hx-floor-delete'](delBtn, floor1.id);
    const postDelDoc = mod.current();
    const floor1Record = postDelDoc.floors.find((f) => f.id === floor1.id);
    ok(floor1Record && floor1Record.deletedAt, 'deleted section written as tombstone');

    // 1.6 A rejected cloud acknowledgement keeps the draft uncommitted.
    const failBtn = makeEditor({ '[data-hx-floor-name]': '3ème Étage' });
    env.setMockCloud({ ok: false, status: 503, error: 'cloud-unavailable' });
    await env.handlers['hx-floor-save'](failBtn, 'new');
    env.setMockCloud(null);
    const docAfterFail = mod.current();
    const failedFloor = docAfterFail.floors.find((f) => f.name === '3ème Étage');
    ok(!failedFloor, 'section creation is not committed when cloud acknowledgement fails');
    const failToast = env.toasts[env.toasts.length - 1];
    ok(failToast && failToast.type === 'error', 'cloud failure shows error toast');
  }

  console.log('\n■ 2. Room Characteristics & Connecting Rooms (Reciprocity & Merge Invariants)');
  {
    const env = boot('vhotel');
    const mod = env.window.KiwiHotelRooms;
    const doc = mod.current();
    const floorId = doc.floors[0].id;
    const typeId = doc.roomTypes[0].id;

    // Create rooms 201, 202, 203
    env.handlers['hx-room-batch-save'](makeEditor({
      '[data-hx-room-numbers]': '201, 202, 203',
      '[data-hx-room-type-id]': typeId,
      '[data-hx-room-floor-id]': floorId,
    }));

    let currentRooms = mod.current().rooms;
    let r201 = currentRooms.find((r) => r.n === 201);
    let r202 = currentRooms.find((r) => r.n === 202);
    let r203 = currentRooms.find((r) => r.n === 203);

    // 2.1 Configurable views & missing views default to null
    ok(r201.view === null && (!r201.characteristics || r201.characteristics.length === 0), 'room initially has null view and empty characteristics');

    // Save room 201 with view and characteristics
    const save201 = makeEditor({
      '[data-hx-room-number]': 201,
      '[data-hx-room-type-id]': typeId,
      '[data-hx-room-floor-id]': floorId,
      '[data-hx-room-view]': 'Mer',
      '[data-hx-room-char="balcony"]': true,
      '[data-hx-room-char="ac"]': true,
    });
    save201.closest().querySelectorAll = (sel) => {
      if (sel.includes('[data-hx-room-char]:checked')) {
        return [
          { getAttribute: () => 'balcony' },
          { getAttribute: () => 'ac' },
        ];
      }
      return [];
    };
    env.handlers['hx-room-save'](save201, 201);

    r201 = mod.current().rooms.find((r) => r.n === 201);
    ok(r201.view === 'Mer', 'room view « Mer » is saved');
    ok(r201.characteristics.includes('balcony') && r201.characteristics.includes('ac'), 'room characteristics [balcony, ac] saved');

    // 2.1b Hydration must not discard forward-compatible room/document fields.
    const extensionDoc = mod.current();
    extensionDoc.rooms.find((r) => r.n === 201).xHousekeeping = { source: 'future-client' };
    extensionDoc.documentExtras = { inspectionWindow: 'morning' };
    mod.hydrate(extensionDoc);
    const hydratedExtension = mod.current();
    ok(hydratedExtension.rooms.find((r) => r.n === 201).xHousekeeping?.source === 'future-client', 'room hydration preserves unknown extension fields');
    ok(hydratedExtension.documentExtras?.inspectionWindow === 'morning', 'document hydration preserves documentExtras');

    // 2.2 Connecting rooms: reciprocal linking with connectingMeta
    mod.linkConnecting(r201.id, r202.id);
    currentRooms = mod.current().rooms;
    r201 = currentRooms.find((r) => r.n === 201);
    r202 = currentRooms.find((r) => r.n === 202);

    ok(r201.connectingRoomIds.includes(r202.id), 'room 201 links to room 202');
    ok(r202.connectingRoomIds.includes(r201.id), 'room 202 reciprocally links back to room 201');
    ok(r201.connectingMeta && r201.connectingMeta[r202.id] && r201.connectingMeta[r202.id].linked === true, 'room 201 records linkingMeta for partner');
    ok(r202.connectingMeta && r202.connectingMeta[r201.id] && r202.connectingMeta[r201.id].linked === true, 'room 202 records linkingMeta for partner');

    // 2.3 Multi-connecting rooms
    mod.linkConnecting(r201.id, r203.id);
    currentRooms = mod.current().rooms;
    r201 = currentRooms.find((r) => r.n === 201);
    r203 = currentRooms.find((r) => r.n === 203);
    ok(r201.connectingRoomIds.length === 2 && r201.connectingRoomIds.includes(r203.id), 'room 201 connects to both 202 and 203');
    ok(r203.connectingRoomIds.includes(r201.id), 'room 203 reciprocally links back to room 201');

    // 2.4 Self-linking prevented
    mod.linkConnecting(r201.id, r201.id);
    r201 = mod.current().rooms.find((r) => r.n === 201);
    ok(!r201.connectingRoomIds.includes(r201.id), 'self-linking is prevented');

    // 2.5 Reciprocal unlinking with connectingMeta
    mod.unlinkConnecting(r201.id, r202.id);
    currentRooms = mod.current().rooms;
    r201 = currentRooms.find((r) => r.n === 201);
    r202 = currentRooms.find((r) => r.n === 202);
    ok(!r201.connectingRoomIds.includes(r202.id), 'room 201 unlinks from room 202');
    ok(!r202.connectingRoomIds.includes(r201.id), 'room 202 reciprocally drops link to room 201');
    ok(r201.connectingMeta[r202.id] && r201.connectingMeta[r202.id].linked === false, 'room 201 records unlinking decision in connectingMeta');
    ok(r202.connectingMeta[r201.id] && r202.connectingMeta[r201.id].linked === false, 'room 202 records unlinking decision in connectingMeta');

    // 2.6 Deletion cleans reciprocal links
    env.handlers['hx-room-delete'](makeEditor({}), 203);
    r201 = mod.current().rooms.find((r) => r.n === 201);
    ok(!r201.connectingRoomIds.includes(r203.id), 'deleting room 203 cleans up reciprocal link on room 201');

    // 2.7 cuMerge reciprocity & conflict invariants
    const baseDocA = {
      v: 4,
      rooms: [
        { id: 'r101', n: 101, updatedAt: 100, connectingRoomIds: ['r102'], connectingMeta: { r102: { at: 100, linked: true } } },
        { id: 'r102', n: 102, updatedAt: 100, connectingRoomIds: ['r101'], connectingMeta: { r101: { at: 100, linked: true } } },
        { id: 'r103', n: 103, updatedAt: 100, connectingRoomIds: [], connectingMeta: {} },
      ],
      roomAudits: [{ id: 'aud1', at: 100, action: 'create' }],
    };
    // Client B concurrently links r101 to r103
    const baseDocB = {
      v: 4,
      rooms: [
        { id: 'r101', n: 101, updatedAt: 110, connectingRoomIds: ['r103'], connectingMeta: { r103: { at: 110, linked: true } } },
        { id: 'r102', n: 102, updatedAt: 100, connectingRoomIds: ['r101'], connectingMeta: { r101: { at: 100, linked: true } } },
        { id: 'r103', n: 103, updatedAt: 110, connectingRoomIds: ['r101'], connectingMeta: { r101: { at: 110, linked: true } } },
      ],
      roomAudits: [{ id: 'aud2', at: 110, action: 'link' }],
    };
    const merged = mod.merge(baseDocA, baseDocB);
    const m101 = merged.rooms.find((r) => r.id === 'r101');
    const m102 = merged.rooms.find((r) => r.id === 'r102');
    const m103 = merged.rooms.find((r) => r.id === 'r103');
    ok(m101.connectingRoomIds.includes('r102') && m101.connectingRoomIds.includes('r103'), 'merge preserves concurrent links from both clients');
    ok(m102.connectingRoomIds.includes('r101'), 'reciprocal link r102 -> r101 preserved in merge');
    ok(m103.connectingRoomIds.includes('r101'), 'reciprocal link r103 -> r101 preserved in merge');
    ok(merged.roomAudits.length === 2, 'audit events deduplicated without dropping distinct entries');

    // Client C unlinks r101 and r102 at t=200; stale Client D still has them linked at t=100
    const docUnlink = {
      v: 4,
      rooms: [
        { id: 'r101', n: 101, updatedAt: 200, connectingRoomIds: [], connectingMeta: { r102: { at: 200, linked: false } } },
        { id: 'r102', n: 102, updatedAt: 200, connectingRoomIds: [], connectingMeta: { r101: { at: 200, linked: false } } },
      ],
    };
    const docStale = {
      v: 4,
      rooms: [
        { id: 'r101', n: 101, updatedAt: 100, connectingRoomIds: ['r102'], connectingMeta: { r102: { at: 100, linked: true } } },
        { id: 'r102', n: 102, updatedAt: 100, connectingRoomIds: ['r101'], connectingMeta: { r101: { at: 100, linked: true } } },
      ],
    };
    const mergedUnlink = mod.merge(docUnlink, docStale);
    const mu101 = mergedUnlink.rooms.find((r) => r.id === 'r101');
    const mu102 = mergedUnlink.rooms.find((r) => r.id === 'r102');
    ok(!mu101.connectingRoomIds.includes('r102') && !mu102.connectingRoomIds.includes('r101'), 'cuMerge never resurrects deliberately removed connecting link');

    // Corrupt payload with self-link and ghost ID is sanitized
    const docCorrupt = {
      v: 4,
      rooms: [
        { id: 'r101', n: 101, updatedAt: 250, connectingRoomIds: ['r101', 'ghost_id'], connectingMeta: {} },
      ],
    };
    const mergedCorrupt = mod.merge(docCorrupt, docCorrupt);
    const mc101 = mergedCorrupt.rooms.find((r) => r.id === 'r101');
    ok(mc101.connectingRoomIds.length === 0, 'cuMerge rejects self-connections and dead/missing room IDs');
  }

  console.log('\n■ 3. Date-Aware Connecting-Room Availability');
  {
    const env = boot('vhotel');
    const mod = env.window.KiwiHotelRooms;
    const targetRoom = { id: 'room:free', n: 301, status: 'libre' };
    const busyRoom = { id: 'room:busy', n: 302, status: 'libre' };

    // 3.1 Missing stay dates returns warning label
    const resNoDates = mod.connectingAvail(targetRoom, null);
    ok(resNoDates === 'Disponibilité non vérifiée (dates requises)', 'availability returns dates-required notice when dates missing');

    const resEmptyDates = mod.connectingAvail(targetRoom, { startAt: 0, endAt: 0 });
    ok(resEmptyDates === 'Disponibilité non vérifiée (dates requises)', 'availability returns dates-required notice when dates empty');

    // 3.2 KiwiReservations missing or uninitialized
    const origRes = env.window.KiwiReservations;
    env.window.KiwiReservations = null;
    const resNoReservations = mod.connectingAvail(targetRoom, { startAt: 1700000000, endAt: 1700100000 });
    ok(resNoReservations.includes('non vérifiée'), 'availability safely handles missing KiwiReservations service');
    env.window.KiwiReservations = origRes;

    // 3.3 Available target room
    const resAvail = mod.connectingAvail(targetRoom, { startAt: 1700000000, endAt: 1700100000 });
    ok(resAvail === 'Disponible pour ces dates', 'returns positive availability confirmation when dates free');

    // 3.4 Occupied / busy target room
    const resBusy = mod.connectingAvail(busyRoom, { startAt: 1700000000, endAt: 1700100000 });
    ok(resBusy === 'Occupée / réservée sur ces dates', 'returns occupied notice when room is busy for dates');
  }

  console.log('\n■ 4. Multi-dimensional Combinable Filters');
  {
    const env = boot('vhotel');
    const mod = env.window.KiwiHotelRooms;
    const doc = mod.current();
    const f1 = doc.floors[0].id;

    // Create floor 2
    await env.handlers['hx-floor-save'](makeEditor({ '[data-hx-floor-name]': 'Étage 2' }), 'new');
    const f2 = mod.current().floors.find((f) => f.name === 'Étage 2').id;
    const t1 = doc.roomTypes[0].id;

    // Helper to create test room
    const createTestRoom = (n, floorId, status, view, chars, connectingIds = []) => {
      env.handlers['hx-room-batch-save'](makeEditor({
        '[data-hx-room-numbers]': String(n),
        '[data-hx-room-type-id]': t1,
        '[data-hx-room-floor-id]': floorId,
      }));
      const curDoc = mod.current();
      const r = curDoc.rooms.find((x) => x.n === n);
      r.status = status;
      r.view = view;
      r.characteristics = chars;
      r.connectingRoomIds = connectingIds;
      mod.hydrate(curDoc);
    };

    createTestRoom(101, f1, 'libre', 'Mer', ['balcony', 'ac'], ['room:102']);
    createTestRoom(102, f1, 'occ', 'Jardin', ['balcony'], ['room:101']);
    createTestRoom(103, f1, 'libre', null, ['ac', 'pmr'], []);
    createTestRoom(201, f2, 'libre', 'Mer', ['terrace', 'ac'], []);
    createTestRoom(202, f2, 'sale', 'Piscine', ['bathtub'], []);
    createTestRoom(203, f2, 'libre', null, ['quiet'], []);

    const allRooms = mod.current().rooms;

    // 4.1 Combination 1: « Avec vue » alone
    mod.resetFilter();
    mod.filter.hasView = true;
    const resVueAlone = allRooms.filter((r) => mod.matchesFilter(r)).map((r) => r.n);
    ok(resVueAlone.length === 4 && resVueAlone.includes(101) && resVueAlone.includes(102) && resVueAlone.includes(201) && resVueAlone.includes(202),
      'combination 1: « Avec vue » matches all rooms with explicit view (101, 102, 201, 202)');

    // 4.2 Combination 2: « Avec vue » + Floor 1
    mod.resetFilter();
    mod.filter.hasView = true;
    mod.filter.floors.add(f1);
    const resVueF1 = allRooms.filter((r) => mod.matchesFilter(r)).map((r) => r.n);
    ok(resVueF1.length === 2 && resVueF1.includes(101) && resVueF1.includes(102),
      'combination 2: « Avec vue » + Floor 1 matches exactly [101, 102]');

    // 4.3 Combination 3: « Avec vue » + Floor 1 & Floor 2 (OR within floor dimension)
    mod.resetFilter();
    mod.filter.hasView = true;
    mod.filter.floors.add(f1);
    mod.filter.floors.add(f2);
    const resVueF1F2 = allRooms.filter((r) => mod.matchesFilter(r)).map((r) => r.n);
    ok(resVueF1F2.length === 4, 'combination 3: « Avec vue » + Floors (1 OR 2) matches all 4 rooms');

    // 4.4 Combination 4: Specific view "Mer" + connecting + ready (Libre)
    mod.resetFilter();
    mod.filter.views.add('Mer');
    mod.filter.connectingOnly = true;
    mod.filter.status = 'libre';
    const resMerConnLibre = allRooms.filter((r) => mod.matchesFilter(r)).map((r) => r.n);
    ok(resMerConnLibre.length === 1 && resMerConnLibre[0] === 101,
      'combination 4: View « Mer » + Connecting + Libre matches strictly room 101');

    // 4.5 Required amenities: AND logic
    mod.resetFilter();
    mod.filter.characteristics.add('balcony');
    mod.filter.characteristics.add('ac');
    const resBalconyAc = allRooms.filter((r) => mod.matchesFilter(r)).map((r) => r.n);
    ok(resBalconyAc.length === 1 && resBalconyAc[0] === 101,
      'amenities filter enforces AND logic: only room 101 has both balcony and ac');

    // 4.6 Reset filter restores all
    mod.resetFilter();
    const resReset = allRooms.filter((r) => mod.matchesFilter(r)).map((r) => r.n);
    ok(resReset.length === 6, 'resetting filter matches all rooms');

    // 4.7 Tenant isolation: changing venue resets filters and selection
    mod.filter.views.add('Mer');
    mod.selection.select(101);
    mod.selection.setMode(true);
    env.setVenue('vother');
    mod.current(); // Accessing state ensures filter venue isolation
    ok(mod.filter.views.size === 0 && mod.selection.selected.length === 0 && !mod.selection.mode,
      'switching venue automatically resets filters, selections, and selection mode');
  }

  console.log('\n■ 5. Merchant Configuration: Views & Characteristics + Localized Styles');
  {
    const env = boot('vhotel');
    const mod = env.window.KiwiHotelRooms;

    // 5.1 Default views available
    const initialViews = mod.allViews();
    ok(initialViews.includes('Mer') && initialViews.includes('Jardin') && initialViews.includes('Piscine'), 'default views list is populated');

    // 5.2 Add custom view
    const addViewBtn = makeEditor({ '[data-hx-view-input]': 'Vue Palmeraie' });
    await env.handlers['hx-view-add'](addViewBtn);
    const viewsAfterAdd = mod.allViews();
    ok(viewsAfterAdd.includes('Vue Palmeraie'), 'merchant can add custom view « Vue Palmeraie »');

    // Duplicate view rejected
    const dupViewBtn = makeEditor({ '[data-hx-view-input]': 'Vue Palmeraie' });
    await env.handlers['hx-view-add'](dupViewBtn);
    ok(env.toasts[env.toasts.length - 1].type === 'error', 'duplicate view name rejected without a false success');

    // 5.3 Remove custom view
    await env.handlers['hx-view-remove'](null, 'Vue Palmeraie');
    const viewsAfterRemove = mod.allViews();
    ok(!viewsAfterRemove.includes('Vue Palmeraie'), 'merchant can remove custom view');

    // 5.4 Add custom characteristic
    const addCharBtn = makeEditor({ '[data-hx-char-input]': 'Machine Espresso' });
    await env.handlers['hx-char-add'](addCharBtn);
    const charsAfterAdd = mod.allCharacteristics();
    const espressoChar = charsAfterAdd.find((c) => c.label === 'Machine Espresso');
    ok(Boolean(espressoChar) && espressoChar.id.startsWith('custom_'), 'merchant can add custom characteristic with generated ID');

    // Duplicate characteristic rejected
    const dupCharBtn = makeEditor({ '[data-hx-char-input]': 'Machine Espresso' });
    await env.handlers['hx-char-add'](dupCharBtn);
    ok(env.toasts[env.toasts.length - 1].type === 'error', 'duplicate characteristic name rejected without a false success');

    // 5.5 Remove custom characteristic
    await env.handlers['hx-char-remove'](null, espressoChar.id);
    const charsAfterRemove = mod.allCharacteristics();
    ok(!charsAfterRemove.some((c) => c.id === espressoChar.id), 'merchant can remove custom characteristic');

    // 5.6 Responsive and RTL style rules in hotel.css
    ok(styles.includes('[dir="rtl"]'), 'hotel.css defines [dir="rtl"] overrides for Arabic localization');
    ok(styles.includes('@media (max-width: 900px)'), 'hotel.css defines tablet responsive layout rules');
    ok(styles.includes('.hx-views-config-list') && styles.includes('.hx-view-config-chip'), 'hotel.css contains styles for views configuration UI');
  }

  console.log('\n■ 6. Bulk Room Editing: Target Freezing, Storage Failure Rollback, Server 409 & Atomic Execution');
  {
    const env = boot('vhotel');
    const mod = env.window.KiwiHotelRooms;
    const doc = mod.current();
    const f1 = doc.floors[0].id;

    // Create 25 rooms: 101 to 125
    const numList = Array.from({ length: 25 }, (_, i) => 101 + i);
    env.handlers['hx-room-batch-save'](makeEditor({
      '[data-hx-room-numbers]': numList.join(', '),
      '[data-hx-room-type-id]': doc.roomTypes[0].id,
      '[data-hx-room-floor-id]': f1,
    }));

    // Create section « Aile Sud »
    await env.handlers['hx-floor-save'](makeEditor({ '[data-hx-floor-name]': 'Aile Sud' }), 'new');
    const fSud = mod.current().floors.find((f) => f.name === 'Aile Sud').id;

    // 6.1 Selection mode: tapping toggles selection without opening modal
    mod.selection.setMode(true);
    mod.selection.select(101);
    ok(mod.selection.selected.includes(101), 'tapping room in selection mode selects it');
    mod.selection.deselect(101);
    ok(!mod.selection.selected.includes(101), 'tapping again deselects it');

    // 6.2 Select exactly 20 rooms: 101 to 120
    const twentyRooms = Array.from({ length: 20 }, (_, i) => 101 + i);
    twentyRooms.forEach((n) => mod.selection.select(n));
    ok(mod.selection.selected.length === 20, 'exactly 20 rooms are selected');

    // 6.3 Review step freezes cuBulkPlan
    const reviewBtn = makeEditor({
      '[data-hx-bulk-floor-id]': fSud,
      '[data-hx-bulk-type-id]': '', // Ne pas modifier
      '[data-hx-bulk-view]': '', // Ne pas modifier
      '[data-hx-bulk-char-mode]': 'add',
    });
    reviewBtn.closest().querySelectorAll = (sel) => {
      if (sel.includes('[data-hx-bulk-char]:checked')) {
        return [{ getAttribute: () => 'ac' }];
      }
      return [];
    };
    env.handlers['hx-bulk-review'](reviewBtn);

    const plan = mod.bulkPlan();
    ok(plan && plan.targets && plan.targets.length === 20, 'review step freezes cuBulkPlan with 20 stable targets');
    ok(plan.operationId && plan.venueId === 'vhotel', 'bulk plan records unique operationId and venueId');
    env.setBulkDocument(mod.current());

    // 6.4 Target freezing against live mutation:
    // Modify live selection while review modal is open (e.g. user or script deselects 101 and selects 125)
    mod.selection.deselect(101);
    mod.selection.select(125);
    ok(!mod.selection.selected.includes(101) && mod.selection.selected.includes(125), 'live selection was mutated while review modal was open');

    // 6.5 Confirm bulk edit executes strictly against frozen targets
    await env.handlers['hx-bulk-confirm'](makeEditor({}));

    const bulkRequest = env.bulkRequests[env.bulkRequests.length - 1];
    ok(bulkRequest && bulkRequest.merchant === 'slug-vhotel' && bulkRequest.operationId === plan.operationId,
      'confirm sends the canonical merchant and stable operationId to rooms-bulk');
    ok(bulkRequest.targets.length === 20 && bulkRequest.targets.every((target) => target.id && Number.isFinite(target.n) && 'expectedUpdatedAt' in target),
      'confirm sends stable room IDs with expectedUpdatedAt, while the public selection API remains numeric');
    const replay = await env.replayLastBulk();
    const replayBody = await replay.json();
    ok(replay.ok && replayBody.operation?.id === plan.operationId && replayBody.data,
      'replaying the same operationId returns the acknowledged operation instead of applying it twice');

    const postBulkDoc = mod.current();
    const movedRooms = postBulkDoc.rooms.filter((r) => r.floorId === fSud).map((r) => r.n).sort((a, b) => a - b);
    const unmovedRooms = postBulkDoc.rooms.filter((r) => r.floorId === f1).map((r) => r.n).sort((a, b) => a - b);

    ok(movedRooms.length === 20 && movedRooms.includes(101) && !movedRooms.includes(125),
      'confirm executed strictly against frozen plan.targets (room 101 moved, room 125 untouched)');
    ok(unmovedRooms.length === 5 && unmovedRooms[0] === 121 && unmovedRooms[4] === 125,
      'the 5 unselected rooms remained in their original section');
    ok(postBulkDoc.rooms.filter((r) => r.floorId === fSud).every((r) => (r.characteristics || []).includes('ac')),
      'characteristics were safely added across all 20 rooms in bulk');

    // 6.6 Durable audit log recorded with actor and before/after values
    ok(Array.isArray(postBulkDoc.roomAudits) && postBulkDoc.roomAudits.length > 0, 'bulk modification recorded an audit log entry');
    const lastAudit = postBulkDoc.roomAudits[postBulkDoc.roomAudits.length - 1];
    ok(lastAudit.roomNumbers.length === 20 && lastAudit.action === 'bulk_edit', 'audit records affected room count and action type');
    ok(lastAudit.actor && lastAudit.actor.name === 'Nadia Alaoui' && lastAudit.actor.role === 'reception', 'audit captures verified acting staff identity');
    ok(Array.isArray(lastAudit.before) && lastAudit.before.length === 20, 'audit preserves before-values for each room');

    // 6.7 Selection cleared and selection mode exited upon success
    ok(mod.selection.selected.length === 0 && !mod.selection.mode, 'selection mode exited and selection cleared after successful save');

    // 6.8 Local storage failure rollback during bulk edit
    mod.selection.select(121);
    mod.selection.select(122);
    env.handlers['hx-bulk-review'](makeEditor({
      '[data-hx-bulk-floor-id]': fSud,
      '[data-hx-bulk-type-id]': '',
      '[data-hx-bulk-view]': '',
      '[data-hx-bulk-char-mode]': 'none',
    }));
    env.setStorageFails(true);
    await env.handlers['hx-bulk-confirm'](makeEditor({}));
    env.setStorageFails(false);

    const docAfterStorageFail = mod.current();
    ok(docAfterStorageFail.rooms.find((r) => r.n === 121).floorId === f1, 'in-memory state rolled back when localStorage fails during bulk edit');
    ok(mod.selection.selected.includes(121) && mod.selection.selected.includes(122), 'selection preserved for retry when localStorage fails');
    ok(env.toasts[env.toasts.length - 1].type === 'error', 'error toast presented on localStorage failure');

    // 6.9 Server 409 conflict keeps the local plan available for review.
    // Fresh review for room 122 and 123
    mod.selection.clear();
    mod.selection.select(122);
    mod.selection.select(123);
    env.handlers['hx-bulk-review'](makeEditor({
      '[data-hx-bulk-floor-id]': fSud,
      '[data-hx-bulk-type-id]': '',
      '[data-hx-bulk-view]': '',
      '[data-hx-bulk-char-mode]': 'none',
    }));
    // Mock server returning 409 conflict
    env.setMockPush(async () => ({ ok: false, status: 409, error: 'room-conflict' }));
    await env.handlers['hx-bulk-confirm'](makeEditor({}));
    env.setMockPush(null);

    const docAfter409 = mod.current();
    ok(docAfter409.rooms.find((r) => r.n === 122).floorId === f1, 'state rolled back on server 409 conflict');
    ok(mod.selection.selected.includes(122) && mod.selection.selected.includes(123), 'selection preserved on server 409 conflict');
    ok(env.toasts[env.toasts.length - 1].type === 'error' && env.toasts[env.toasts.length - 1].desc.includes('Conflit serveur'), 'server conflict is surfaced without a false success');

    // 6.10 A 409 persists a needs-review draft; Return + a fresh review is required.
    const conflictDraft = JSON.parse(env.data.get('kiwi:hotel-bulk-draft:v1:vhotel'));
    ok(conflictDraft && conflictDraft.needsReview === true && conflictDraft.submitted === false,
      'server conflict persists the original operation as a needs-review draft');
    const requestsBeforeBlockedRetry = env.bulkRequests.length;
    await env.handlers['hx-bulk-confirm'](makeEditor({}));
    ok(env.bulkRequests.length === requestsBeforeBlockedRetry,
      'confirmation is blocked while the stale review is marked needsReview');

    const oldConflictOperation = mod.bulkPlan().operationId;
    env.handlers['hx-bulk-back']();
    env.handlers['hx-bulk-review'](makeEditor({
      '[data-hx-bulk-floor-id]': fSud,
      '[data-hx-bulk-type-id]': '',
      '[data-hx-bulk-view]': '',
      '[data-hx-bulk-char-mode]': 'none',
    }));
    const freshPlan = mod.bulkPlan();
    ok(freshPlan.operationId !== oldConflictOperation && !freshPlan.needsReview,
      'Return followed by a new review creates a fresh confirmable operation');
    await env.handlers['hx-bulk-confirm'](makeEditor({}));
    ok(mod.selection.selected.length === 0 && !env.data.has('kiwi:hotel-bulk-draft:v1:vhotel'),
      'freshly reviewed conflict is acknowledged and clears the durable draft');

    // 6.11 A non-conflict failed response is not an offline success.
    mod.selection.clear();
    mod.selection.select(124);
    env.handlers['hx-bulk-review'](makeEditor({
      '[data-hx-bulk-floor-id]': fSud,
      '[data-hx-bulk-type-id]': '',
      '[data-hx-bulk-view]': '',
      '[data-hx-bulk-char-mode]': 'none',
    }));
    env.setMockPush(async () => ({ ok: false, status: 503, error: 'temporarily-unavailable' }));
    await env.handlers['hx-bulk-confirm'](makeEditor({}));
    env.setMockPush(null);
    ok(mod.selection.selected.includes(124), 'selection remains available after an unconfirmed server failure');
    ok(env.toasts[env.toasts.length - 1].type === 'error' && env.toasts[env.toasts.length - 1].title.includes('non confirmé'),
      'failed rooms-bulk response is surfaced as an error, not a false offline success');

    // 6.11 An unknown failed response survives reload and resumes with the same operation ID.
    mod.selection.select(125);
    env.handlers['hx-bulk-review'](makeEditor({
      '[data-hx-bulk-floor-id]': fSud,
      '[data-hx-bulk-type-id]': '',
      '[data-hx-bulk-view]': '',
      '[data-hx-bulk-char-mode]': 'none',
    }));
    const resumeOperationId = mod.bulkPlan().operationId;
    env.setMockPush(async () => ({ ok: false, status: 503, error: 'temporarily-unavailable' }));
    await env.handlers['hx-bulk-confirm'](makeEditor({}));
    env.setMockPush(null);
    const reloaded = boot('vhotel', env.data);
    const reloadedMod = reloaded.window.KiwiHotelRooms;
    reloaded.setBulkDocument(reloadedMod.current());
    reloaded.handlers['hx-bulk-resume']();
    ok(reloadedMod.bulkPlan()?.operationId === resumeOperationId && reloadedMod.selection.selected.includes(125),
      'a failed operation reloads with the same operation ID and stable selected room ID');
    await reloaded.handlers['hx-bulk-confirm'](makeEditor({}));
    ok(!reloaded.data.has('kiwi:hotel-bulk-draft:v1:vhotel') && reloadedMod.selection.selected.length === 0,
      'resumed operation clears its draft only after acknowledgement');
  }

  console.log(`\n${failures ? '✗' : '✓'} Hotel room plan comprehensive test suite: ${failures} failure(s).`);
  process.exit(failures ? 1 : 0);
}

runAllTests().catch((err) => {
  console.error('Test runner fatal error:', err);
  process.exit(1);
});
