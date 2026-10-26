/* Team edit provenance is saved beside, never inside, payroll cells or codes. */
(function (root) {
  'use strict';
  const snapshots = new WeakMap();
  function doc(state, venue) {
    return { members:state.byVenue[venue] || [], hours:state.hoursByVenue[venue] || {}, shifts:state.shiftsByVenue[venue] || {}, planning:state.planningByVenue[venue] || {}, fieldEdits:(state.mergeByVenue || {})[venue] };
  }
  function remember(state, venue) {
    let map = snapshots.get(state);
    if (!map) { map = new Map(); snapshots.set(state, map); }
    map.set(venue, JSON.parse(JSON.stringify(doc(state, venue))));
  }
  function stamp(state, venue) {
    const previous = snapshots.get(state)?.get(venue) || {};
    const next = root.KiwiFieldMerge.stamp(doc(state, venue), previous);
    (state.mergeByVenue || (state.mergeByVenue = {}))[venue] = next.fieldEdits;
    remember(state, venue);
  }
  function merge(a, b, removed, fillCodes) {
    const out = root.KiwiFieldMerge.merge(a, b);
    const gone = new Set(removed.map(r => r.id));
    out.removed = removed;
    out.members = (out.members || []).filter(m => !gone.has(m.id));
    if (fillCodes) out.members = fillCodes(fillCodes(out.members, b.members || []), a.members || []);
    const alive = new Set(out.members.map(m => m.id));
    ['hours','shifts'].forEach(k => { out[k] = out[k] || {}; Object.keys(out[k]).forEach(id => { if (!alive.has(id)) delete out[k][id]; }); });
    out.planning = root.KiwiPlanningCore?.normalize(out.planning, out.members) || out.planning || {};
    root.KiwiFieldMerge.notice(out);
    return out;
  }
  function notice(doc) { root.KiwiFieldMerge?.notice(doc); }
  /* Team-internal part: handed to team.js on the Kiwi namespace, like
     Kiwi.__teamProfileCore, instead of a new window global. */
  if (root.Kiwi) Object.defineProperty(root.Kiwi, '__teamMerge', { value: Object.freeze({ remember, stamp, merge, notice }), configurable: true });
})(window);
