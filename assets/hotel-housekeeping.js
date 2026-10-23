/* Hotel · ménage. Corps recopiés sans modification. */
window.__kiwiHotelInternal.define('housekeeping', (scope) => {
  'use strict';
  const { HK_DONE, HK_QUEUE, HK_STAFF, R, ROOMS, TYPES, cuRoomStatus, cuStarter, cuWarmState, esc, isCustomHotel, roomTypeOf, tx, txn } = scope;
  function menageBody() {
    const stPill = { encours: '<span class="hx-pill pend">EN COURS</span>', file: '<span class="hx-pill neutral">EN FILE</span>', attente: '<span class="hx-pill late">APRÈS DÉPART</span>', inspect: '<span class="hx-pill pend">À INSPECTER</span>' };
    const q = HK_QUEUE.map((it) => `
      <div class="hx-q">
        <i class="dot" style="background:${it.prio ? 'var(--danger)' : 'var(--warning)'};"></i>
        <div><div class="nm">Ch. ${it.room} · ${TYPES[ROOMS[it.room].type].name}</div><div class="nt">${it.note}</div></div>
        ${stPill[it.st] || ''}
        ${it.st === 'encours'
          ? `<button class="hx-btn ghost" data-action="hx-hk-done" data-arg="${it.room}">Terminer → inspection</button>`
          : it.who
            ? `<span style="font-size:12px;font-family:var(--mono);color:var(--n-500);">${it.who}</span>`
            : `<button class="hx-btn atlas" data-action="hx-hk-assign" data-arg="${it.room}">Assigner</button>`}
      </div>`).join('');
    const done = HK_DONE.map((d) => `
      <div class="hx-q">
        <i class="dot" style="background:var(--mint);"></i>
        <div><div class="nm">Ch. ${d.room} · remise ${d.at}</div><div class="nt">${d.by} · ${d.note}</div></div>
        <span class="hx-pill ok">INSPECTÉE ✓</span><span></span>
      </div>`).join('');
    const staff = HK_STAFF.map((s) => `
      <div class="hx-hk">
        <span class="hx-av ${s.cls}">${s.av}</span>
        <div><div style="font-weight:600;font-size:13px;color:var(--ink);">${s.name}</div><div style="font-size:11.5px;color:var(--n-500);">${s.role}</div></div>
        <span style="font-size:11.5px;color:var(--n-500);text-align:right;">${s.today}</span>
      </div>`).join('');
    return `<div class="hx-page">
      <div class="hx-strip">
        <div class="hx-kpi"><div class="l">En file</div><div class="v">${HK_QUEUE.length}</div><div class="d">dont 1 prioritaire · arrivée 17h00</div></div>
        <div class="hx-kpi"><div class="l">Remises aujourd'hui</div><div class="v">${HK_DONE.length}</div><div class="d up">relouées ce soir</div></div>
        <div class="hx-kpi"><div class="l">Tourné moyen</div><div class="v">42 <small>min</small></div><div class="d warn">cible 35 min · −7 à gagner</div><div class="hx-turn-bar"><i style="width:${Math.round(35 / 42 * 100)}%;"></i></div></div>
        <div class="hx-kpi"><div class="l">Inspections</div><div class="v">2 / 2</div><div class="d up">Khadija · gouvernante</div></div>
      </div>
      <div class="hx-h"><span class="t">File de remise à blanc</span><span class="s">sale → en cours → à inspecter → inspectée · la chambre repasse « libre propre »</span></div>
      <div class="block" style="padding:6px 14px;">${q || '<div style="padding:14px;font-size:13px;color:var(--n-500);">File vide, toutes les chambres sont prêtes.</div>'}</div>
      <div class="hx-h"><span class="t">Remises terminées · aujourd'hui</span></div>
      <div class="block" style="padding:6px 14px;">${done}</div>
      <div class="hx-h"><span class="t">Équipe ménage · 4</span><span class="a" data-action="nav-equipe">Gérer l'équipe →</span></div>
      <div class="block" style="padding:6px 14px;">${staff}</div>
    </div>`;
  }

  function cuHousekeeping() {
    if (!isCustomHotel()) return null;
    const rooms = Object.values(R() || {}).filter((r) => r && r.id);
    return { total: rooms.length, toClean: rooms.filter((r) => cuRoomStatus(r).key === 'sale').length, loading: cuWarmState.loading };
  }

  function cuMenageBody() {
    const dirty = Object.values(R()).filter((r) => cuRoomStatus(r).key === 'sale');
    const clean = Object.values(R()).filter((r) => cuRoomStatus(r).key === 'libre').length;
    const occupied = Object.values(R()).filter((r) => cuRoomStatus(r).key === 'occ').length;
    const offline = Object.values(R()).filter((r) => cuRoomStatus(r).key === 'hs').length;
    const rows = dirty.map((r) => `
      <div class="hx-q">
        <i class="dot" style="background:var(--warning);"></i>
        <div><div class="nm">${tx('Ch. {n}', { n: r.n })} · ${esc(roomTypeOf(r.n).name)}</div><div class="nt">${esc(r.floor)} · ${esc(r.status === 'sale' ? (tx(r.meta) || tx('À remettre à blanc')) : tx('Départ enregistré · remise à blanc à faire'))}</div></div>
        <span class="hx-pill late">${tx('À FAIRE')}</span>
        <button class="hx-btn ghost" data-action="hx-hk-done" data-arg="${r.n}">${tx('Marquer propre')}</button>
      </div>`).join('');
    return `<div class="hx-page hx-room-workspace">
      <div class="hx-room-section-tabs" role="tablist" aria-label="${tx('Espaces hôtel')}">
        <button role="tab" aria-selected="false" data-action="nav-chambres"><span>${tx('Plan')}</span><small>${txn(Object.values(R()).length, 'chambre')}</small></button>
        <button class="on" role="tab" aria-selected="true" data-action="nav-menage"><span>${tx('Ménage')}</span><small>${tx('{n} à nettoyer', { n: dirty.length })}</small></button>
        <button role="tab" aria-selected="false" data-action="nav-tarifs"><span>${tx('Tarifs')}</span><small>${tx('par catégorie')}</small></button>
      </div>
      <div class="hx-room-kpis hx-hk-kpis">
        <button data-activation=write><span>${tx('À nettoyer')}</span><b>${dirty.length}</b><small>${tx('file active')}</small></button>
        <button class="ready"><span>${tx('Prêtes')}</span><b>${clean}</b><small>${tx('à vendre')}</small></button>
        <button class="occupied"><span>${tx('Occupées')}</span><b>${occupied}</b><small>${tx('en maison')}</small></button>
        <button class="offline"><span>${tx('Hors-service')}</span><b>${offline}</b><small>${tx('maintenance')}</small></button>
      </div>
      <div class="hx-h"><span class="t">${tx('File de remise à blanc')}</span><span class="s">${tx('chaque départ encaissé arrive ici automatiquement')}</span><button class="hx-btn ghost" data-action="nav-chambres">${tx('Voir le plan')}</button></div>
      <div class="block" style="padding:8px 14px;">
        ${dirty.length ? `<div class="hx-list">${rows}</div>` : cuStarter(
          tx('Tout est propre.'),
          tx('Quand un départ est encaissé, sa chambre arrive ici pour remise à blanc, assignable à votre équipe.'),
          [tx('File priorisée par les arrivées du soir'), tx('Assignation femme de chambre en un geste'), tx('Temps de rotation mesuré automatiquement')]
        )}
      </div>
    </div>`;
  }


  return Object.freeze({ menageBody, cuHousekeeping, cuMenageBody });
});
