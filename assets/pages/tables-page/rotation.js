
/* ─── Rotation ─────────────────────────────────────────────────────────────
 *   It used to promise « servers notified » and a schedule, and did neither:
 *   the period was stored and never read, « par paires » was the same
 *   round-robin as « par tables », and the fairness bars were drawn from a
 *   seeded demo week. Now:
 *     · pdsRotateStep computes one real step for each strategy;
 *     · pdsAutoRotate applies it once per service / day / week, the first
 *       time the plan opens in that period, on any device;
 *     · history only grows from rotations that actually happened. */
function pdsRotationKey() { return tableOperations().pdsRotationKey.apply(this, arguments); }
function pdsTablesInOrder(state, tables) {
  const zi = (z) => state.zones.findIndex(x => x.id === z);
  return (tables || state.tables).slice().sort((a, b) =>
    (zi(a.zone) - zi(b.zone)) || String(a.num).localeCompare(String(b.num), undefined, { numeric: true }));
}
/* The zone a server mostly works in, from the tables they hold. */
function pdsHomeZones(state, tables) {
  const out = {};
  state.staff.forEach(sv => {
    const count = {};
    tables.forEach(t => { if (pdsServerIds(t).includes(sv.id)) count[t.zone] = (count[t.zone] || 0) + 1; });
    let best = null, n = 0;
    Object.keys(count).forEach(z => { if (count[z] > n) { n = count[z]; best = z; } });
    out[sv.id] = best;
  });
  return out;
}
/* One rotation step, on a COPY of the tables. Returns {tableId: [serverIds]}. */
function pdsRotateStep() { return tableOperations().pdsRotateStep.apply(this, arguments); }
function pdsApplyAssignment(state, map) {
  state.tables.forEach(t => { if (map[t.id]) pdsSetServerIds(t, map[t.id]); });
}
function pdsRecordRotation(state, key) {
  const home = pdsHomeZones(state, state.tables);
  state.history = (state.history || []).filter(h => h && h.at);   /* drop the seeded demo week */
  state.history.push({ at: Date.now(), key: key || '', servers: home });
  if (state.history.length > 14) state.history = state.history.slice(-14);
}
function pdsAutoRotate(state) {
  const r = state && state.rotation;
  if (!r || !r.enabled || !r.auto) return false;
  if (r.strategy !== 'pairs' && state.staff.length < 2) return false;
  const key = pdsRotationKey(r.period);
  if (!r.lastKey) { r.lastKey = key; return true; }   /* arm, never rotate on the day it is switched on */
  if (r.lastKey === key) return false;
  pdsApplyAssignment(state, pdsRotateStep(state, state.tables, r.strategy, r.pairs));
  pdsRecordRotation(state, key);
  r.lastKey = key; r.lastAt = Date.now();
  state._autoRotated = true;
  return true;
}
function pdsRotationPreview(state, count) {
  const r = state.rotation || {};
  let tables = JSON.parse(JSON.stringify(state.tables));
  const steps = [];
  for (let i = 0; i < count; i++) {
    const map = pdsRotateStep(state, tables, r.strategy, r.pairs);
    tables.forEach(t => pdsSetServerIds(t, map[t.id] || []));
    const home = pdsHomeZones(state, tables);
    const tablesOf = {};
    state.staff.forEach(sv => { tablesOf[sv.id] = pdsTablesInOrder(state, tables).filter(t => pdsServerIds(t).includes(sv.id)).map(pdsTableNum); });
    steps.push({ home, tablesOf });
  }
  return steps;
}
/* Fairness: of the zones a server could work, how many did they actually
   see over the recorded rotations, and did one zone hog their week. Needs
   real history — two rotations at least — or it says so. */
function pdsFairness() { return tableOperations().pdsFairness.apply(this, arguments); }
function pdsPeriodLabel(T, period) {
  return period === 'daily' ? T.rotateDaily : period === 'weekly' ? T.rotateWeekly : T.rotateShift;
}
function pdsRenderRotateStage() { return tableOperations().pdsRenderRotateStage.apply(this, arguments); }

/* What the old footer bar carried, in the page's own toolbar: Versions and
   Exporter in reach, the rarer tools (renuméroter, assistant, scan, réinitia-
   liser) behind Plus. Autosave needs no button and no banner. */
function pdsRenderActions() { return tableOperations().pdsRenderActions.apply(this, arguments); }

/* The page head's context line, split on « · » into the same dotted spans
   appPage() draws, and only rewritten when the words change (the live room
   repaints every eight seconds). */
function pdsSetSubtitle(root, text) {
  const p = root.querySelector('.genpage-head p');
  if (!p || p.getAttribute('data-pds-sub') === text) return;
  p.setAttribute('data-pds-sub', text);
  p.textContent = '';
  String(text).split(' · ').forEach((seg, i) => {
    if (i) { const d = document.createElement('i'); d.className = 'dot'; d.setAttribute('aria-hidden', 'true'); p.appendChild(d); }
    const sp = document.createElement('span'); sp.className = 'seg'; sp.textContent = seg; p.appendChild(sp);
  });
}

/* ═══ INTERACTIVITY ═════════════════════════════════════════════════ */
/* Keep keyboard focus on the equivalent control when a panel is repainted. */
function pdsRememberFocus(root) {
  const el = document.activeElement;
  if (!el || !root.contains(el)) return () => {};
  const attrs = [...el.attributes].filter(a => /^(data-pds-|data-pdsp-|name$|type$)/.test(a.name) && !/wired|sig/.test(a.name));
  const sel = el.tagName + attrs.map(a => `[${a.name}="${CSS.escape(a.value)}"]`).join('');
  const i = [...root.querySelectorAll(sel)].indexOf(el);
  return () => { if (!el.isConnected) root.querySelectorAll(sel)[i]?.focus(); };
}
