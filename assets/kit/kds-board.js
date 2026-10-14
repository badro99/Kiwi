/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · assets/kit/kds-board.js · the kitchen board on the 2027 lanes
 * (spec §10.28, §13.6, §18.7; stage 3b). Loaded only when the kitchen's flag
 * is on (kiwiSkin2027:kds, or ?skin=2027 for one load); with it off
 * kiwi-cuisine.html keeps its shipped cards.
 *
 *   KiwiKdsBoard.mount(api)     puts a <k-lane> in each of the three columns
 *     api.stacks                { new, cook, pass }: the shipped column bodies
 *     api.act(action, id, value) start | ready | served | recall |
 *                               void-accept | void-reject | recipe (value.item)
 *     api.columns, api.fit      per lane ({ new, cook, pass }): 'auto' and
 *                               none by default; fit 'none' on a host that
 *                               scrolls (the till)
 *     api.surface               false: keep the host's root (the till)
 *   KiwiKdsBoard.paint(view)    { new, cook, pass }: tickets in <k-lane>'s
 *                               shape, oldest first; view.empty, when set, is
 *                               the line every empty lane shows (loading,
 *                               offline)
 *   KiwiKdsBoard.retime(minutes)  minutes(id) → the ticket's age, moved in
 *                               place every second without a rebuild
 *
 * The host keeps every decision: the queue, the stations, the optimistic
 * bumps and their retry file, the void protocol. This file only draws what
 * the host already decided, and hands each tap back to it by name.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';
  var K = root.KiwiKit;
  if (!K || !root.customElements || !root.customElements.get('k-lane')) return;
  var doc = root.document;
  var t = function (k, a) { return String(K.t(k, a)).replace(/[⁦-⁩]/g, ''); };

  var LANES = { 'new': 'new', cook: 'preparing', pass: 'ready' };
  var api = null, lanes = {}, view = { 'new': [], cook: [], pass: [] };
  var sheet = null, sheetLane = null, sheetFrom = null;

  function onAction(e) {
    var d = e.detail || {};
    if (d.action === 'k.lane.newer') { openNewer(e.currentTarget); return; }
    if (d.action !== 'k.lane.action' || !d.id || !d.value) return;
    if (sheet && e.currentTarget === sheetLane) closeNewer();
    if (api && typeof api.act === 'function') api.act(d.value.action, d.id, d.value);
  }

  function mount(a) {
    api = a || {};
    var stacks = api.stacks || {};
    Object.keys(LANES).forEach(function (k) {
      var box = stacks[k];
      if (!box) return;
      var lane = lanes[k];
      if (!lane) {
        lane = lanes[k] = doc.createElement('k-lane');
        lane.setAttribute('lane', LANES[k]);
        lane.setAttribute('columns', (api.columns && api.columns[k]) || 'auto');
        if (api.fit && api.fit[k]) lane.setAttribute('fit', api.fit[k]);
        lane.addEventListener('kiwi:action', onAction);
      }
      box.textContent = '';
      box.classList.add('k-kds-stack');
      box.appendChild(lane);
    });
    /* The kitchen's own root (§13.6), never inside the till (§6.2). */
    if (api.surface !== false) doc.documentElement.setAttribute('data-k-surface', 'kds');
    return !!(lanes['new'] && lanes.cook && lanes.pass);
  }

  /* A lane is given a new list only when what it draws changed, so a tick of
     the host's poller never rebuilds a ticket under a cook's finger. */
  var sigs = {};
  function paint(v) {
    view = v || view;
    Object.keys(LANES).forEach(function (k) {
      var lane = lanes[k];
      if (!lane) return;
      var list = view[k] || [];
      var empty = view.empty || '';
      var sig = JSON.stringify([empty, list]);
      if (sigs[k] === sig) return;
      sigs[k] = sig;
      if (empty) lane.setAttribute('empty', empty); else lane.removeAttribute('empty');
      lane.tickets = list.map(function (tk) { return Object.assign({}, tk); });
    });
    if (sheet && sheetFrom) refreshNewer();
  }

  function retime(minutes) {
    if (typeof minutes !== 'function') return;
    Object.keys(lanes).forEach(function (k) {
      var lane = lanes[k];
      if (!lane || k === 'pass' || typeof lane.retime !== 'function') return;
      lane.retime((view[k] || []).map(function (tk) { return { id: tk.id, minutes: minutes(tk.id) }; }));
    });
    if (sheetLane && sheetFrom && sheetFrom !== 'pass' && typeof sheetLane.retime === 'function') {
      sheetLane.retime((sheetLane.tickets || []).map(function (tk) { return { id: tk.id, minutes: minutes(tk.id) }; }));
    }
  }

  /* §13.6 step 3: the newer card opens a sheet holding every ticket the wall
     could not fit, drawn full, oldest first. */
  function keyOf(lane) {
    var hit = null;
    Object.keys(lanes).forEach(function (k) { if (lanes[k] === lane) hit = k; });
    return hit;
  }
  function hidden(k) {
    var lane = lanes[k];
    var shown = lane ? parseInt(lane.getAttribute('data-shown') || '0', 10) || 0 : 0;
    return (view[k] || []).slice(shown);
  }
  function openNewer(lane) {
    var k = keyOf(lane);
    if (!k) return;
    sheetFrom = k;
    if (!sheet) {
      sheet = doc.createElement('k-sheet');
      sheet.setAttribute('detent', 'large');
      sheet.addEventListener('kiwi:action', function (e) {
        if (e.detail && e.detail.action === 'k.sheet.close') closeNewer();
      });
      doc.body.appendChild(sheet);
    }
    sheet.setAttribute('heading', t('kds.newer_open'));
    sheet.textContent = '';
    sheetLane = doc.createElement('k-lane');
    sheetLane.setAttribute('lane', LANES[k]);
    sheetLane.setAttribute('fit', 'none');
    sheetLane.addEventListener('kiwi:action', onAction);
    sheet.appendChild(sheetLane);
    refreshNewer();
    sheet.setAttribute('open', '');
  }
  function refreshNewer() {
    var list = hidden(sheetFrom);
    if (!list.length) { closeNewer(); return; }
    sheetLane.tickets = list.map(function (tk) { return Object.assign({}, tk); });
  }
  function closeNewer() {
    var s = sheet;
    sheetFrom = null; sheetLane = null;
    if (s && s.hasAttribute('open')) s.removeAttribute('open');
  }

  root.KiwiKdsBoard = {
    mount: mount, paint: paint, retime: retime,
    lane: function (k) { return lanes[k] || null; },
    isNewerOpen: function () { return !!(sheet && sheet.hasAttribute('open')); }
  };
})(typeof window !== 'undefined' ? window : globalThis);
