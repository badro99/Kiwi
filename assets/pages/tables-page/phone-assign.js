
const PDS_PHONE_STR = {
  fr: { tables: 'tables', title: 'Affectation des tables', sub: (n, u) => `${n} table${n > 1 ? 's' : ''} · ${u} sans serveur`,
        note: 'Le plan de salle se dessine sur ordinateur ou tablette. Ici, touchez un serveur, puis ses tables.',
        noStaff: 'Aucun serveur dans l’équipe. Ajoutez-en un depuis Équipe, avec le rôle Serveur.',
        noTables: 'Aucune table sur le plan. Dessinez la salle depuis un ordinateur.',
        count: (n, c) => `${n} table${n > 1 ? 's' : ''} · ${c} couverts`, none: 'Aucune table',
        pick: 'Touchez les tables de ce serveur. Une table peut avoir jusqu’à 3 serveurs.',
        full: 'Cette table a déjà 3 serveurs', unassigned: 'Sans serveur', close: 'Fermer' },
  en: { tables: 'tables', title: 'Table assignment', sub: (n, u) => `${n} table${n === 1 ? '' : 's'} · ${u} unassigned`,
        note: 'The floor plan is drawn on a computer or tablet. Here, tap a server, then their tables.',
        noStaff: 'No servers in the team yet. Add one from Team with the Server role.',
        noTables: 'No tables on the plan yet. Draw the room from a computer.',
        count: (n, c) => `${n} table${n === 1 ? '' : 's'} · ${c} covers`, none: 'No tables',
        pick: 'Tap this server’s tables. A table can have up to 3 servers.',
        full: 'This table already has 3 servers', unassigned: 'Unassigned', close: 'Close' },
  ar: { tables: 'طاولات', title: 'توزيع الطاولات', sub: (n, u) => `${n} طاولة · ${u} بدون نادل`,
        note: 'يُرسم مخطط القاعة من الحاسوب أو اللوحة. هنا اختر نادلاً ثم طاولاته.',
        noStaff: 'لا يوجد نُدُل في الفريق بعد. أضف واحداً من صفحة الفريق بدور نادل.',
        noTables: 'لا توجد طاولات في المخطط بعد. ارسم القاعة من الحاسوب.',
        count: (n, c) => `${n} طاولة · ${c} مقعد`, none: 'لا طاولات',
        pick: 'اختر طاولات هذا النادل. يمكن أن يكون للطاولة حتى 3 نُدُل.',
        full: 'لهذه الطاولة 3 نُدُل بالفعل', unassigned: 'بدون نادل', close: 'إغلاق' },
};
function pdsPhoneWanted() { return tableDrawing().pdsPhoneWanted.apply(this, arguments); }
function pdsInitials() { return tableDrawing().pdsInitials.apply(this, arguments); }
function pdsTableNum() { return tableDrawing().pdsTableNum.apply(this, arguments); }
/* Sur le téléphone du patron, la salle en direct passe avant l'affectation :
   les additions demandées d'abord, puis chaque table ouverte. Rien sans
   caisse (démo, hors ligne) · le badge le dit. */
