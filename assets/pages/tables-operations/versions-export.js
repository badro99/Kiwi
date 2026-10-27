
function pdsRenumber(state, mode) {
  let n = 0, changed = 0;
  /* A zone of a hundred tables or more would run into the next one. */
  const span = state.zones.some(z => state.tables.filter(t => t.zone === z.id).length >= 100) ? 1000 : 100;
  state.zones.forEach((z, zi) => {
    /* Per zone, by hundreds: salle 1, 2…, then 101, 102…, 201… A letter
       (« T1 ») would read as table 1 at the till, and a waiter's keypad
       has no letters anyway. */
    if (mode === 'prefix') n = zi * span;
    pdsReadingOrder(state.tables.filter(t => t.zone === z.id)).forEach(t => {
      n += 1;
      const num = String(n);
      if (String(t.num) !== num) changed += 1;
      t.num = num;
    });
  });
  return changed || state.tables.length;
}

function pdsSaveVersion(state, name) {
  const strip = (t) => { const c = JSON.parse(JSON.stringify(t)); delete c.since; if (PDS_SERVICE_STATUSES.includes(c.status)) c.status = 'free'; return c; };
  const v = {
    id: 'ver' + Math.random().toString(36).slice(2, 8),
    name: String(name || '').slice(0, 60), at: Date.now(),
    zones: JSON.parse(JSON.stringify(state.zones)),
    tables: state.tables.map(strip),
    elements: JSON.parse(JSON.stringify(state.elements || [])),
  };
  const list = pdsVersions(state).concat(v);
  const drop = list.length > PDS_MAX_VERSIONS ? list.slice(0, list.length - PDS_MAX_VERSIONS) : [];
  if (drop.length && typeof pdsBury === 'function') pdsBury(state, drop.map(x => x.id));
  state.versions = list.slice(-PDS_MAX_VERSIONS);
  return v;
}

function pdsOpenVersions(state, T, refresh, selection) {
  const fmt = (ts) => new Date(ts).toLocaleString(trLang() === 'ar' ? 'ar-MA' : trLang() === 'en' ? 'en-GB' : 'fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const body = () => {
    const list = pdsVersions(state).slice().reverse();
    return `
      <div class="pds-versions">
        <div class="pds-version-new">
          <input class="kf-input pds-input" maxlength="60" data-pds-ver-name placeholder="${pdsEsc(T.versionNamePh)}" aria-label="${pdsEsc(T.versionName)}"/>
          <button data-activation=write class="kb atlas" data-pds-ver-save>${pdsEsc(T.versionSave)}</button>
        </div>
        ${list.length ? list.map(v => {
          const covers = (v.tables || []).reduce((n, t) => n + pdsGeom(t).seats, 0);
          return `<div class="pds-version" data-pds-ver="${pdsEsc(v.id)}">
            <div><b>${pdsEsc(v.name)}</b><em>${pdsEsc(fmt(v.at))} · ${pdsEsc(T.versionMeta((v.tables || []).length, covers))}</em></div>
            <button class="kb ghost" data-pds-ver-apply>${pdsEsc(T.versionApply)}</button>
            <button data-activation=write class="kb ghost pds-rail-danger" data-pds-ver-del>${pdsEsc(T.versionDelete)}</button>
          </div>`;
        }).join('') : `<p class="pds-rail-hint">${pdsEsc(T.versionEmpty)}</p>`}
      </div>`;
  };
  const m = Kiwi.modal({ tag: T.tagPdS, title: T.versionsTitle, desc: T.versionsDesc, width: 560, body: body(),
    foot: `<button class="kb ghost" data-dismiss>${T.close}</button>` });
  wireDismiss(m);
  if (!m || !m.el) return;
  const wire = () => {
    const host = m.el.querySelector('.pds-versions');
    host.querySelector('[data-pds-ver-save]').onclick = () => {
      const input = host.querySelector('[data-pds-ver-name]');
      const name = String(input.value || '').trim();
      if (!name) { input.focus(); return; }
      pdsSaveVersion(state, name);
      refresh();
      host.outerHTML = body(); wire();
      Kiwi.toast(T.versionSaved(name), { type: 'success' });
    };
    host.querySelectorAll('[data-pds-ver]').forEach(row => {
      const v = pdsVersions(state).find(x => x.id === row.getAttribute('data-pds-ver'));
      row.querySelector('[data-pds-ver-apply]').onclick = () => {
        if (!v) return;
        pdsPush(state);
        pdsApplyVersion(state, v, T);
        selection.clear();
        refresh();
        m.close();
        Kiwi.toast(T.versionApplied(v.name), { type: 'success', desc: T.versionAppliedDesc });
      };
      row.querySelector('[data-pds-ver-del]').onclick = () => {
        if (!v) return;
        if (typeof pdsBury === 'function') pdsBury(state, v.id);
        state.versions = pdsVersions(state);
        refresh();
        m.el.querySelector('.pds-versions').outerHTML = body(); wire();
      };
    });
  };
  wire();
}

