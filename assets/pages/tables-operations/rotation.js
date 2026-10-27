
function pdsRotationKey(period, now) {
  now = now == null ? Date.now() : now;
  const start = new Date(pdsBusinessDayStart(now));
  const day = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`;
  if (period === 'daily') return day;
  if (period === 'weekly') {
    const d = new Date(Date.UTC(start.getFullYear(), start.getMonth(), start.getDate()));
    const wd = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - wd);
    const y0 = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return `${d.getUTCFullYear()}-W${String(Math.ceil(((d - y0) / 86400000 + 1) / 7)).padStart(2, '0')}`;
  }
  const h = new Date(now).getHours();
  return day + ((h >= 16 || h < 5) ? '-soir' : '-midi');
}

function pdsRotateStep(state, tables, strategy, pairs) {
  const ids = state.staff.map(x => x.id);
  const ordered = pdsTablesInOrder(state, tables);
  const next = {};
  ordered.forEach(t => { next[t.id] = pdsServerIds(t); });
  if (ids.length < 2 && strategy !== 'pairs') return next;
  if (strategy === 'pairs') {
    const swap = {};
    (pairs || []).forEach(p => { if (p && p[0] && p[1] && p[0] !== p[1]) { swap[p[0]] = p[1]; swap[p[1]] = p[0]; } });
    ordered.forEach(t => { next[t.id] = pdsServerIds(t).map(id => swap[id] || id); });
    return next;
  }
  if (strategy === 'tables') {
    ordered.forEach((t, i) => {
      const cur = pdsServerIds(t)[0];
      const at = ids.indexOf(cur);
      next[t.id] = [ids[at >= 0 ? (at + 1) % ids.length : i % ids.length]];
    });
    return next;
  }
  /* zones: the room is a ring of seats, one per server, each zone holding
     seats in proportion to its tables (12 in the salle, 5 at the bar: the
     salle needs more hands). Servers sit on the ring in their current
     order, and every rotation moves everyone the same number of seats, a
     step coprime with the head count, so over a full cycle each server
     passes through every zone for its share of the time. Inside a zone
     each server takes a run of neighbouring tables, not every third one.
     With more zones than servers, an unstaffed zone goes to whoever holds
     the fewest tables. */
  const zones = state.zones.filter(z => ordered.some(t => t.zone === z.id)).map(z => z.id);
  if (!zones.length) return next;
  const n = ids.length;
  const nOf = {};
  zones.forEach(z => { nOf[z] = ordered.filter(t => t.zone === z).length; });
  const floor = n >= zones.length ? 1 : 0;
  const target = {};
  zones.forEach(z => { target[z] = Math.max(floor, Math.round(nOf[z] / ordered.length * n)); });
  const ratio = (z) => nOf[z] / Math.max(target[z], 0.0001);
  let sum = zones.reduce((a, z) => a + target[z], 0);
  while (sum > n) {
    const z = zones.filter(x => target[x] > floor).sort((a, b) => ratio(a) - ratio(b))[0];
    if (!z) break;
    target[z] -= 1; sum -= 1;
  }
  while (sum < n) {
    const z = zones.slice().sort((a, b) => ratio(b) - ratio(a))[0];
    target[z] += 1; sum += 1;
  }
  const slots = [];
  zones.forEach(z => { for (let k = 0; k < target[z]; k++) slots.push(z); });
  /* Where each server sits now: their zone, then their first table. */
  const home = pdsHomeZones(state, ordered);
  const firstAt = {};
  ordered.forEach((t, i) => pdsServerIds(t).forEach(id => { if (firstAt[id] == null) firstAt[id] = i; }));
  const ring = ids.slice().sort((a, b) => {
    const za = zones.indexOf(home[a]), zb = zones.indexOf(home[b]);
    return (za < 0 ? 1e6 : za) - (zb < 0 ? 1e6 : zb) || (firstAt[a] ?? 1e6) - (firstAt[b] ?? 1e6) || ids.indexOf(a) - ids.indexOf(b);
  });
  const gcd = (a, b) => (b ? gcd(b, a % b) : a);
  let step = Math.max(1, Math.ceil(n / zones.length));
  while (n > 1 && gcd(step, n) !== 1) step += 1;
  const onZone = {};
  zones.forEach(z => { onZone[z] = []; });
  const seated = new Array(slots.length);
  ring.forEach((sid, p) => { if (slots.length) seated[(p + step) % slots.length] = sid; });
  seated.forEach((sid, k) => { if (sid != null) onZone[slots[k]].push(sid); });
  const load = {};
  ids.forEach(id => { load[id] = 0; });
  zones.forEach(z => {
    const ts = ordered.filter(t => t.zone === z);
    const crew = onZone[z];
    ts.forEach((t, i) => {
      const sid = crew.length
        ? crew[Math.min(crew.length - 1, Math.floor(i * crew.length / ts.length))]
        : ids.slice().sort((a, b) => load[a] - load[b])[0];
      load[sid] += 1;
      next[t.id] = [sid];
    });
  });
  return next;
}

function pdsFairness(state) {
  const fair = {};
  const history = (state.history || []).filter(h => h && h.at);
  if (history.length < 2) return null;
  const zoneIds = state.zones.filter(z => state.tables.some(t => t.zone === z.id)).map(z => z.id);
  state.staff.forEach(sv => {
    const count = {};
    history.forEach(h => { const z = h.servers && h.servers[sv.id]; if (z) count[z] = (count[z] || 0) + 1; });
    const seen = Object.keys(count).length;
    const total = Object.values(count).reduce((a, b) => a + b, 0);
    if (!total) { fair[sv.id] = null; return; }
    const uniqueRatio = zoneIds.length ? Math.min(1, seen / Math.min(zoneIds.length, total)) : 1;
    const maxRatio = Math.max(...Object.values(count)) / total;
    const score = Math.max(0, Math.min(100, Math.round(uniqueRatio * 70 + (1 - maxRatio) * 30)));
    let hot = null;
    Object.entries(count).forEach(([z, c]) => { if (total >= 3 && c / total >= 0.6) hot = z; });
    fair[sv.id] = { score, hot };
  });
  return fair;
}

function pdsRenderRotateStage(state, T) {
  const rot = state.rotation || { period: 'shift', strategy: 'zones' };
  const zoneName = (id) => (state.zones.find(z => z.id === id) || {}).name || '·';
  const strategyLabel = rot.strategy === 'zones' ? T.rotZones : rot.strategy === 'tables' ? T.rotTables : T.rotPairs;
  const enough = rot.strategy === 'pairs' ? (rot.pairs || []).length > 0 : state.staff.length >= 2;
  const preview = enough ? pdsRotationPreview(state, 3) : [];
  const fairness = pdsFairness(state);
  const history = (state.history || []).filter(h => h && h.at).slice(-7);
  const autoTxt = rot.auto
    ? T.rotateAuto(rot.period === 'daily' ? T.rotateAutoDaily : rot.period === 'weekly' ? T.rotateAutoWeekly : T.rotateAutoShift)
    : T.rotateOff;
  const fmt = (ts) => { const d = new Date(ts); return `${d.toLocaleDateString(trLang() === 'ar' ? 'ar-MA' : trLang() === 'en' ? 'en-GB' : 'fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })} ${pdsClock(ts)}`; };
  const zoneTag = (z) => 'abcdefgh'.charAt(Math.max(0, state.zones.findIndex(x => x.id === z)) % 8) || 'd';
  return `
    <div class="pds-rotate">
      <div class="pds-rotate-grid">
        <div class="pds-rail-card">
          <div class="pds-rail-title">${T.rotateTitle}</div>
          <div class="pds-rail-hint">${pdsEsc(T.rotateDesc)}</div>
          <div class="pds-rot-meta">
            <div><span class="pds-rot-lbl">${T.rotatePeriod}</span><span class="pds-rot-val">${pdsEsc(pdsPeriodLabel(T, rot.period))}</span></div>
            <div><span class="pds-rot-lbl">${T.rotateStrategy}</span><span class="pds-rot-val">${pdsEsc(strategyLabel)}</span></div>
          </div>
          <p class="pds-rot-auto${rot.auto ? ' on' : ''}">${pdsEsc(autoTxt)}</p>
          <p class="pds-rail-hint">${pdsEsc(rot.lastAt ? T.rotateLast(fmt(rot.lastAt)) : T.rotateNever)}</p>
          <div class="pds-rot-actions">
            <button class="kb atlas" data-pds-action="rotate-configure">${T.rotateCTA}</button>
            <button class="kb ghost" data-pds-action="rotate-now"${enough ? '' : ' disabled'}>${T.rotNow}</button>
          </div>
          ${enough ? '' : `<p class="pds-rail-hint">${pdsEsc(rot.strategy === 'pairs' ? T.rotPairsNone : T.rotNeedStaff)}</p>`}
        </div>
        <div class="pds-rail-card">
          <div class="pds-rail-title">${T.rotPreview}</div>
          <div class="pds-rail-hint">${pdsEsc(rot.strategy === 'zones' ? T.rotZonesDesc : rot.strategy === 'tables' ? T.rotTablesDesc : T.rotPairsDesc)}</div>
          <div class="pds-rot-preview">
            ${preview.map((step, idx) => `
              <div class="pds-rot-step">
                <div class="pds-rot-step-h">+${idx + 1}</div>
                ${state.staff.slice(0, 8).map(sv => `<div class="pds-rot-line" style="--chip:${pdsEsc(sv.color)};">
                    <span class="pds-asum-dot"></span>
                    <b>${pdsEsc(String(sv.name).split(' ')[0])}</b>
                    <em>${pdsEsc(rot.strategy === 'zones' ? zoneName(step.home[sv.id]) : (step.tablesOf[sv.id] || []).slice(0, 4).join(' · ') || '·')}</em>
                  </div>`).join('')}
              </div>`).join('')}
          </div>
        </div>
        <div class="pds-rail-card">
          <div class="pds-rail-title">${T.rotFairness}</div>
          ${fairness ? `
          <div class="pds-rail-hint">${T.rotHistoryHint}</div>
          <div class="pds-fair">
            ${state.staff.slice(0, 8).map(sv => {
              const f = fairness[sv.id];
              if (!f) return '';
              const cls = f.score >= 70 ? 'high' : f.score >= 50 ? 'mid' : 'low';
              return `
                <div class="pds-fair-row" style="--chip:${pdsEsc(sv.color)};">
                  <span class="pds-asum-dot"></span>
                  <span class="pds-fair-name">${pdsEsc(String(sv.name).split(' ')[0])}</span>
                  <span class="pds-fair-bar"><i class="pds-fair-${cls}" style="width:${f.score}%;"></i></span>
                  <span class="pds-fair-pct">${f.score}%</span>
                </div>
                <div class="pds-fair-note">${f.hot ? `<b>${pdsEsc(zoneName(f.hot))}</b> · ${T.fairnessLow}` : T.fairnessHigh}</div>`;
            }).join('')}
          </div>` : `<p class="pds-rail-hint">${pdsEsc(T.fairnessEmpty)}</p>`}
        </div>
      </div>
      <div class="pds-rail-card pds-rot-history">
        <div class="pds-rail-title">${T.rotHistoryTitle}</div>
        ${history.length ? `
        <div class="pds-history-grid" style="--cols:${history.length};">
          <div class="pds-hist-h">
            <span></span>
            ${history.map(h => `<span title="${pdsEsc(fmt(h.at))}">${pdsEsc(new Date(h.at).toLocaleDateString(trLang() === 'ar' ? 'ar-MA' : trLang() === 'en' ? 'en-GB' : 'fr-FR', { weekday: 'short' }))}</span>`).join('')}
          </div>
          ${state.staff.slice(0, 8).map(sv => `
            <div class="pds-hist-row" style="--chip:${pdsEsc(sv.color)};">
              <span class="pds-hist-name"><span class="pds-asum-dot"></span>${pdsEsc(String(sv.name).split(' ')[0])}</span>
              ${history.map(h => {
                const z = h.servers && h.servers[sv.id];
                const zname = z ? zoneName(z) : '·';
                return `<span class="pds-hist-cell pds-hist-${z ? zoneTag(z) : 'd'}" title="${pdsEsc(zname)}">${pdsEsc(zname.slice(0, 1))}</span>`;
              }).join('')}
            </div>`).join('')}
        </div>` : `<p class="pds-rail-hint">${pdsEsc(T.rotHistoryEmpty)}</p>`}
      </div>
    </div>
  `;
}

function pdsRenderActions(state, T) {
  const nv = pdsVersions(state).length;
  const dups = pdsDuplicateNums(state).length;
  return `
    <button class="kb ghost pds-act" data-pds-action="versions">${pdsEsc(T.versions)}${nv ? ` <span class="pds-count">${nv}</span>` : ''}</button>
    <details class="pds-more" data-pds-more>
      <summary class="kb ghost pds-act" aria-label="${pdsEsc(T.more)}">${pdsEsc(T.more)}${dups ? '<i class="pds-more-dot" aria-hidden="true"></i>' : ''}</summary>
      <div class="pds-more-pop" role="menu">
        <button role="menuitem" data-pds-action="renumber">${pdsEsc(T.renumber)}${dups ? `<em>${pdsEsc(T.dupShort(dups))}</em>` : ''}</button>
        <button role="menuitem" data-pds-action="open-wizard">${pdsEsc(T.wizTitle)}</button>
        <button role="menuitem" data-pds-action="scan-salle">${pdsEsc(T.scanSalle)}</button>
        <button role="menuitem" class="is-danger" data-pds-action="reset">${pdsEsc(T.reset)}</button>
      </div>
    </details>
    <button data-activation=money class="kb primary pds-act" data-pds-action="export">${pdsEsc(T.export)}</button>`;
}