function pdsPhoneLive(state) {
  const T = PDS_STR[trLang()] || PDS_STR.fr;
  if (!(PDS_LIVE && PDS_LIVE.live)) {
    return `<div class="pdsp-live" data-pdsp-live>${pdsLiveBadge(T)}</div>`;
  }
  const rank = { bill: 0, ordering: 1, occupied: 2, paid: 3, reserved: 4 };
  const open = state.tables.map(t => ({ t, e: pdsEff(t) }))
    .filter(r => rank[r.e.status] != null)
    .sort((a, b) => rank[a.e.status] - rank[b.e.status]
      || String(pdsTableNum(a.t)).localeCompare(String(pdsTableNum(b.t)), undefined, { numeric: true }));
  const rows = open.map(({ t, e }) => {
    const si = e.since && e.status !== 'reserved' ? pdsSince(e.since) : null;
    const meta = [pdsStatusLabel(e.status, T)];
    if (e.covers && e.status !== 'reserved') meta.push(T.coversNow(e.covers, pdsGeom(t).seats));
    if (si) meta.push(si.check ? T.checkTable : si.label);
    return `<div class="pdsp-lrow is-${e.status}"><b>${pdsEsc(pdsTableNum(t))}</b><span>${pdsEsc(meta.join(' · '))}</span>${e.billCents ? `<em>${pdsEsc(T.mad(e.billCents / 100))}</em>` : ''}</div>`;
  }).join('');
  return `<div class="pdsp-live" data-pdsp-live>
    <div class="pdsp-lhead"><b>${pdsEsc(T.liveTitle)}</b>${pdsLiveBadge(T)}</div>
    ${rows || `<p class="pdsp-lnone">${pdsEsc(T.liveAllFree)}</p>`}
  </div>`;
}
function pdsPhoneBody() { return tableDrawing().pdsPhoneBody.apply(this, arguments); }
const PDS_PHONE_CSS = `
.pdsp :focus-visible{outline:2px solid var(--atlas);outline-offset:-2px}
.pdsp{display:flex;flex-direction:column;gap:12px;padding-bottom:8px}
.pdsp-live{display:flex;flex-direction:column;gap:6px;padding:12px 14px;border-radius:16px;background:var(--surface);box-shadow:inset 0 0 0 1px var(--n-200)}
.pdsp-live > .pds-live-badge{align-self:flex-start}
.pdsp-lhead{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:2px}
.pdsp-lhead b{font-size:15px;font-weight:600}
.pdsp-lrow{display:grid;grid-template-columns:44px minmax(0,1fr) auto;align-items:center;gap:10px;min-height:44px;padding:6px 10px;border-radius:12px;background:var(--paper)}
.pdsp-lrow b{font-size:16px;font-weight:600;font-variant-numeric:tabular-nums}
.pdsp-lrow span{font-size:13px;color:var(--n-600);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pdsp-lrow em{font-style:normal;font-size:14px;font-weight:600;font-variant-numeric:tabular-nums}
.pdsp-lrow.is-bill{background:rgba(194,69,111,0.10);box-shadow:inset 3px 0 0 #C2456F}
.pdsp-lrow.is-bill span,.pdsp-lrow.is-bill em{color:#A0335A}
.pdsp-lrow.is-ordering{box-shadow:inset 3px 0 0 #C89235}
.pdsp-lrow.is-occupied{box-shadow:inset 3px 0 0 #0B6E4F}
.pdsp-lnone{margin:0;font-size:13px;color:var(--n-600)}
.pdsp-note{margin:0;font-size:14px;line-height:1.45;color:var(--n-600)}
.pdsp-sum{display:flex;gap:6px;align-items:baseline;font-size:14px;color:var(--n-600)}
.pdsp-sum b{font-size:17px;color:var(--ink);font-variant-numeric:tabular-nums}
.pdsp-empty{padding:28px 18px;border-radius:16px;background:var(--surface);text-align:center;font-size:14px;line-height:1.45;color:var(--n-600)}
.pdsp-list{display:flex;flex-direction:column;gap:8px}
.pdsp-srv{min-height:0;margin:0;padding:0;border-radius:16px;background:var(--surface);box-shadow:inset 0 0 0 1px var(--n-200);overflow:hidden}
.pdsp-srv.open{box-shadow:inset 0 0 0 1.5px var(--c)}
.pdsp-head{display:flex;align-items:center;gap:12px;width:100%;min-height:60px;padding:10px 14px 4px;border:0;background:none;color:inherit;text-align:start;font:inherit;cursor:pointer}
.pdsp-av{flex:0 0 auto;width:38px;height:38px;border-radius:50%;display:grid;place-items:center;background:var(--c-bg,var(--c));color:var(--c-ink,#fff);font-weight:600;font-size:13px}
.pdsp-who{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.pdsp-who b{font-size:16px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pdsp-who small{font-size:13px;color:var(--n-600)}
.pdsp-chev{width:9px;height:9px;border-right:2px solid var(--n-500);border-bottom:2px solid var(--n-500);transform:rotate(45deg);transition:transform .2s}
.pdsp-srv.open .pdsp-chev{transform:rotate(-135deg)}
.pdsp-mini{display:flex;flex-wrap:wrap;gap:5px;padding:4px 14px 12px 64px}
[dir="rtl"] .pdsp-mini{padding:4px 64px 12px 14px}
.pdsp-chip{padding:3px 8px;border-radius:8px;background:color-mix(in srgb,var(--c) 16%,transparent);color:var(--ink);font:600 12px/1.3 "JetBrains Mono",monospace}
.pdsp-chip.more{background:var(--n-100,rgba(10,15,13,.06))}
.pdsp-none{font-size:13px;color:var(--n-500)}
.pdsp-pick{padding:4px 14px 16px;border-top:1px solid var(--n-200)}
.pdsp-pick p{margin:12px 0 4px;font-size:13px;line-height:1.4;color:var(--n-600)}
.pdsp-zone{margin:12px 0 8px;font-size:12px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--n-500)}
.pdsp-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(64px,1fr));gap:8px}
.pdsp-t{position:relative;min-height:56px;border-radius:12px;border:1px solid var(--n-200);background:var(--paper);color:var(--ink);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;font:inherit;cursor:pointer;transition:transform .12s,background .15s}
.pdsp-t:active{transform:scale(.95)}
.pdsp-t b{font:600 16px/1.1 "JetBrains Mono",monospace}
.pdsp-t small{font-size:11px;color:var(--n-500)}
.pdsp-t i{position:absolute;top:3px;inset-inline-end:5px;font-size:11px;font-weight:600;color:var(--n-500)}
.pdsp-t.on{background:var(--c-bg,var(--c));border-color:var(--c-bg,var(--c));color:var(--c-ink,#fff)}
.pdsp-t.on small,.pdsp-t.on i{color:var(--c-ink,#fff)}
html[data-theme="dark"] .pdsp-t:not(.on){background:rgba(255,255,255,.04)}
@media (prefers-reduced-motion: reduce){.pdsp-chev,.pdsp-t{transition:none}}
`;
function pdsOpenPhoneAssign(state, v) {
  const P = PDS_PHONE_STR[trLang()] || PDS_PHONE_STR.fr;
  if (!document.getElementById('pdsp-css')) {
    const st = document.createElement('style'); st.id = 'pdsp-css'; st.textContent = PDS_PHONE_CSS; document.head.appendChild(st);
  }
  const free = () => state.tables.filter(t => !pdsServerIds(t).length).length;
  let openSid = state.staff.length === 1 ? String(state.staff[0].id) : null;
  const dr = fullpage({
    title: P.title,
    subtitle: `${v.name} · ${P.sub(state.tables.length, free())}`,
    width: 640,
    body: pdsPhoneBody(state, P, openSid),
    foot: `<div class="pds-foot"><div class="pds-foot-actions"><button class="kb atlas" data-dismiss>${pdsEsc(P.close)}</button></div></div>`,
  });
  wireDismiss(dr);
  if (!dr || !dr.el) return;
  window.Kiwi?.setActivePage?.('tables');
  /* La salle en direct : seul le bloc du haut est remplacé, jamais la
     liste qu'on est en train de toucher (un rebuild sous le doigt avale
     le tap). */
  const repaintLive = () => {
    const host = dr.el.querySelector('[data-pdsp-live]');
    if (!host) return;
    const html = pdsPhoneLive(state);
    if (html === lastLive) return;
    lastLive = html;
    host.outerHTML = html;
  };
  let lastLive = '';
  pdsIndexBookings(state);
  const unwatch = window.KiwiFloorLive ? window.KiwiFloorLive.watch((d) => { PDS_LIVE = d; repaintLive(); }) : null;
  const prevClose = dr.close;
  dr.close = () => {
    try { unwatch && unwatch(); } catch (_) {}
    try { pdsSave(state); } catch (_) {}
    if (pdsLive === state) pdsLive = null;
    window.Kiwi?.setActivePage?.('accueil');
    prevClose();
  };
  const paint = () => {
    const restoreFocus = pdsRememberFocus(dr.el);
    const body = dr.el.querySelector('.kiwi-drawer-body');
    if (body) body.innerHTML = pdsPhoneBody(state, P, openSid);
    const sub = dr.el.querySelector('.kiwi-drawer-head p');
    if (sub) sub.textContent = `${v.name} · ${P.sub(state.tables.length, free())}`;
    restoreFocus();
  };
  dr.el.addEventListener('click', (e) => {
    const head = e.target.closest('[data-pdsp-srv]');
    if (head) {
      const sid = head.getAttribute('data-pdsp-srv');
      openSid = openSid === sid ? null : sid;
      paint();
      const sec = dr.el.querySelector(`[data-pdsp-srv="${CSS.escape(sid)}"]`);
      if (sec && openSid) sec.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      return;
    }
    const cell = e.target.closest('[data-pdsp-t]');
    if (!cell || !openSid) return;
    const tid = cell.getAttribute('data-pdsp-t');
    const t = state.tables.find(o => String(o.id) === tid);
    if (!t) return;
    const ids = pdsServerIds(t);
    if (ids.includes(openSid)) pdsSetServerIds(t, ids.filter(id => id !== openSid));
    else if (ids.length >= PDS_MAX_TABLE_SERVERS) { Kiwi.toast(P.full, { type: 'info', duration: 1600 }); return; }
    else pdsSetServerIds(t, ids.concat(openSid));
    /* A chip toggle is a Choose, on the confirmed tap (design 2027, §20.3). */
    try { if (window.KiwiHaptics) window.KiwiHaptics.play('Choose', window.KiwiHaptics.gid('table-servers'), { trigger: 'tap', eventTimeStamp: e.timeStamp }); } catch (_) {}
    try { pdsSave(state); } catch (_) {}
    const y = dr.el.querySelector('.kiwi-drawer-body')?.scrollTop || 0;
    paint();
    const b = dr.el.querySelector('.kiwi-drawer-body'); if (b) b.scrollTop = y;
  });
}