function pdsPlaceBooking(state, booking, table) {
  try {
    const R = window.KiwiReservations, L = window.KiwiFloorLive;
    const doc = R.get();
    const b = (doc.bookings || []).find(x => x.id === booking.id);
    if (!b) return false;
    const rid = L.resourceTableId(table.id);
    let res = (doc.resources || []).find(r => r.id === rid);
    const now = Date.now();
    if (!res) {
      res = { id: rid, name: 'Table ' + pdsTableNum(table), kind: 'table', capacity: pdsGeom(table).seats || 2, active: true, week: null, updatedAt: now };
      doc.resources = (doc.resources || []).concat(res);
      /* The booking's service must accept this table, or validation would
         reject the placement later. */
      const svc = (doc.services || []).find(x => x.id === b.serviceId);
      if (svc && Array.isArray(svc.resourceIds) && svc.resourceIds.length && !svc.resourceIds.includes(rid)) {
        svc.resourceIds = svc.resourceIds.concat(rid); svc.updatedAt = now;
      }
    }
    b.resourceId = rid;
    b.updatedAt = now;
    R.set(doc);
    return true;
  } catch (_) { return false; }
}

function pdsExportSvg(state, zone, T) {
  const P = pdsPlane(zone);
  const r = pdsRoom(zone);
  const pad = 40, W = P.w + pad * 2, H = P.h + pad * 2 + 30;
  const staff = new Map(state.staff.map(x => [x.id, x]));
  const els = state.elements.filter(e => e.zone === zone.id).sort((a, b) => (a.z || 0) - (b.z || 0)).map(e => {
    const g = pdsGeom(e);
    const K = PDS_FIX[e.type] || {};
    const label = e.label != null ? e.label : (T['fix' + e.type] || K.label || '');
    return `<g transform="translate(${e.x + pad} ${e.y + pad + 30}) rotate(${e.rot || 0} ${g.w / 2} ${g.h / 2})">
      <rect width="${g.w}" height="${g.h}" rx="4" fill="#EFEBE3" stroke="#B9AF9B" stroke-width="1"/>
      ${label && g.w > 40 ? `<text x="${g.w / 2}" y="${g.h / 2 + 4}" text-anchor="middle" font-size="11" fill="#6B655B">${pdsEsc(label)}</text>` : ''}
    </g>`;
  }).join('');
  const tbls = state.tables.filter(t => t.zone === zone.id).map(t => {
    const g = pdsGeom(t);
    const cx = g.w / 2, cy = g.h / 2;
    const body = g.shape === 'round'
      ? `<ellipse cx="${cx}" cy="${cy}" rx="${cx}" ry="${cy}" fill="#FFFFFF" stroke="#0A0F0D" stroke-width="1.5"/>`
      : `<rect width="${g.w}" height="${g.h}" rx="${Math.min(8, g.w / 5, g.h / 5)}" fill="#FFFFFF" stroke="#0A0F0D" stroke-width="1.5"/>`;
    const svs = pdsServerIds(t).map(id => staff.get(id)).filter(Boolean);
    const dots = svs.map((sv, i) => `<g transform="translate(${g.w - 4 - i * 20} -6)"><circle r="9" fill="${pdsEsc(pdsBadge(sv.color).bg)}"/><text y="3.5" text-anchor="middle" font-size="9" font-weight="600" fill="${pdsBadge(sv.color).ink}">${pdsEsc(pdsInitials(sv.name))}</text></g>`).join('');
    return `<g transform="translate(${t.x + pad} ${t.y + pad + 30}) rotate(${t.rot || 0} ${cx} ${cy})">${body}
      <text x="${cx}" y="${cy + 2}" text-anchor="middle" font-size="${Math.max(11, Math.min(18, g.h / 3))}" font-weight="600" fill="#0A0F0D">${pdsEsc(pdsTableNum(t))}</text>
      <text x="${cx}" y="${cy + 15}" text-anchor="middle" font-size="9" fill="#6B655B">${g.seats}p</text>${dots}</g>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="Inter Tight, Inter, system-ui, sans-serif">
    <rect width="${W}" height="${H}" fill="#F7F5F0"/>
    <text x="${pad}" y="${pad}" font-size="20" font-weight="600" fill="#0A0F0D">${pdsEsc(pdsZoneName(zone))}</text>
    <rect x="${pad}" y="${pad + 30}" width="${P.w}" height="${P.h}" fill="${pdsEsc(r.floor || '#FBF7EE')}" stroke="#2C2520" stroke-width="${Math.max(2, r.wallW || 2)}"/>
    ${els}${tbls}
  </svg>`;
}

function pdsExportPrint(state, T) {
  const v = window.KiwiVenue?.getCurrentVenueData?.() || {};
  const day = new Date().toLocaleDateString(trLang() === 'ar' ? 'ar-MA' : trLang() === 'en' ? 'en-GB' : 'fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  const legend = state.staff.map(sv => {
    const n = state.tables.filter(t => pdsServerIds(t).includes(sv.id)).map(pdsTableNum);
    return n.length ? `<li><i style="background:${pdsEsc(sv.color)}"></i><b>${pdsEsc(sv.name)}</b> · ${pdsEsc(n.join(', '))}</li>` : '';
  }).join('');
  const pages = state.zones.filter(z => state.tables.some(t => t.zone === z.id) || state.elements.some(e => e.zone === z.id)).map(z => `
    <section class="page">
      <header><b>${pdsEsc(v.name || T.title)}</b><span>${pdsEsc(T.title)} · ${pdsEsc(T.exportPrinted(day))}</span></header>
      <div class="plan">${pdsExportSvg(state, z, T)}</div>
      ${legend ? `<footer><b>${pdsEsc(T.exportServers)}</b><ul>${legend}</ul></footer>` : ''}
    </section>`).join('');
  const w = window.open('', '_blank');
  if (!w) { Kiwi.toast(T.exportBlocked, { type: 'warn' }); return; }
  w.document.write(`<!doctype html><html lang="${trLang()}" dir="${trLang() === 'ar' ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><title>${pdsEsc((v.name ? v.name + ' · ' : '') + T.title)}</title>
    <style>
      @page { size: A3 landscape; margin: 12mm; }
      body { margin: 0; background: #F7F5F0; color: #0A0F0D; font: 13px/1.4 "Inter Tight", Inter, system-ui, sans-serif; }
      .page { page-break-after: always; display: flex; flex-direction: column; gap: 10px; padding: 16px; box-sizing: border-box; min-height: 100vh; }
      .page:last-child { page-break-after: auto; }
      header { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 1px solid rgba(10,15,13,.15); padding-bottom: 8px; }
      header b { font-size: 18px; font-weight: 600; } header span { color: rgba(10,15,13,.6); }
      .plan { flex: 1; display: flex; align-items: center; justify-content: center; }
      .plan svg { max-width: 100%; max-height: 78vh; height: auto; }
      footer ul { list-style: none; margin: 6px 0 0; padding: 0; display: flex; flex-wrap: wrap; gap: 6px 18px; }
      footer i { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-inline-end: 6px; vertical-align: middle; }
    </style></head><body>${pages}<script>window.onload=function(){setTimeout(function(){window.print();},200);};<\/script></body></html>`);
  w.document.close();
}

function pdsExportPng(state, T, zone) {
  if (!zone) return;
  const svg = pdsExportSvg(state, zone, T);
  const P = pdsPlane(zone);
  const W = P.w + 80, H = P.h + 110, scale = 2;
  const img = new Image();
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  img.onload = () => {
    const c = document.createElement('canvas');
    c.width = W * scale; c.height = H * scale;
    const ctx = c.getContext('2d');
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0, W, H);
    URL.revokeObjectURL(url);
    c.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement('a');
      const v = window.KiwiVenue?.getCurrentVenueData?.() || {};
      const slug = String((v.name ? v.name + '-' : '') + zone.name).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      a.href = URL.createObjectURL(blob);
      a.download = `plan-${slug || 'salle'}.png`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      Kiwi.toast(T.exportDone, { type: 'success' });
    }, 'image/png');
  };
  img.onerror = () => URL.revokeObjectURL(url);
  img.src = url;
}
