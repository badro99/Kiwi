/* Owner: hotel editors. Exposes a private factory; immutable dependencies are explicit, mutable owner state is accessed through live scope getters/setters. */
(window.__kiwiHotelSections ||= {}).editors = (scope) => {
'use strict';
const { F, GUESTS, HK_QUEUE, HX_WEEKDAYS, K, MAD, R, RATES, RATE_DAYS, TYPES, counts, cuActiveFilterCount, cuAllCharacteristics, cuAllStays, cuAllViews, cuBillingBlocked, cuBillingBody, cuBillingLine, cuBirthDisplay, cuBirthIso, cuBoards, cuChannelMerchant, cuChannelState, cuCharLabel, cuCommercialError, cuConnectingAvail, cuDay, cuDirectQuote, cuDraftInput, cuDraftMoney, cuEconomatBody, cuEconomatState, cuEnsureFilterVenue, cuEvaluateStayExceptions, cuFilterChipsMarkup, cuFloorKey, cuFloorMatchesFilter, cuFloorRows, cuFloors, cuHasGroupRecovery, cuMerchantSlug, cuNationalitySelectorHtml, cuPendingBulk, cuPerfState, cuPerfWindows, cuPrintDraft, cuProductionState, cuRackFilter, cuRenderPhotoEditor, cuRoomLive, cuRoomMatchesFilter, cuRoomStatus, cuSejoursAvailabilityBody, cuSelectedNumbers, cuSelectedRooms, cuStarter, cuState, cuStayCache, cuStayLoads, cuStayQuoteSignature, cuStayScope, cuStaysChanged, cuStaysKnown, cuToday, cuTonight, cuTypeOptions, cuTypes, cuUploadTypePhotos, cuViewLabel, cuWarmStays, cuWireNationalitySelectors, cuWireStayCommercial, esc, fmt, folioTotal, hxLang, hxLocale, hxTo, isCustomHotel, ltr, openFolio, roomCountLabel, roomTypeOf, toast, totalRooms, trL, tx, txk, txn } = scope;
function rerender() {
    // Les séjours ont pu bouger depuis la peinture précédente.
    scope.cuOccupancyMemo = null;
    if (!scope.openDrawer) return;
    const body = scope.openDrawer.el.querySelector('.genpage-body') || scope.openDrawer.el.querySelector('.kiwi-drawer-body');
    if (body) {
      const scrollEl = body.closest('.genpage-scroll') || body;
      const top = scrollEl ? scrollEl.scrollTop : 0;
      const left = scrollEl ? scrollEl.scrollLeft : 0;
      const winTop = typeof window !== 'undefined' ? window.scrollY : 0;
      const winLeft = typeof window !== 'undefined' ? window.scrollX : 0;
      body.innerHTML = scope.openDrawer.bodyFn();
      if (scrollEl) {
        scrollEl.scrollTop = top;
        scrollEl.scrollLeft = left;
      }
      if (typeof window !== 'undefined' && window.scrollTo) {
        window.scrollTo(winLeft, winTop);
      }
    }
    if (scope.openDrawer.page === 'chambres' && isCustomHotel()) {
      const first = scope.openDrawer.el.querySelector('.genpage-head p .seg');
      if (first) first.textContent = roomCountLabel();
    }
  }

function roomModal(n, opts) {
    const r = R()[n];
    if ((r.status === 'occ' || r.status === 'depart') && F()[n]) return openFolio(n);
    if (r.status === 'arrivee' && F()[n]) return openFolio(n);
    const dates = (opts && opts.startAt && opts.endAt) ? { startAt: +opts.startAt, endAt: +opts.endAt } : null;
    /* Ce qu'on affiche est l'état réel de la chambre, séjours compris — sans
     * quoi une chambre habitée s'annonce « Libre · propre » et propose le
     * walk-in. `live` sert aussi à nommer le client présent. */
    const liveRoom = cuRoomLive(r);
    const liveStatus = cuRoomStatus(r);
    const stLbl = { arrivee: tx('Arrivée attendue'), libre: tx('Libre · propre'), sale: tx('Libre · sale, en remise'), hs: tx('Hors-service') };
    const m = K().modal({
      tag: tx('CH. {n}', { n }) + ' · ' + roomTypeOf(n).name.toUpperCase(),
      title: r.guest || liveRoom?.stay?.customer?.name || (liveRoom ? liveStatus.label : (stLbl[r.status] || tx('Chambre {n}', { n }))),
      desc: tx(r.meta || ''),
      width: 480,
      body: `
        <div style="display:flex;flex-direction:column;gap:10px;font-size:13px;">
          <div style="display:flex;justify-content:space-between;"><span style="color:var(--n-500);">${tx('Statut')}</span><b>${esc(liveStatus.label)}</b></div>
          ${liveRoom ? `<div style="display:flex;justify-content:space-between;"><span style="color:var(--n-500);">${tx('Dossier')}</span><b>${esc(cuDay(liveRoom.stay.hotel.checkIn))}${hxTo()}${esc(cuDay(liveRoom.stay.hotel.checkOut))}</b></div>` : ''}
          <div style="display:flex;justify-content:space-between;"><span style="color:var(--n-500);">${tx('Tarif de base')}</span><b style="font-family:var(--mono);">${tx('{amount} / nuit', { amount: MAD(roomTypeOf(n).base) })}</b></div>
          ${r.view ? `<div style="display:flex;justify-content:space-between;"><span style="color:var(--n-500);">${tx('Vue')}</span><b>${tx('Vue {name}', { name: esc(cuViewLabel(r.view)) })}</b></div>` : ''}
          ${(r.characteristics && r.characteristics.length) ? `<div style="display:flex;justify-content:space-between;"><span style="color:var(--n-500);">${tx('Équipements')}</span><b>${esc(r.characteristics.map((c) => cuCharLabel(c)).join(', '))}</b></div>` : ''}
          ${(r.connectingRoomIds && r.connectingRoomIds.length) ? `
          <div style="display:flex;flex-direction:column;gap:4px;padding:8px 10px;border-radius:8px;background:var(--n-50,#f7f8f7);margin-top:4px;">
            <span style="color:var(--n-500);font-size:11.5px;font-weight:600;">${tx('Portes communicantes')}</span>
            <div style="display:flex;flex-direction:column;gap:3px;font-size:12px;">
              ${r.connectingRoomIds.map((cid) => {
                const cr = Object.values(R()).find((x) => x.id === cid);
                if (!cr) return '';
                const availLabel = cuConnectingAvail(cr, dates);
                return `<span><b>${tx('Ch. {n}', { n: cr.n })}</b> (${esc(roomTypeOf(cr.n).name)}) · ${esc(availLabel)}</span>`;
              }).filter(Boolean).join('')}
            </div>
            <small style="color:var(--n-500);font-size:11px;">${tx('Chambre communicante vendue séparément. Non réservée automatiquement.')}</small>
          </div>` : ''}
          ${liveStatus.key === 'sale' ? `<div style="display:flex;justify-content:space-between;"><span style="color:var(--n-500);">${tx('Ménage')}</span><b>${isCustomHotel() ? tx('à remettre à blanc') : ((HK_QUEUE.find((q) => q.room === n) || {}).who || 'à assigner')}</b></div>` : ''}
        </div>
        <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:20px;flex-wrap:wrap;">
          ${liveStatus.key === 'libre' ? `<button class="hx-btn atlas" data-action="hx-walkin-room" data-arg="${n}">${tx('Vendre ce soir · walk-in')}</button>` : ''}
          ${liveRoom && liveRoom.kind !== 'arrivee' ? `<button data-activation=write class="hx-btn ghost" data-action="hx-stay-edit" data-arg="${esc(liveRoom.stay.id)}">${tx('Ouvrir le dossier')}</button>` : ''}
          ${liveStatus.key === 'sale' ? (isCustomHotel()
            ? `<button class="hx-btn atlas" data-action="hx-hk-done" data-arg="${n}">${tx('Marquer propre · relouable')}</button>`
            : `<button class="hx-btn atlas" data-action="hx-hk-open">Ouvrir la file ménage</button>`) : ''}
          ${r.status === 'hs' ? `<button class="hx-btn ghost" data-action="hx-hs-fix" data-arg="${n}">${tx('Marquer réparée')}</button>` : ''}
        </div>`,
    });
    scope.openModal = { el: m.el, close: m.close };
  }

function tarifsBody() {
    const grid = `<div class="hx-rates">
      <div class="hd" style="text-align:left;padding-left:8px;">TYPE · ${scope.aiApplied ? 'TARIFS IA APPLIQUÉS' : 'TARIF / NUIT'}</div>
      ${RATE_DAYS.map((d, i) => `<div class="hd${i >= 3 && i <= 4 ? ' we' : ''}">${d}${i === 0 ? ' · AUJ.' : ''}</div>`).join('')}
      ${Object.keys(RATES).map((ty) => {
        const r = RATES[ty];
        return `<div class="ty">${TYPES[ty].name}</div>` + r.base.map((b, i) => `
          <div class="rc${scope.aiApplied && r.ai[i] ? ' edited' : ''}" data-action="hx-rate-cell" data-arg="${ty}|${i}">
            <div class="base">${fmt(b)}</div>
            ${!scope.aiApplied && r.ai[i] ? `<div class="ai up">IA ${fmt(r.ai[i])}</div>` : (scope.aiApplied && r.ai[i] ? '<div class="ai">appliqué ✓</div>' : '<div class="ai" style="color:var(--n-300);">·</div>')}
          </div>`).join('');
      }).join('')}
    </div>`;
    return `<div class="hx-page">
      <div class="hx-strip">
        <div class="hx-kpi"><div class="l">ADR · 30 jours</div><div class="v">894 <small>MAD</small></div><div class="d up">+3,2 % vs mois dernier</div></div>
        <div class="hx-kpi"><div class="l">RevPAR · 30 jours</div><div class="v">681 <small>MAD</small></div><div class="d up">+5,8 %</div></div>
        <div class="hx-kpi"><div class="l">Occupation · 30 j</div><div class="v">76,2 <small>%</small></div><div class="d up">riads médina : 70 % méd.</div></div>
        <div class="hx-kpi"><div class="l">Weekend 13-14</div><div class="v">96 <small>%</small></div><div class="d warn">demande forte · montez les prix</div></div>
      </div>
      <div class="hx-h"><span class="t">Calendrier tarifaire · 7 jours</span><span class="s">touchez une cellule pour ajuster · l'IA suggère selon saison, remplissage et comp-set</span>
        ${scope.aiApplied ? '<span class="hx-pill ok">SUGGESTIONS APPLIQUÉES ✓</span>' : '<button class="hx-btn atlas" data-action="hx-apply-ai">Appliquer les suggestions IA</button>'}
      </div>
      <div class="block hx-rates-wrap" style="padding:14px;">${grid}</div>
      <div class="hx-row r-2">
        <div class="block" style="padding:16px;">
          <div class="hx-h" style="margin:0 0 10px;"><span class="t">Pourquoi ces suggestions</span></div>
          <div style="font-size:12.5px;color:var(--n-500);line-height:1.7;">
            Samedi 13 juin est à <b style="color:var(--ink);">96 % de remplissage</b> avec 3 jours d'avance, la demande médina monte de 14 % cette semaine (comp-set 64 riads).
            La <b style="color:var(--ink);">Suite Terrasse Royale est sous-cotée</b> : vos 2 suites partent 5 jours sur 7 alors que le comp-set premium affiche +18 % sur le weekend.
            Revenu projeté si appliqué : <b style="color:var(--atlas);">+4 280 MAD sur 7 jours</b>.
          </div>
        </div>
        <div class="block" style="padding:16px;">
          <div class="hx-h" style="margin:0 0 10px;"><span class="t">Saisonnalité Marrakech</span></div>
          <div style="display:flex;flex-direction:column;gap:8px;font-size:12.5px;color:var(--n-500);">
            <div style="display:flex;justify-content:space-between;"><span><span class="hx-ev peak">HAUTE SAISON</span></span><span>octobre → décembre · février → avril</span></div>
            <div style="display:flex;justify-content:space-between;"><span><span class="hx-ev dip">ÉTÉ</span></span><span>juillet-août · chaleur, visez les nuitées MRE</span></div>
            <div style="display:flex;justify-content:space-between;"><span><span class="hx-ev dip">RAMADAN 2027</span></span><span>≈ 8 février → 9 mars · creux puis pic Aïd</span></div>
            <div style="display:flex;justify-content:space-between;"><span><span class="hx-ev peak">AÏD AL-FITR</span></span><span>≈ 10-13 mars 2027 · +28 % vs moyenne</span></div>
          </div>
        </div>
      </div>
    </div>`;
  }

function guestModal(id) {
    const g = GUESTS.find((x) => x.id === id);
    if (!g) return;
    const m = K().modal({
      tag: 'CLIENT · ' + g.country.toUpperCase(),
      title: g.name,
      desc: `${g.stays} séjour${g.stays > 1 ? 's' : ''} · dernier : ${esc(g.last)}`,
      width: 520,
      body: `
        <div style="display:flex;flex-direction:column;gap:12px;font-size:13px;">
          <div style="display:flex;justify-content:space-between;"><span style="color:var(--n-500);">Valeur vie client</span><b style="font-family:var(--mono);font-size:16px;">${g.ltv ? MAD(g.ltv) : '·'}</b></div>
          ${g.ltv ? `<div>
            <div style="font-size:11px;font-family:var(--mono);color:var(--n-500);letter-spacing:.05em;margin-bottom:6px;">RÉPARTITION · CHAMBRES / RESTAURANT / HAMMAM</div>
            <div style="display:flex;height:10px;border-radius:999px;overflow:hidden;">
              <i style="flex:${g.split[0]};background:var(--atlas);"></i><i style="flex:${g.split[1]};background:var(--warning);"></i><i style="flex:${g.split[2]};background:var(--riad);"></i>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--n-500);margin-top:5px;"><span>Chambres ${g.split[0]} %</span><span>Restaurant ${g.split[1]} %</span><span>Hammam ${g.split[2]} %</span></div>
          </div>` : ''}
          <div>
            <div style="font-size:11px;font-family:var(--mono);color:var(--n-500);letter-spacing:.05em;margin-bottom:6px;">PRÉFÉRENCES, SERVIES AU CHECK-IN</div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;">${g.prefs.map((p) => `<span class="hx-pref${/allergie/i.test(p) ? ' allergy' : ''}" style="font-size:11.5px;padding:4px 10px;">${p}</span>`).join('')}</div>
          </div>
        </div>
        <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:20px;">
          <button class="hx-btn ghost" data-action="hx-guest-msg" data-arg="${g.id}">Message WhatsApp</button>
          <button class="hx-btn atlas" data-action="hx-guest-direct" data-arg="${g.id}">Proposer un séjour direct · −10 %</button>
        </div>`,
    });
    scope.openModal = { el: m.el, close: m.close };
  }

function cuStrip() {
    cuWarmStays();
    const c = counts();
    const total = totalRooms();
    const free = Object.values(R()).filter((r) => cuRoomStatus(r).key === 'libre').length;
    const fmtPct = (v) => (window.KiwiNumber?.number(v, 1) ?? new Intl.NumberFormat(document.documentElement?.lang === 'en' ? 'en-GB' : 'fr-FR', {minimumFractionDigits:1,maximumFractionDigits:1}).format(v));
    /* Pas de chambre déclarée, ou séjours pas encore lus : « · », pas « 0 / 0 »
     * ni « 0,0 % », qui se liraient comme une mesure. */
    const known = total > 0 && c.tonightKnown !== false;
    scope.cuStripUnknown = !known && total > 0;
    const occ = known ? `${c.occToNight} / ${total}` : '·';
    const occNote = total === 0 ? tx('aucune chambre déclarée') : (known ? `${ltr(fmtPct(c.occToNight / total * 100) + ' %')} · ${tx('nuit du {date}', { date: cuToday().split('-').reverse().join('/') })}` : tx('lecture des séjours…'));
    return `<div class="hx-strip">
      <div class="hx-kpi"><div class="l">${tx('Occupation ce soir')}</div><div class="v">${ltr(occ)}</div><div class="d">${occNote}</div></div>
      <div class="hx-kpi"><div class="l">${tx('Libres · propres')}</div><div class="v">${free}</div><div class="d">${tx('prêtes à vendre')}</div></div>
      <div class="hx-kpi"><div class="l">${tx('À remettre à blanc')}</div><div class="v">${c.toClean}</div><div class="d">${c.toClean ? tx('voir Ménage') : tx('tout est propre ✓')}</div></div>
      <div class="hx-kpi"><div class="l">${tx('Tarif de base')}</div><div class="v">${cuState().baseRate == null ? '·' : ltr(fmt(cuState().baseRate) + ' <small>MAD</small>')}</div><div class="d">${tx('réglable dans Tarifs')}</div></div>
    </div>`;
  }

function cuRoomBatchEditor(prefillFloor) {
    const types = cuTypes();
    const firstType = types[0]?.id || '';
    const floors = cuFloorRows();
    const selectedFloorId = floors.some((f) => f.id === prefillFloor) ? prefillFloor : floors[0]?.id || '';
    const m = K().modal({
      tag: tx('CONFIGURATION RAPIDE'), title: tx('Ajouter plusieurs chambres'),
      desc: tx('Une seule configuration pour tout un étage, une aile ou une catégorie.'), width: 680,
      body: `<div class="hx-batch-intro">
          <span class="hx-batch-mark">01</span>
          <div><b>${tx('Indiquez simplement les numéros.')}</b><span>${tx('Une plage, des numéros séparés, ou les deux.')}</span></div>
          <code dir="ltr">101–108, 110, 112</code>
        </div>
        <div class="hx-room-form hx-room-form-batch">
          <label class="hx-room-form-wide hx-room-number-field"><span>${tx('Numéros des chambres')}</span><input data-hx-room-numbers inputmode="numeric" autocomplete="off" dir="ltr" placeholder="101-108, 110, 112"><small>${tx('Kiwi créera chaque numéro sans doublon.')}</small></label>
          <label><span>${tx('Type de chambre')}</span><select data-hx-room-type-id>${cuTypeOptions(firstType)}</select><small>${tx('Même catégorie et tarif pour ce lot.')}</small></label>
          <label><span>${tx('Étage, aile ou section')}</span><select data-hx-room-floor-id>${floors.map((f) => `<option value="${esc(f.id)}" ${f.id === selectedFloorId ? 'selected' : ''}>${esc(f.name)}</option>`).join('')}</select><small>${tx('Gérez les noms et l’ordre depuis le plan.')}</small></label>
        </div>
        <div class="hx-batch-foot">
          <button class="hx-link-btn" type="button" data-action="hx-room-types">${tx('Gérer les types et tarifs')}</button>
          <button data-activation=write class="hx-btn atlas" type="button" data-action="hx-room-batch-save">${tx('Ajouter les chambres')}</button>
        </div>`,
    });
    m.el.querySelector('.kiwi-modal')?.classList.add('hx-hotel-modal', 'hx-batch-modal');
    scope.openModal = { el: m.el, close: m.close };
  }

function cuRoomEditor(n) {
    const room = cuState().rooms[+n];
    if (!room) return;
    const liveKey = cuRoomStatus(room).key;
    const locked = liveKey === 'occ' || liveKey === 'arrivee';
    const status = liveKey === 'sale' ? 'sale' : (room.status || 'libre');
    // Same floor only; already-linked rooms stay visible (flagged) so an old
    // cross-floor liaison can be reviewed and removed, never re-added.
    const linkedIds = new Set(room.connectingRoomIds || []);
    const connOptions = Object.values(cuState().rooms || {}).filter((r) => r.n !== room.n).sort((a, b) => a.n - b.n)
      .filter((o) => linkedIds.has(o.id) || cuFloorKey(o) === cuFloorKey(room))
      .map((o) => {
        const otherFloor = cuFloorKey(o) !== cuFloorKey(room);
        return `<option value="${esc(o.id)}" ${linkedIds.has(o.id) ? 'selected' : ''}>${tx('Ch. {n}', { n: o.n })} · ${esc(roomTypeOf(o.n).name)} (${esc(o.floor)})${otherFloor ? ' · ' + tx('autre étage') : ''}</option>`;
      }).join('');
    const m = K().modal({
      tag: tx('CHAMBRE {n}', { n: room.n }), title: tx('Modifier la chambre'),
      desc: tx('Changez uniquement ce qui distingue cette chambre.'), width: 560,
      body: `<div class="hx-room-form">
        <label><span>${tx('Numéro')}</span><input data-hx-room-number type="number" inputmode="numeric" min="1" max="9999" value="${room.n}"></label>
        <label><span>${tx('Type')}</span><select data-hx-room-type-id>${cuTypeOptions(room.typeId)}</select></label>
        <label><span>${tx('Étage / aile')}</span><select data-hx-room-floor-id>${cuFloorRows().map((f) => `<option value="${esc(f.id)}" ${f.id === room.floorId ? 'selected' : ''}>${esc(f.name)}</option>`).join('')}</select></label>
        <label><span>${tx('Vue')}</span><select data-hx-room-view>
          <option value="">${tx('Non spécifiée')}</option>
          ${cuAllViews().map((v) => `<option value="${esc(v)}" ${room.view === v ? 'selected' : ''}>${tx('Vue {v}', { v: esc(cuViewLabel(v)) })}</option>`).join('')}
        </select></label>
        <label><span>${tx('État')}</span><select data-hx-room-status ${locked ? 'disabled' : ''}>
          <option value="libre" ${status === 'libre' ? 'selected' : ''}>${tx('Libre · propre')}</option>
          <option value="sale" ${status === 'sale' ? 'selected' : ''}>${tx('Libre · à nettoyer')}</option>
          <option value="hs" ${status === 'hs' ? 'selected' : ''}>${tx('Hors-service')}</option>
          ${locked ? `<option value="${status}" selected>${status === 'occ' ? tx('Occupée') : status === 'depart' ? tx('Départ du jour') : tx('Arrivée attendue')}</option>` : ''}
        </select>${locked ? `<small>${tx('Le statut du séjour se gère depuis le folio.')}</small>` : ''}</label>
        <div class="hx-room-form-wide">
          <label><span>${tx('Caractéristiques & équipements')}</span>
            <div class="hx-char-checkboxes">
              ${cuAllCharacteristics().map((c) => `<label class="hx-char-label"><input type="checkbox" data-hx-room-char="${c.id}" ${(room.characteristics || []).includes(c.id) ? 'checked' : ''}> ${esc(cuCharLabel(c))}</label>`).join('')}
            </div>
          </label>
        </div>
        <div class="hx-room-form-wide">
          <label><span>${tx('Portes communicantes')} <small>· ${tx('liaison réciproque directe')}</small></span>
            <select data-hx-room-connecting multiple size="3">
              ${connOptions || `<option value="" disabled>${tx('Aucune autre chambre à cet étage')}</option>`}
            </select>
            <small>${tx('Seules les chambres du même étage peuvent être reliées. Maintenu automatiquement dans les deux sens.')}</small>
          </label>
        </div>
      </div>
      <div class="hx-room-form-actions">
        <button data-activation=write class="hx-btn warn" data-action="hx-room-delete-open" data-arg="${room.n}">${tx('Supprimer')}</button>
        <button data-activation=write class="hx-btn atlas" data-action="hx-room-save" data-arg="${room.n}">${tx('Enregistrer')}</button>
      </div>`,
    });
    m.el.querySelector('.kiwi-modal')?.classList.add('hx-hotel-modal');
    scope.openModal = { el: m.el, close: m.close };
  }

function cuTypesManager() {
    const st = cuState();
    const rows = cuTypes().map((t) => {
      const count = Object.values(st.rooms).filter((r) => r.typeId === t.id).length;
      return `<button data-activation=write class="hx-type-card" type="button" data-action="hx-room-type-edit" data-arg="${esc(t.id)}">
        <span class="hx-type-icon">${esc(t.name.slice(0, 1).toUpperCase())}</span>
        <span class="hx-type-copy"><b>${esc(t.name)}</b><small>${txn(count, 'chambre')}</small></span>
        <span class="hx-type-rate">${t.rate == null ? tx('Tarif général') : MAD(t.rate)}<small>${tx('par nuit')}</small></span>
        <span class="hx-type-arrow">›</span>
      </button>`;
    }).join('');
    const m = K().modal({
      tag: tx('CATÉGORIES'), title: tx('Types de chambres'),
      desc: tx('Vos noms et tarifs maison. Toute modification s’applique aux chambres de ce type.'), width: 620,
      body: `<div class="hx-type-summary"><span>${cuTypes().length}</span><div><b>${tx('Catégories actives')}</b><small>${tx('Un seul réglage met à jour toutes les chambres concernées.')}</small></div></div>
        <div class="hx-type-list">${rows}</div>
        <button data-activation=write class="hx-type-add" type="button" data-action="hx-room-type-new">+ ${tx('Créer un type de chambre')}</button>`,
    });
    m.el.querySelector('.kiwi-modal')?.classList.add('hx-hotel-modal', 'hx-types-modal');
    scope.openModal = { el: m.el, close: m.close };
  }

function cuTypeEditor(id) {
    const type = id ? cuState().roomTypes[id] : null;
    const amenities = (type?.amenities || []).join(', ');
    const m = K().modal({
      tag: type ? tx('TYPE DE CHAMBRE') : tx('NOUVEAU TYPE'),
      title: type ? tx('Modifier « {name} »', { name: esc(type.name) }) : tx('Créer un type'),
      desc: tx('Décrivez ce que le client verra sur votre lien de réservation.'), width: 680,
      body: `<div class="hx-room-form hx-type-form">
        <label class="hx-room-form-wide"><span>${tx('Nom affiché')}</span><input data-hx-type-name maxlength="60" value="${esc(type?.name || '')}" placeholder="${tx('Ex. Suite Atlas')}"></label>
        <label class="hx-room-form-wide"><span>${tx('Tarif par nuit')} <small>· MAD · ${tx('optionnel')}</small></span><input data-hx-type-rate type="number" inputmode="decimal" min="0" step="1" value="${type?.rate == null ? '' : type.rate}" placeholder="${tx('Utiliser le tarif général')}"></label>
        <div class="hx-room-form-wide"><span style="font-size:12px;font-weight:600;">${tx('Suppléments repas')} <small style="font-weight:400;">· ${tx('MAD par personne et par nuit · optionnel · servent aux voyageurs sans compte commercial')}</small></span>
          <div class="hx-room-form hx-type-form" style="margin-top:6px;">
            <label><span>${tx('Petit-déjeuner')}</span><input data-hx-type-board-bb type="number" inputmode="decimal" min="0" step="1" value="${type?.boardRates?.bb ?? ''}" placeholder="·"></label>
            <label><span>${tx('Demi-pension · déjeuner')}</span><input data-hx-type-board-hb_lunch type="number" inputmode="decimal" min="0" step="1" value="${type?.boardRates?.hb_lunch ?? ''}" placeholder="·"></label>
            <label><span>${tx('Demi-pension · dîner')}</span><input data-hx-type-board-hb_dinner type="number" inputmode="decimal" min="0" step="1" value="${type?.boardRates?.hb_dinner ?? ''}" placeholder="·"></label>
            <label><span>${tx('Pension complète')}</span><input data-hx-type-board-full_board type="number" inputmode="decimal" min="0" step="1" value="${type?.boardRates?.full_board ?? ''}" placeholder="·"></label>
          </div>
        </div>
        <label class="hx-room-form-wide"><span>${tx('Description publique')}</span><textarea data-hx-type-description maxlength="300" rows="3" placeholder="${tx('Une chambre calme et lumineuse, idéale pour…')}">${esc(type?.description || '')}</textarea></label>
        <label><span>${tx('Voyageurs maximum')}</span><input data-hx-type-guests type="number" inputmode="numeric" min="1" max="12" value="${type?.maxGuests || 2}"></label>
        <label><span>${tx('Couchage')}</span><input data-hx-type-beds maxlength="80" value="${esc(type?.beds || '')}" placeholder="${tx('1 grand lit')}"></label>
        <label><span>${tx('Surface')} <small>· m²</small></span><input data-hx-type-size type="number" inputmode="numeric" min="1" max="999" value="${type?.sizeM2 || ''}" placeholder="24"></label>
        <label><span>${tx('Vue')}</span><input data-hx-type-view maxlength="80" value="${esc(type?.view || '')}" placeholder="${tx('Patio, médina, montagne…')}"></label>
        <label class="hx-room-form-wide"><span>${tx('Équipements')} <small>· ${tx('séparés par des virgules')}</small></span><input data-hx-type-amenities maxlength="500" value="${esc(amenities)}" placeholder="${tx('Wi-Fi, climatisation, petit-déjeuner')}"></label>
        <section class="hx-type-photos hx-room-form-wide"><div class="hx-type-photos-head"><div><b>${tx('Galerie publique')}</b><span>${tx('8 photos maximum · la première devient la couverture')}</span></div><button data-activation=write class="hx-btn ghost" type="button" data-action="hx-type-photo-pick">+ ${tx('Ajouter des photos')}</button><input data-hx-type-photo-input type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" multiple hidden></div><div class="hx-type-photo-grid" data-hx-type-photos></div><p data-hx-type-photo-status></p></section>
        <label class="hx-room-form-wide"><span><input data-hx-type-public type="checkbox" ${type?.public === false ? '' : 'checked'}> ${tx('Visible sur le lien de réservation')}</span></label>
      </div>
      <div class="hx-room-form-actions">
        ${type ? `<button data-activation=write class="hx-btn warn" data-action="hx-room-type-delete" data-arg="${esc(type.id)}">${tx('Supprimer')}</button>` : '<span></span>'}
        <button data-activation=write class="hx-btn atlas" data-action="hx-room-type-save" data-arg="${esc(type?.id || 'new')}">${tx('Enregistrer')}</button>
      </div>`,
    });
    m.el.querySelector('.kiwi-modal')?.classList.add('hx-hotel-modal');
    const root = m.el.querySelector('.kiwi-modal');
    root.__hxPhotos = (type?.photos || []).map((p) => ({ ...p }));
    cuRenderPhotoEditor(root);
    root.querySelector('[data-hx-type-photo-input]')?.addEventListener('change', (e) => { cuUploadTypePhotos(root, e.target.files); e.target.value = ''; });
    scope.openModal = { el: m.el, close: m.close };
  }

function cuFloorsManager() {
    const st = cuState();
    const rows = cuFloorRows().map((f, index, list) => {
      const count = Object.values(st.rooms).filter((r) => r.floorId === f.id).length;
      return `<div class="hx-floor-manager-row">
        <span class="hx-floor-manager-grip">⋮⋮</span>
        <span class="hx-floor-manager-copy"><b>${esc(f.name)}</b><small>${txn(count, 'chambre')}</small></span>
        <span class="hx-floor-manager-order">
          <button data-action="hx-floor-move" data-arg="${esc(f.id)}:-1" ${index === 0 ? 'disabled' : ''} aria-label="${tx('Monter')}">↑</button>
          <button data-action="hx-floor-move" data-arg="${esc(f.id)}:1" ${index === list.length - 1 ? 'disabled' : ''} aria-label="${tx('Descendre')}">↓</button>
        </span>
        <button data-activation=write class="hx-floor-manager-edit" data-action="hx-floor-edit" data-arg="${esc(f.id)}">${tx('Modifier')}</button>
      </div>`;
    }).join('');
    const m = K().modal({
      tag: tx('ORGANISATION'), title: tx('Étages, ailes & sections'),
      desc: tx('Renommez, réordonnez ou supprimez vos sections sans perdre les chambres.'), width: 620,
      body: `<div class="hx-floor-manager-list">${rows || `<p>${tx('Aucune section.')}</p>`}</div>
        <div style="display:flex;gap:10px;margin-top:12px;flex-wrap:wrap;">
          <button data-activation=write class="hx-type-add" type="button" data-action="hx-floor-new">+ ${trL({ fr: 'Créer une section', en: 'Create section', ar: 'إنشاء قسم' })}</button>
        </div>`,
    });
    m.el.querySelector('.kiwi-modal')?.classList.add('hx-hotel-modal', 'hx-floors-modal');
    scope.openModal = { el: m.el, close: m.close };
  }

function cuViewsAndCharsManager() {
    const st = cuState();
    const views = cuAllViews();
    const customs = Array.isArray(st.customCharacteristics) ? st.customCharacteristics : [];

    const m = K().modal({
      tag: tx('CONFIGURATION'),
      title: trL({ fr: 'Vues & caractéristiques', en: 'Views & amenities', ar: 'الإطلالات والمميزات' }),
      desc: trL({
        fr: 'Personnalisez les types de vues et les équipements proposés pour vos chambres.',
        en: 'Customize view types and amenities offered for your rooms.',
        ar: 'تخصيص أنواع الإطلالات والمميزات المتوفرة لغرفك.',
      }),
      width: 720,
      body: `<div class="hx-attribute-settings">
        <div class="hx-attribute-panel" role="group" aria-label="${trL({ fr: 'Types de vues', en: 'View types', ar: 'أنواع الإطلالات' })}">
          <div class="hx-attribute-head">
            <span class="hx-attribute-icon" aria-hidden="true">◌</span>
            <div><b>${trL({ fr: 'Types de vues', en: 'View types', ar: 'أنواع الإطلالات' })}</b><small>${trL({ fr: 'Décrivez ce que le voyageur voit depuis la chambre.', en: 'Describe what guests see from the room.', ar: 'صف ما يراه الضيف من الغرفة.' })}</small></div>
            <span class="hx-attribute-count">${views.length}</span>
          </div>
          <div class="hx-views-config-list">
            ${views.map((v) => `
              <span class="hx-view-config-chip">
                <span>${trL({ fr: 'Vue', en: 'View', ar: 'إطلالة' })} ${esc(cuViewLabel(v))}</span>
                <button data-activation=write type="button" data-action="hx-view-remove" data-arg="${esc(v)}" aria-label="${trL({ fr: 'Supprimer', en: 'Delete', ar: 'حذف' })}">×</button>
              </span>`).join('')}
          </div>
          <div class="hx-attribute-add">
            <label><span>${trL({ fr: 'Nouvelle vue', en: 'New view', ar: 'إطلالة جديدة' })}</span><input data-hx-view-input type="text" maxlength="40" placeholder="${trL({ fr: 'Ex. Piscine intérieure, Montagne…', en: 'e.g. Mountain, Courtyard…', ar: 'مثال: جبل، فناء…' })}"></label>
            <button data-activation=write class="hx-btn atlas" type="button" data-action="hx-view-add">${trL({ fr: '+ Ajouter une vue', en: '+ Add view', ar: '+ إضافة إطلالة' })}</button>
          </div>
        </div>
        <div class="hx-attribute-panel" role="group" aria-label="${trL({ fr: 'Équipements personnalisés', en: 'Custom amenities', ar: 'تجهيزات مخصصة' })}">
          <div class="hx-attribute-head">
            <span class="hx-attribute-icon" aria-hidden="true">◇</span>
            <div><b>${trL({ fr: 'Équipements personnalisés', en: 'Custom amenities', ar: 'تجهيزات مخصصة' })}</b><small>${trL({ fr: 'Ajoutez uniquement les équipements propres à votre établissement.', en: 'Add amenities specific to your property.', ar: 'أضف التجهيزات الخاصة بمنشأتك.' })}</small></div>
            <span class="hx-attribute-count">${customs.length}</span>
          </div>
          <div class="hx-attribute-list">
            ${customs.length ? customs.map((c) => `
              <div class="hx-config-char-row">
                <span><b>${esc(cuCharLabel(c))}</b></span>
                <button data-activation=write type="button" data-action="hx-char-remove" data-arg="${esc(c.id)}">${trL({ fr: 'Supprimer', en: 'Delete', ar: 'حذف' })}</button>
              </div>`).join('') : `<div class="hx-attribute-empty">${trL({ fr: 'Aucun équipement personnalisé. Les 8 équipements standards restent disponibles.', en: 'No custom amenities. The 8 standard amenities remain available.', ar: 'لا توجد تجهيزات مخصصة. التجهيزات الأساسية الثمانية تبقى متوفرة.' })}</div>`}
          </div>
          <div class="hx-attribute-add">
            <label><span>${trL({ fr: 'Nouvel équipement', en: 'New amenity', ar: 'تجهيز جديد' })}</span><input data-hx-char-input type="text" maxlength="50" placeholder="${trL({ fr: 'Ex. Jacuzzi privatif, Machine Nespresso…', en: 'e.g. Private hot tub, Espresso machine…', ar: 'مثال: جاكوزي خاص، آلة قهوة…' })}"></label>
            <button data-activation=write class="hx-btn atlas" type="button" data-action="hx-char-add">${trL({ fr: '+ Ajouter un équipement', en: '+ Add amenity', ar: '+ إضافة ميزة' })}</button>
          </div>
        </div>
      </div>
      <div class="hx-room-form-actions hx-attribute-footer">
        <button class="hx-btn ghost" data-action="hx-views-manage-close">${trL({ fr: 'Fermer', en: 'Close', ar: 'إغلاق' })}</button>
      </div>`,
    });
    m.el.querySelector('.kiwi-modal')?.classList.add('hx-hotel-modal', 'hx-attributes-modal');
    scope.openModal = { el: m.el, close: m.close };
  }

function cuFloorEditor(id) {
    const st = cuState();
    const floor = id ? st.floors[id] : null;
    const others = cuFloorRows().filter((f) => f.id !== id);
    const count = floor ? Object.values(st.rooms).filter((r) => r.floorId === id).length : 0;
    const m = K().modal({
      tag: floor ? tx('SECTION') : tx('NOUVELLE SECTION'), title: floor ? tx('Modifier « {name} »', { name: esc(floor.name) }) : tx('Créer une section'),
      desc: floor ? tx('{n} dans cette section.', { n: txn(count, 'chambre') }) : tx('Ex. 1er étage, Patio, Aile Atlas…'), width: 500,
      body: `<div class="hx-room-form"><label class="hx-room-form-wide"><span>${tx('Nom affiché')}</span><input data-hx-floor-name maxlength="60" value="${esc(floor?.name || '')}" placeholder="${tx('Ex. 1er étage')}"></label></div>
        <p class="hx-floor-error" data-hx-floor-error style="color:var(--danger,#b91c1c);font-size:12px;margin:8px 0 0;" hidden></p>
        ${floor && count && others.length ? `<label class="hx-floor-delete-target"><span>${tx('En cas de suppression, déplacer les chambres vers')}</span><select data-hx-floor-target>${others.map((f) => `<option value="${esc(f.id)}">${esc(f.name)}</option>`).join('')}</select></label>` : ''}
        <div class="hx-room-form-actions">
          ${floor ? `<button data-activation=write class="hx-btn warn" data-action="hx-floor-delete" data-arg="${esc(floor.id)}" ${count && !others.length ? `disabled title="${tx('Créez une autre section avant de supprimer celle-ci')}"` : ''}>${tx('Supprimer')}</button>` : '<span></span>'}
          <button data-activation=write class="hx-btn atlas" data-action="hx-floor-save" data-arg="${esc(floor?.id || 'new')}">${tx('Enregistrer')}</button>
        </div>`,
    });
    m.el.querySelector('.kiwi-modal')?.classList.add('hx-hotel-modal');
    scope.openModal = { el: m.el, close: m.close };
  }

function cuRackBody() {
    cuEnsureFilterVenue();
    const pendingBulk = cuPendingBulk();
    const all = Object.values(R());
    const counts = {
      all: all.length,
      libre: all.filter((r) => cuRoomStatus(r).key === 'libre').length,
      occ: all.filter((r) => cuRoomStatus(r).key === 'occ').length,
      arrivee: all.filter((r) => cuRoomStatus(r).key === 'arrivee').length,
      sale: all.filter((r) => cuRoomStatus(r).key === 'sale').length,
      hs: all.filter((r) => cuRoomStatus(r).key === 'hs').length,
    };
    const compactProperty = all.length <= 20;
    const floorRows = cuFloors();

    const floorTabs = [`<button class="${(!cuRackFilter.floor || cuRackFilter.floor === 'all') && cuRackFilter.floors.size === 0 ? 'on' : ''}" data-action="hx-room-floor" data-arg="all">${tx('Tous les étages')} <b>${counts.all}</b></button>`]
      .concat(floorRows.map((f) => `<button class="${(cuRackFilter.floor === f.lbl || cuRackFilter.floors.has(f.id) || cuRackFilter.floors.has(f.lbl)) ? 'on' : ''}" data-action="hx-room-floor" data-arg="${esc(f.lbl)}">${esc(f.lbl)} <b>${f.rooms.length}</b></button>`)).join('');

    let matchingTotal = 0;
    const renderedSections = [];

    floorRows.forEach((f) => {
      if (!cuFloorMatchesFilter(f)) return;

      const matchedRooms = f.rooms.map((n) => R()[n]).filter((r) => cuRoomMatchesFilter(r));
      matchingTotal += matchedRooms.length;

      if (f.rooms.length === 0) {
        renderedSections.push(`<section class="hx-floor-section hx-floor-empty-section" data-hx-floor-section>
          <div class="hx-floor-head">
            <div><b>${esc(f.lbl)}</b><span>${tx('0 chambre')}</span></div>
            <div class="hx-floor-head-actions">
              <button data-activation=write data-action="hx-floor-edit" data-arg="${esc(f.id)}">${tx('Gérer')}</button>
              <button data-activation=write data-action="hx-room-add-floor" data-arg="${esc(f.id)}">+ ${tx('Ajouter des chambres')}</button>
            </div>
          </div>
          <div class="hx-room-empty-section-hint">${tx('Cette section ne contient encore aucune chambre.')}</div>
        </section>`);
        return;
      }

      if (matchedRooms.length === 0) {
        if (cuRackFilter.floor !== 'all' || cuRackFilter.floors.size > 0) {
          renderedSections.push(`<section class="hx-floor-section" data-hx-floor-section>
            <div class="hx-floor-head">
              <div><b>${esc(f.lbl)}</b><span>${tx('0 affichée')}</span></div>
              <div class="hx-floor-head-actions">
                <button data-activation=write data-action="hx-floor-edit" data-arg="${esc(f.id)}">${tx('Gérer')}</button>
                <button data-activation=write data-action="hx-room-add-floor" data-arg="${esc(f.id)}">+ ${tx('Ajouter ici')}</button>
              </div>
            </div>
            <div class="hx-room-empty-section-hint">${tx('Aucune chambre ne correspond aux filtres dans cette section.')}</div>
          </section>`);
        }
        return;
      }

      const roomCards = matchedRooms.map((r) => {
        const status = cuRoomStatus(r);
        const type = roomTypeOf(r.n);
        const today = new (globalThis.KiwiZoneLaw?.DateTimeFormat || Intl.DateTimeFormat)('en-CA', { timeZone: 'Africa/Casablanca', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
        const roomStay = cuRoomLive(r)?.stay || null;
        const roomErrs = roomStay ? cuEvaluateStayExceptions(roomStay, today) : [];
        const exChip = roomErrs.length ? `<span class="hx-exc-chip" title="${esc(roomErrs.map((e) => e.label).join(' · '))}">${tx('Incomplet')}</span>` : '';
        const isSelected = cuSelectedRooms.has(String(r.id));

        const viewName = r.view ? tx('Vue {v}', { v: esc(cuViewLabel(r.view)) }) : '';
        const viewBadge = r.view ? `<span class="hx-room-view-badge" title="${viewName}">${viewName}</span>` : '';
        const connBadge = (r.connectingRoomIds && r.connectingRoomIds.length) ? `<span class="hx-room-conn-badge" title="${tx('Portes communicantes ({n})', { n: r.connectingRoomIds.length })}">⇌</span>` : '';

        const selectCb = scope.cuSelectionMode ? `<label class="hx-room-select-cb"><input type="checkbox" data-action="hx-room-check" data-arg="${r.n}" ${isSelected ? 'checked' : ''} aria-label="${tx('Sélectionner la chambre {n}', { n: r.n })}"></label>` : '';

        return `<div class="hx-room st-${status.key} ${isSelected ? 'selected' : ''} ${scope.cuSelectionMode ? 'selection-mode' : ''}" role="button" tabindex="0" aria-label="${tx('Chambre {n}', { n: r.n })}" data-action="hx-room" data-arg="${r.n}" data-hx-room-card>
          ${selectCb}
          ${scope.cuSelectionMode ? '' : `<button data-activation=write class="hx-room-edit" type="button" data-action="hx-room-edit" data-arg="${r.n}" aria-label="${tx('Modifier la chambre {n}', { n: r.n })}" title="${tx('Modifier')}">✎</button>`}
          <div class="hx-room-top"><span class="no">${r.n}</span><span class="hx-room-state ${status.key}">${esc(status.label)}</span>${exChip}${connBadge}</div>
          <div class="ty" style="display:flex;align-items:center;justify-content:space-between;gap:6px;"><span>${esc(type.name)}</span>${viewBadge}</div>
          <div class="hx-room-bottom"><span class="gu">${esc(roomStay?.customer?.name || (status.key === 'sale' ? tx('Remise à blanc à faire') : r.guest || (status.key === 'libre' ? tx('Prête à vendre') : tx(r.meta) || status.label)))}</span><span class="hx-room-price">${type.base == null ? '·' : ltr(fmt(type.base) + '<small> MAD</small>')}</span></div>
        </div>`;
      }).join('');

      renderedSections.push(`<section class="hx-floor-section" data-hx-floor-section>
        <div class="hx-floor-head">
          <div><b>${esc(f.lbl)}</b><span>${tx(matchedRooms.length === 1 ? '{n} affichée' : '{n} affichées', { n: matchedRooms.length })}</span></div>
          <div class="hx-floor-head-actions">
            <button data-activation=write data-action="hx-floor-edit" data-arg="${esc(f.id)}">${tx('Gérer')}</button>
            <button data-activation=write data-action="hx-room-add-floor" data-arg="${esc(f.id)}">+ ${tx('Ajouter ici')}</button>
          </div>
        </div>
        <div class="hx-rack">${roomCards}</div>
      </section>`);
    });

    const floorSections = renderedSections.join('');

    if (!totalRooms()) return `<div class="hx-page hx-room-workspace">
      <div class="hx-room-empty">
        <div class="hx-room-empty-art"><span>101</span><span>102</span><span>103</span></div>
        <div class="hx-room-empty-copy"><span class="hx-eyebrow">${tx('CONFIGURATION EN 2 MINUTES')}</span><h3>${tx('Construisez votre hôtel par étage.')}</h3>
          <p>${tx('Créez vos types une fois, puis ajoutez 10, 50 ou 100 chambres avec les mêmes réglages.')}</p>
          <div class="hx-room-empty-actions"><button data-activation=write class="hx-btn atlas" data-action="hx-room-add">${tx('Ajouter plusieurs chambres')}</button><button class="hx-btn ghost" data-action="hx-room-types">${tx('Configurer les types')}</button></div>
          <div class="hx-room-empty-notes"><span>✓ ${tx('Numéros par plage')}</span><span>✓ ${tx('Tarifs par type')}</span><span>✓ ${tx('Connecté au ménage')}</span></div>
        </div>
      </div>
    </div>`;

    const noMatch = !floorSections ? `<div class="hx-room-no-match"><b>${tx('Aucune chambre ne correspond.')}</b><span>${tx('Changez l’étage, le statut, les caractéristiques ou la recherche.')}</span><button class="hx-link-btn" data-action="hx-room-filter-reset">${tx('Réinitialiser les filtres')}</button></div>` : '';

    const kpis = [
      ['all', '', tx('Total'), tx('inventaire')], ['libre', 'ready', tx('Prêtes'), tx('à vendre')],
      ['occ', 'occupied', tx('Occupées'), tx('en maison')], ['arrivee', 'arrival', tx('Arrivées'), tx('attendues')],
      ['sale', 'dirty', tx('À nettoyer'), tx('ménage')], ['hs', 'offline', tx('Hors-service'), tx('maintenance')],
    ].filter(([key]) => !compactProperty || ['all', 'libre', 'occ', 'sale'].includes(key) || counts[key] > 0);

    const filterCount = cuActiveFilterCount();
    const chipsHtml = cuFilterChipsMarkup(matchingTotal, all.length);

    const selectedList = cuSelectedNumbers();
    const visibleSelected = selectedList.filter((n) => cuRoomMatchesFilter(R()[n])).length;
    const hiddenSelected = selectedList.length - visibleSelected;

    let bulkBar = '';
    if (scope.cuSelectionMode || selectedList.length > 0) {
      bulkBar = `<div class="hx-room-bulk-bar" role="region" aria-label="${tx('Sélection groupée')}">
        <div class="hx-room-bulk-info">
          <b>${tx(selectedList.length > 1 ? '{n} chambres sélectionnées' : '{n} chambre sélectionnée', { n: selectedList.length, c: txn(selectedList.length, 'chambre') })}</b>
          ${hiddenSelected > 0 ? `<small>(${tx(hiddenSelected > 1 ? '{n} masquées par les filtres' : '{n} masquée par les filtres', { n: hiddenSelected })})</small>` : ''}
        </div>
        <div class="hx-room-bulk-actions">
          <button class="hx-btn ghost" data-action="hx-room-select-filtered">${tx('Sélectionner les résultats filtrés')}</button>
          <button class="hx-btn ghost" data-action="hx-room-select-none" ${selectedList.length === 0 ? 'disabled' : ''}>${tx('Tout désélectionner')}</button>
          <button data-activation=write class="hx-btn atlas" data-action="hx-room-bulk-edit-open" ${selectedList.length === 0 ? 'disabled' : ''}>${tx('Modifier')}</button>
          <button class="hx-btn ghost" data-action="hx-room-select-cancel">${tx('Annuler')}</button>
        </div>
      </div>`;
    }

    return `<div class="hx-page hx-room-workspace ${compactProperty ? 'hx-room-compact-property' : ''}">
      <div class="hx-room-section-tabs" role="tablist" aria-label="${tx('Espaces hôtel')}">
        <button class="on" role="tab" aria-selected="true" data-action="nav-chambres"><span>${tx('Plan')}</span><small>${txn(counts.all, 'chambre')}</small></button>
        <button role="tab" aria-selected="false" data-action="nav-menage"><span>${tx('Ménage')}</span><small>${tx('{n} à nettoyer', { n: counts.sale })}</small></button>
        <button role="tab" aria-selected="false" data-action="nav-tarifs"><span>${tx('Tarifs')}</span><small>${tx('par catégorie')}</small></button>
      </div>
      <div class="hx-room-kpis" style="--hx-kpi-count:${kpis.length}">${kpis.map(([key, cls, label, note]) => `<button class="${cls} ${cuRackFilter.status === key ? 'on' : ''}" data-action="hx-room-status" data-arg="${key}"><span>${label}</span><b>${counts[key]}</b><small>${note}</small></button>`).join('')}</div>
      <div class="hx-room-toolbar">
        ${compactProperty ? `<div class="hx-room-compact-hint">${tx('Touchez une chambre pour la vendre ou ouvrir son folio.')}</div>` : `<label class="hx-room-search"><span>⌕</span><input data-hx-room-search value="${esc(cuRackFilter.q)}" placeholder="${tx('Rechercher une chambre, un client, vue…')}"><button data-action="hx-room-search">${tx('Rechercher')}</button></label>`}
        <div class="hx-room-toolbar-actions">
          <button class="hx-btn ghost" data-action="hx-room-filters-open">${tx('Filtres')} ${filterCount ? `<b>(${filterCount})</b>` : ''}</button>
          <button class="hx-btn ${scope.cuSelectionMode ? 'atlas' : 'ghost'}" data-action="hx-room-select-toggle">${scope.cuSelectionMode ? tx('Quitter la sélection') : tx('Sélectionner')}</button>
          <button class="hx-btn ghost" data-action="hx-floors">${tx('Gérer les sections')}</button>
          <button class="hx-btn ghost" data-action="hx-views-manage-open">${tx('Gérer les vues & caractéristiques')}</button>
          <button class="hx-btn ghost" data-action="hx-room-types">${tx('Gérer les catégories')}</button>
          <button data-activation=write class="hx-btn atlas" data-action="hx-room-add">+ ${tx('Ajouter des chambres')}</button>
        </div>
      </div>
      ${chipsHtml}
      ${pendingBulk ? `<div class="hx-room-pending" role="status"><span>${trL({fr:'Une modification groupée attend une confirmation.',en:'A bulk change is awaiting confirmation.',ar:'تعديل جماعي بانتظار التأكيد.'})}</span> <button class="hx-btn ghost" data-action="hx-bulk-resume">${trL({fr:'Vérifier / reprendre',en:'Check / resume',ar:'تحقق / استئناف'})}</button></div>` : ''}
      ${floorRows.length > 1 ? `<div class="hx-floor-tabs">${floorTabs}</div>` : ''}
      ${bulkBar}
      ${floorSections}${noMatch}
    </div>`;
  }

function cuFiltersModal() {
    const st = cuState();
    const floors = cuFloorRows();
    const types = cuTypes();
    const views = cuAllViews();

    const m = K().modal({
      tag: tx('FILTRES'),
      title: tx('Filtrer le plan des chambres'),
      desc: trL({fr:'Combinez les critères : plusieurs étages ou vues, et tous les équipements cochés.',en:'Combine criteria: any selected floor or view, and all selected amenities.',ar:'اجمع المعايير: أي طابق أو إطلالة محددة، وجميع الميزات المحددة.'}),
      width: 580,
      body: `<div class="hx-room-form">
        <fieldset class="hx-filter-group hx-room-form-wide">
          <legend>${tx('Sections & étages')}</legend>
          <div class="hx-filter-checkbox-grid">
            ${floors.map((f) => `<label class="hx-filter-check-label"><input type="checkbox" data-hx-filter-floor="${esc(f.id)}" ${cuRackFilter.floors.has(f.id) || cuRackFilter.floor === f.lbl ? 'checked' : ''}> ${esc(f.name)}</label>`).join('')}
          </div>
        </fieldset>
        <fieldset class="hx-filter-group hx-room-form-wide">
          <legend>${tx('Catégories & types')}</legend>
          <div class="hx-filter-checkbox-grid">
            ${types.map((t) => `<label class="hx-filter-check-label"><input type="checkbox" data-hx-filter-cat="${esc(t.id)}" ${cuRackFilter.categories.has(t.id) ? 'checked' : ''}> ${esc(t.name)}</label>`).join('')}
          </div>
        </fieldset>
        <fieldset class="hx-filter-group hx-room-form-wide">
          <legend>${tx('Vues')}</legend>
          <div style="margin-bottom:8px;">
            <label class="hx-filter-check-label"><input type="checkbox" data-hx-filter-hasview ${cuRackFilter.hasView ? 'checked' : ''}> <b>${tx('Toutes les chambres avec vue')}</b></label>
          </div>
          <div class="hx-filter-checkbox-grid">
            ${views.map((v) => `<label class="hx-filter-check-label"><input type="checkbox" data-hx-filter-view="${esc(v)}" ${cuRackFilter.views.has(v) ? 'checked' : ''}> ${tx('Vue {v}', { v: esc(cuViewLabel(v)) })}</label>`).join('')}
          </div>
        </fieldset>
        <fieldset class="hx-filter-group hx-room-form-wide">
          <legend>${tx('Caractéristiques & équipements (tous requis)')}</legend>
          <div class="hx-filter-checkbox-grid">
            ${cuAllCharacteristics().map((c) => `<label class="hx-filter-check-label"><input type="checkbox" data-hx-filter-char="${esc(c.id)}" ${cuRackFilter.characteristics.has(c.id) ? 'checked' : ''}> ${esc(cuCharLabel(c))}</label>`).join('')}
          </div>
        </fieldset>
        <fieldset class="hx-filter-group hx-room-form-wide">
          <legend>${tx('Agencement & portes')}</legend>
          <label class="hx-filter-check-label"><input type="checkbox" data-hx-filter-connecting ${cuRackFilter.connectingOnly ? 'checked' : ''}> <b>${tx('Uniquement chambres communicantes')}</b></label>
        </fieldset>
      </div>
      <label class="hx-room-form-field">${trL({fr:'Capacité minimale',en:'Minimum capacity',ar:'الحد الأدنى للسعة'})}<input type="number" min="0" max="12" step="1" data-hx-filter-capacity value="${cuRackFilter.minCapacity || 0}"></label>
      <div class="hx-room-form-actions">
        <button class="hx-btn ghost" data-action="hx-filter-modal-reset">${tx('Effacer tout')}</button>
        <button class="hx-btn atlas" data-action="hx-filter-modal-apply">${tx('Appliquer les filtres')}</button>
      </div>`,
    });
    m.el.querySelector('.kiwi-modal')?.classList.add('hx-hotel-modal');
    scope.openModal = { el: m.el, close: m.close };
  }

function cuBulkEditModal(draft) {
    const selectedNumbers = cuSelectedNumbers();
    if (selectedNumbers.length > 200) {
      toast(trL({fr:'Sélectionnez au maximum 200 chambres par modification.',en:'Select up to 200 rooms per bulk change.',ar:'حدد 200 غرفة كحد أقصى لكل تعديل جماعي.'}), {type:'warn'});
      return;
    }
    if (!selectedNumbers.length) {
      K().toast(tx('Aucune chambre sélectionnée'), { type: 'warn' });
      return;
    }
    draft = draft || scope.cuBulkStaged || {};
    const st = cuState();
    const floors = cuFloorRows();
    const types = cuTypes();
    const views = cuAllViews();
    const characteristics = cuAllCharacteristics();

    const m = K().modal({
      tag: tx('MODIFICATION EN BLOC'),
      title: tx('Modifier {n} chambres', { n: selectedNumbers.length, c: txn(selectedNumbers.length, 'chambre') }),
      desc: tx('Seuls les champs avec une modification sélectionnée seront mis à jour.'),
      width: 580,
      body: `<div class="hx-room-form">
        <label><span>${tx('Section / Étage')}</span>
          <select data-hx-bulk-floor-id>
            <option value="">${tx('Ne pas modifier')}</option>
            ${floors.map((f) => `<option value="${esc(f.id)}" ${draft.floorId === f.id ? 'selected' : ''}>${esc(f.name)}</option>`).join('')}
          </select>
        </label>
        <label><span>${tx('Catégorie / Type')}</span>
          <select data-hx-bulk-type-id>
            <option value="">${tx('Ne pas modifier')}</option>
            ${types.map((t) => `<option value="${esc(t.id)}" ${draft.typeId === t.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}
          </select>
        </label>
        <label><span>${tx('Vue')}</span>
          <select data-hx-bulk-view>
            <option value="">${tx('Ne pas modifier')}</option>
            <option value="__CLEAR__" ${draft.view === '' ? 'selected' : ''}>${tx('Retirer la vue')}</option>
            ${views.map((v) => `<option value="${esc(v)}" ${draft.view === v ? 'selected' : ''}>${tx('Vue {v}', { v: esc(cuViewLabel(v)) })}</option>`).join('')}
          </select>
        </label>
        <label><span>${tx('Action sur les équipements')}</span>
          <select data-hx-bulk-char-mode>
            <option value="none" ${(!draft.charMode || draft.charMode === 'none') ? 'selected' : ''}>${tx('Ne pas modifier')}</option>
            <option value="add" ${draft.charMode === 'add' ? 'selected' : ''}>${tx('Ajouter les équipements cochés')}</option>
            <option value="remove" ${draft.charMode === 'remove' ? 'selected' : ''}>${tx('Retirer les équipements cochés')}</option>
            <option value="replace" ${draft.charMode === 'replace' ? 'selected' : ''}>${tx('Remplacer par les équipements cochés')}</option>
          </select>
        </label>
        <div class="hx-room-form-wide">
          <label><span>${tx('Équipements concernés')}</span>
            <div class="hx-char-checkboxes">
              ${characteristics.map((c) => `<label class="hx-char-label"><input type="checkbox" data-hx-bulk-char="${c.id}" ${(draft.characteristics || []).includes(c.id) ? 'checked' : ''}> ${esc(cuCharLabel(c))}</label>`).join('')}
            </div>
          </label>
        </div>
        <p style="font-size:11.5px;color:var(--n-500);margin:8px 0 0;" class="hx-room-form-wide">
          ${tx('Note : Les portes communicantes se configurent chambre par chambre pour garantir la réciprocité physique des accès.')}
        </p>
      </div>
      <div class="hx-room-form-actions">
        <button class="hx-btn ghost" data-action="hx-bulk-cancel">${tx('Annuler')}</button>
        <button class="hx-btn atlas" data-action="hx-bulk-review">${tx('Vérifier avant d’appliquer…')}</button>
      </div>`,
    });
    m.el.querySelector('.kiwi-modal')?.classList.add('hx-hotel-modal');
    scope.openModal = { el: m.el, close: m.close };
  }

function cuBulkReviewModal(plan) {
    plan = plan || scope.cuBulkPlan;
    const selectedNumbers = (plan && plan.targets) ? plan.targets.map((t) => t.n) : cuSelectedNumbers();
    const changes = (plan && plan.changes) ? plan.changes : (scope.cuBulkStaged || {});
    const st = cuState();
    const summaryItems = [];

    if (changes.floorId) {
      summaryItems.push(`<li>${tx('Déplacer vers la section {name}', { name: `<b>${esc(st.floors[changes.floorId]?.name || changes.floorId)}</b>` })}</li>`);
    }
    if (changes.typeId) {
      summaryItems.push(`<li>${tx('Changer de type vers {name}', { name: `<b>${esc(st.roomTypes[changes.typeId]?.name || changes.typeId)}</b>` })}</li>`);
    }
    if (changes.view != null) {
      summaryItems.push(changes.view === '' ? `<li>${tx('Retirer la vue')}</li>` : `<li>${tx('Définir la vue à {v}', { v: `<b>${tx('Vue {v}', { v: esc(cuViewLabel(changes.view)) })}</b>` })}</li>`);
    }
    if (changes.charMode && changes.charMode !== 'none') {
      const labels = (changes.characteristics || []).map((cid) => cuCharLabel(cid)).join(', ');
      const modeLabel = changes.charMode === 'add' ? tx('Ajouter') : changes.charMode === 'remove' ? tx('Retirer') : tx('Remplacer par');
      summaryItems.push(`<li>${tx('Équipements :')} <b>${modeLabel}</b> ${labels ? `(${esc(labels)})` : `(${tx('aucun')})`}</li>`);
    }

    const m = K().modal({
      tag: tx('CONFIRMATION'),
      title: tx('Confirmer la modification de {n} chambres', { n: selectedNumbers.length, c: txn(selectedNumbers.length, 'chambre') }),
      desc: tx('Vérifiez attentivement les modifications avant enregistrement.'),
      width: 540,
      body: `<div style="display:flex;flex-direction:column;gap:14px;font-size:13px;color:var(--ink);">
        <div style="padding:12px 14px;background:var(--n-50,#f7f8f7);border-radius:10px;">
          <b>${tx('{n} chambres concernées :', { n: selectedNumbers.length, c: txn(selectedNumbers.length, 'chambre') })}</b>
          <p style="margin:4px 0 0;color:var(--n-600);font-family:var(--mono);font-size:12px;line-height:1.5;">
            ${selectedNumbers.map((n) => tx('Ch. {n}', { n })).join(', ')}
          </p>
        </div>
        <div>
          <b>${tx('Modifications qui seront appliquées :')}</b>
          <ul style="margin:6px 0 0 18px;padding:0;line-height:1.6;">
            ${summaryItems.join('')}
          </ul>
        </div>
        <p style="margin:0;font-size:11.5px;color:var(--n-500);line-height:1.5;padding:10px 12px;background:var(--surface,#fff);border:1px solid var(--n-200);border-radius:8px;">
          ${tx('Cette modification corrige l’organisation des chambres. Elle ne déplace aucun client et ne modifie aucun folio, séjour ou tarif existant.')}
        </p>
      </div>
      <div class="hx-room-form-actions">
        <p data-hx-bulk-error role="alert" hidden></p>
        <button class="hx-btn ghost" data-action="hx-bulk-back" ${plan?.submitted ? 'disabled' : ''}>${tx('Retour')}</button>
        <button class="hx-btn atlas" data-action="hx-bulk-confirm" ${plan?.needsReview ? 'disabled' : ''}>${tx('Confirmer et appliquer')}</button>
      </div>`,
    });
    m.el.querySelector('.kiwi-modal')?.classList.add('hx-hotel-modal');
    scope.openModal = { el: m.el, close: m.close };
  }

async function cuLoadPerformance(force) {
    const slug = cuMerchantSlug(), st = cuPerfState();
    if (!slug || st.loading || (!force && Date.now() - st.at < 30000)) return;
    st.loading = true;
    const w = cuPerfWindows();
    const read = async (win) => {
      const res = await fetch('/api/hotel/performance?' + new URLSearchParams({ merchant: slug, from: win.from, to: win.to }), { cache: 'no-store' });
      const b = await res.json().catch(() => ({}));
      if (!res.ok || !b.ok) throw new Error(b.error || 'unavailable');
      return b;
    };
    try { const [past, ahead] = await Promise.all([read(w.past), read(w.ahead)]); st.past = past; st.ahead = ahead; st.error = ''; }
    catch (e) { st.error = e.message || 'unavailable'; }
    finally {
      st.loading = false; st.at = Date.now();
      if (scope.openDrawer?.page === 'tarifs') rerender();
    }
  }

function cuFoliosBody() {
    cuWarmStays();
    const fl = Object.values(F());
    /* Les séjours en maison : leur note est le dossier (nuits, formule repas,
     * consommations postées sur la chambre depuis une caisse). La page ne
     * listait que les « folios » du document des chambres, c'est-à-dire les
     * walk-in : « Folios ouverts · 0 » avec trois clients en maison, et un texte
     * qui promettait qu'un check-in ouvre la note et que la taxe de séjour s'y
     * range ligne par ligne, ce que rien ne fait. */
    const rooms = new Map(Object.values(R() || {}).map((r) => [r.id, r]));
    const inHouse = Array.from(cuAllStays().values())
      .filter((b) => b?.hotel && b.status === 'checked_in')
      .sort((x, y) => String(x.hotel.checkOut).localeCompare(String(y.hotel.checkOut)));
    const stayRows = inHouse.map((b) => {
      const room = rooms.get(b.resourceId);
      const nights = b.hotel.dayUse ? 0 : Math.max(1, Math.round((Date.parse(b.hotel.checkOut + 'T12:00:00Z') - Date.parse(b.hotel.checkIn + 'T12:00:00Z')) / 86400000));
      return `
      <div class="hx-arr">
        <span class="tm">${room ? tx('Ch. {n}', { n: esc(room.n) }) : tx('Sans chambre')}</span>
        <div class="who"><b>${esc(b.customer?.name || tx('Voyageur'))}</b><div class="sub">${esc(cuDay(b.hotel.checkIn))}${hxTo()}${esc(cuDay(b.hotel.checkOut))} · ${b.hotel.dayUse ? tx('day-use') : txn(nights, 'nuit')} · ${txn(b.partySize || 1, 'personne')}</div></div>
        <span style="font-family:var(--mono);font-weight:600;">${MAD(+b.hotel.total || 0)}</span>
        <button class="hx-btn ghost" data-action="hx-dossier" data-arg="${esc(b.id)}">${tx('Ouvrir le dossier')}</button>
      </div>`;
    }).join('');
    const rows = fl.map((f) => `
      <div class="hx-arr">
        <span class="tm">${tx('Ch. {n}', { n: f.room })}</span>
        <div class="who"><b>${esc(f.guest)}</b><div class="sub">${tx('walk-in')} · ${txn(f.nights, 'nuit')} · ${txn(f.pax, 'personne')} · ${txn(f.lines.length, 'ligne')}</div></div>
        <span style="font-family:var(--mono);font-weight:600;">${MAD(folioTotal(f))}</span>
        <button class="hx-btn ghost" data-action="hx-folio" data-arg="${f.room}">${tx('Ouvrir')}</button>
      </div>`).join('');
    const known = cuStaysKnown();
    scope.cuStripUnknown = !known;
    const total = inHouse.length + fl.length;
    return `<div class="hx-page">
      <div class="hx-h"><span class="t">${tx('Notes en cours')} · ${known ? total : '·'}</span><span class="s">${tx('séjours en maison et ventes walk-in, une note par séjour')}</span></div>
      ${inHouse.length ? `<div class="block" style="padding:8px 14px;"><div class="hx-h" style="margin:6px 0;"><span class="t" style="font-size:13px;">${tx('Séjours en maison')} · ${inHouse.length}</span><span class="s">${tx('le montant est celui du séjour (logement et formule) ; les consommations postées depuis une caisse s’ajoutent dans le dossier')}</span></div><div class="hx-list">${stayRows}</div></div>` : ''}
      ${fl.length ? `<div class="block" style="padding:8px 14px;${inHouse.length ? 'margin-top:14px;' : ''}"><div class="hx-h" style="margin:6px 0;"><span class="t" style="font-size:13px;">${tx('Ventes walk-in')} · ${fl.length}</span></div><div class="hx-list">${rows}</div></div>` : ''}
      ${total ? '' : `<div class="block" style="padding:8px 14px;">${cuStarter(
          known ? tx('Aucune note en cours.') : tx('Lecture des séjours…'),
          tx('Un séjour passe en maison au check-in, depuis la Réception. Son dossier regroupe les nuits, la formule repas et les consommations postées sur la chambre depuis une caisse.'),
          [tx('Check-in et check-out depuis la Réception'), tx('Consommations de la caisse postées sur la chambre'), tx('Note détaillée imprimable depuis le dossier')],
          `<button class="hx-btn atlas" data-action="nav-reception">${tx('Ouvrir la Réception')}</button>`
        )}</div>`}
    </div>`;
  }

function cuSejoursBody() {
    if (scope.cuStayView === 'availability') return cuSejoursAvailabilityBody();
    const st = cuState();
    const rooms = Object.values(st.rooms || {}).sort((a, b) => a.n - b.n);
    const allStaysMap = cuAllStays();
    const active = { requested: 1, confirmed: 1, checked_in: 1 };
    const channels = { direct: tx('Direct'), booking: 'Booking.com', airbnb: 'Airbnb', expedia: 'Expedia', walkin: tx('Walk-in'), other: tx('Autre OTA') };
    const today = new (globalThis.KiwiZoneLaw?.DateTimeFormat || Intl.DateTimeFormat)('en-CA', { timeZone: 'Africa/Casablanca', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const add = (ymd, n) => { const d = new Date(ymd + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
    const distance = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 86400000);
    const start = add(today, scope.cuTapeOffset);
    const end = add(start, 14);
    const dates = Array.from({ length: 14 }, (_, i) => add(start, i));
    const real = Array.from(allStaysMap.values()).filter((b) => b.hotel && b.hotel.checkIn && b.hotel.checkOut && b.status !== 'cancelled' && b.status !== 'no_show');

    const matched = new Set(real.map((b) => b.resourceId));
    const walkins = Object.values(st.folios || {}).filter((f) => f && !matched.has(st.rooms?.[f.room]?.id)).map((f) => {
      const room = st.rooms?.[f.room], stamp = +f.updatedAt || Date.now();
      const cin = new (globalThis.KiwiZoneLaw?.DateTimeFormat || Intl.DateTimeFormat)('en-CA', { timeZone: 'Africa/Casablanca', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(stamp));
      return room ? { id: 'folio:' + room.id, resourceId: room.id, customer: { name: f.guest || room.guest || tx('Walk-in') }, status: 'checked_in', hotel: { checkIn: cin, checkOut: add(cin, +f.nights || 1), channel: 'walkin', roomTypeName: roomTypeOf(room.n).name } } : null;
    }).filter(Boolean);
    const stays = real.concat(walkins);
    const hourFraction = (value, fallback) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value || '') ? (Number(value.slice(0,2)) + Number(value.slice(3))/60)/24 : fallback/24;
    const barsFor = (room) => stays.filter((b) => b.resourceId === room.id && b.hotel.checkIn < end && b.hotel.checkOut >= start).map((b) => {
      const from = Math.max(0, distance(start, b.hotel.checkIn) + hourFraction(b.hotel.arrivalTime,15));
      const to = Math.min(14, distance(start, b.hotel.checkOut) + hourFraction(b.hotel.departureTime,11));
      const channel = channels[b.hotel.channel] ? b.hotel.channel : (b.source === 'public' ? 'direct' : 'other');
      const left = from / 14 * 100, width = Math.max(.1, (to - from) / 14 * 100);
      const caption=(b.hotel.dayUse?tx('Day-use')+' · '+b.hotel.arrivalTime+'–'+b.hotel.departureTime:channels[channel]);
      return `<button data-activation=write class="hx-cu-stay src-${channel} status-${esc(b.status)} ${b.hotel.conflict ? 'has-conflict' : ''}" style="left:${left}%;width:calc(${width}% - 1px)" data-action="hx-stay-edit" data-arg="${esc(b.id)}" title="${esc((b.hotel.conflict ? tx('CONFLIT À RÉSOUDRE') + ' · ' : '') + (b.customer?.name || '') + ' · ' + caption + ' · ' + cuDay(b.hotel.checkIn) + hxTo() + cuDay(b.hotel.checkOut))}"><b>${esc(b.customer?.name || tx('Séjour'))}</b><span>${b.hotel.conflict ? '⚠ ' + tx('CONFLIT') : esc(caption)}</span></button>`;
    }).join('');
    const dateHead = dates.map((d) => { const dt = new Date(d + 'T12:00:00Z'); return `<div class="${d === today ? 'today' : ''}"><b>${HX_WEEKDAYS[hxLang()][dt.getUTCDay()].replace('.', '')}</b><span>${dt.getUTCDate()}</span></div>`; }).join('');
    const rows = rooms.map((room) => `<div class="hx-cu-tape-row"><div class="hx-cu-room"><b>${room.n}</b><span>${esc(roomTypeOf(room.n).name)}</span></div><div class="hx-cu-days">${dates.map((d) => `<i class="${d === today ? 'today' : ''}"></i>`).join('')}${barsFor(room)}</div></div>`).join('');
    const occupancy = dates.map((d) => {
      const count = rooms.filter((r) => stays.some((b) => b.resourceId === r.id && active[b.status] && b.hotel.checkIn <= d && b.hotel.checkOut > d)).length;
      const pct = rooms.length ? Math.round(count / rooms.length * 100) : 0;
      return `<div class="${d === today ? 'today' : ''}" title="${tx('{n} / {total} chambres', { n: count, total: rooms.length })}"><b>${pct}%</b><span>${count}</span></div>`;
    }).join('');
    return `<div class="hx-page">
      ${cuStrip()}
      <div class="hx-cu-tape block">
        <div class="hx-cu-tape-head"><div><span class="hx-kicker">${tx('DISPONIBILITÉ UNIFIÉE')}</span><h3>${tx('Chambres × 14 jours')}</h3><p>${tx('Direct, saisie manuelle et OTA bloquent tous la même chambre.')}</p></div><div class="hx-cu-tape-actions"><button type="button" class="hx-btn ghost" data-action="hx-tape-prev" aria-label="${tx('14 jours précédents')}">←</button><button type="button" class="hx-btn ghost" data-action="hx-tape-today">${tx('Aujourd’hui')}</button><button type="button" class="hx-btn ghost" data-action="hx-tape-next" aria-label="${tx('14 jours suivants')}">→</button><button type="button" class="hx-btn ghost" data-action="hx-dispo">${tx('Disponibilités')}</button>${cuHasGroupRecovery() ? `<button type="button" class="hx-btn ghost" data-action="hx-group-resume">${tx('Reprendre le dossier groupe')}</button>` : ''}<button type="button" class="hx-btn ghost" data-action="hx-group-new">+ ${tx('Réservation de groupe')}</button><button type="button" class="hx-btn atlas" data-action="hx-stay-new">+ ${tx('Réservation')}</button></div></div>
        <div class="hx-cu-legend">${Object.keys(channels).map((c) => `<span class="src-${c}"><i></i>${channels[c]}</span>`).join('')}</div>
        ${rooms.length ? `<div class="hx-cu-tape-scroll"><div class="hx-cu-tape-grid"><div class="hx-cu-date-row"><div class="hx-cu-room"><span>${tx('CHAMBRE')}</span></div><div class="hx-cu-date-days">${dateHead}</div></div>${rows}<div class="hx-cu-occupancy"><div class="hx-cu-room"><b>${tx('Occupation')}</b><span>${tx('vendues')}</span></div><div>${occupancy}</div></div></div></div>` : `<div class="hx-cu-tape-empty"><b>${tx('Ajoutez d’abord vos chambres')}</b><p>${tx('Le tape chart attribue chaque séjour à une chambre réelle.')}</p><button data-activation=write class="hx-btn atlas" data-action="hx-room-add">${tx('Configurer les chambres')}</button></div>`}
      </div>
    </div>`;
  }

function cuDispoBody(ym, days) {
    const st = cuState();
    const today = new (globalThis.KiwiZoneLaw?.DateTimeFormat || Intl.DateTimeFormat)('en-CA', { timeZone: 'Africa/Casablanca', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const rooms = Object.values(st.rooms || {});
    const byId = new Map(rooms.map((r) => [r.id, r]));
    const sellable = rooms.filter((r) => r.status !== 'hs');
    const cats = new Map();
    for (const r of sellable) {
      const key = r.typeId || roomTypeOf(r.n).name;
      if (!cats.has(key)) cats.set(key, { name: roomTypeOf(r.n).name, rooms: [] });
      cats.get(key).rooms.push(r);
    }
    const visibleCats = [...cats.values()].filter((c) => scope.cuDispoCat === 'all' || c.name === scope.cuDispoCat);
    const occupying = ['requested', 'confirmed', 'checked_in', 'completed'];
    const occ = new Map();
    let unassigned = 0;
    for (const b of cuAllStays().values()) {
      if (!b || !b.hotel || !b.hotel.checkIn || !b.hotel.checkOut || !occupying.includes(b.status)) continue;
      if (b.hotel.checkOut <= days[0] || b.hotel.checkIn > days[days.length - 1]) continue;
      const room = b.resourceId ? byId.get(b.resourceId) : null;
      if (!room || room.status === 'hs') { if (!room && b.status !== 'completed') unassigned++; continue; }
      for (const d of days) {
        if (b.hotel.checkIn <= d && b.hotel.checkOut > d) {
          const key = d + '|' + room.id;
          occ.set(key, true);
        }
      }
    }
    const occIn = (catRooms, d) => catRooms.filter((r) => occ.has(d + '|' + r.id)).length;
    const head = days.map((d) => { const dt = new Date(d + 'T12:00:00Z'); return `<th class="${d === today ? 'today' : ''}"><b>${new (globalThis.KiwiZoneLaw?.DateTimeFormat || Intl.DateTimeFormat)(hxLocale(), { weekday: 'narrow', timeZone: 'UTC' }).format(dt)}</b><span>${dt.getUTCDate()}</span></th>`; }).join('');
    const catRows = visibleCats.map((c) => `<tr><th scope="row">${esc(c.name)}<small>${c.rooms.length}</small></th>${days.map((d) => `<td class="${d === today ? 'today' : ''}" title="${tx('{n} occupée(s) sur {total}', { n: occIn(c.rooms, d), total: c.rooms.length })}">${occIn(c.rooms, d) || ''}</td>`).join('')}</tr>`).join('');
    const totals = days.map((d) => {
      const o = visibleCats.reduce((s, c) => s + occIn(c.rooms, d), 0);
      const s = visibleCats.reduce((sum, c) => sum + c.rooms.length, 0);
      return { o, f: Math.max(0, s - o), s };
    });
    const monthLabel = new (globalThis.KiwiZoneLaw?.DateTimeFormat || Intl.DateTimeFormat)(hxLocale(), { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(days[0] + 'T12:00:00Z'));
    const loadErr = tx((cuStayLoads.get(cuStayScope()) || {}).error || '');
    const sellableCount = visibleCats.reduce((s, c) => s + c.rooms.length, 0);
    return `<div class="hx-dispo-bar"><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
        <button type="button" class="hx-btn ghost" data-action="hx-dispo-prev" aria-label="${tx('Mois précédent')}">${hxLang() === 'ar' ? '→' : '←'}</button>
        <strong style="min-width:140px;text-align:center;">${esc(monthLabel)}</strong>
        <button type="button" class="hx-btn ghost" data-action="hx-dispo-next" aria-label="${tx('Mois suivant')}">${hxLang() === 'ar' ? '←' : '→'}</button>
        <button type="button" class="hx-btn ghost" data-action="hx-dispo-today">${tx('Ce mois')}</button>
        <select data-hx-dispo-cat data-hx-dispo-page-select aria-label="${tx('Catégorie')}">
          <option value="all">${tx('Toutes catégories')}</option>
          ${[...cats.values()].map((c) => `<option value="${esc(c.name)}" ${scope.cuDispoCat === c.name ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
        </select>
        <button type="button" class="hx-btn ghost" data-action="hx-dispo-refresh">${tx('Actualiser')}</button>
      </div><small>${tx('{n} chambres vendables', { n: sellableCount, c: txn(sellableCount, 'chambre') })}${unassigned ? ' · ' + tx('{n} séjour(s) sans chambre attribuée', { n: unassigned, c: txn(unassigned, 'sejour') }) : ''}</small></div>
      ${loadErr ? `<div class="hx-billing-notice" role="alert">${esc(loadErr)}</div>` : ''}
      ${visibleCats.length ? `<div class="hx-dispo-scroll"><table class="hx-dispo-table"><thead><tr><th scope="col">${tx('Catégorie')}</th>${head}</tr></thead><tbody>
        ${catRows}
        <tr class="hx-dispo-total"><th scope="row">${tx('Occupées')}</th>${totals.map((t, i) => `<td class="${days[i] === today ? 'today' : ''}">${t.o || ''}</td>`).join('')}</tr>
        <tr class="hx-dispo-total hx-dispo-free"><th scope="row">${tx('Libres')}</th>${totals.map((t, i) => `<td class="${days[i] === today ? 'today' : ''}">${t.f}</td>`).join('')}</tr>
      </tbody></table></div>` : `<p>${tx('Aucune chambre vendable. Ajoutez vos chambres puis revenez.')}</p>`}`;
  }

function cuStayEditor(booking, linked = null) {
    const st = cuState(), types = cuTypes(), rooms = Object.values(st.rooms || {}).sort((a, b) => a.n - b.n);
    if (!types.length || !rooms.length) { toast(tx('Configurez vos chambres d’abord'), { type: 'warn' }); return; }
    const statusLabels = { requested: tx('Demandée'), confirmed: tx('Confirmée'), checked_in: tx('Client arrivé'), completed: tx('Terminée'), cancelled: tx('Annulée'), no_show: tx('No-show') };
    const nextStatuses = {
      requested: ['requested', 'confirmed', 'no_show'],
      confirmed: ['confirmed', 'checked_in', 'no_show'],
      checked_in: ['checked_in', 'completed'],
      completed: ['completed'], cancelled: ['cancelled'], no_show: ['no_show'],
    };
    const currentStatus = booking?.status || 'confirmed';
    const statusChoices = booking ? (nextStatuses[currentStatus] || [currentStatus]) : ['requested', 'confirmed', 'checked_in'];
    const today = new (globalThis.KiwiZoneLaw?.DateTimeFormat || Intl.DateTimeFormat)('en-CA', { timeZone: 'Africa/Casablanca', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const add = (ymd, n) => { const d = new Date(ymd + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
    const typeId = booking?.serviceId || types[0].id;
    const existingGuests = Array.isArray(booking?.guests) && booking.guests.length ? booking.guests : (
      booking?.customer?.name ? [{ name: booking.customer.name, sex: '', nationality: '', residenceCountry: '', birthDate: '', idDocType: '', idDocNumber: '', minorsUnder18: 0 }] : [{ name: '', sex: '', nationality: '', residenceCountry: '', birthDate: '', idDocType: '', idDocNumber: '', minorsUnder18: 0 }]
    );
    const guestRowHtml = (g, idx) => `
      <div class="hx-guest-item" data-hx-guest-row data-hx-guest-id="${esc(g.id || ('gst_' + crypto.randomUUID().slice(0, 12)))}">
        <div class="hx-guest-head">
          <span>${tx('VOYAGEUR {n}', { n: idx + 1 })}</span>
          ${idx > 0 ? `<button type="button" class="hx-link-btn hx-guest-remove" data-action="hx-remove-guest-row">${tx('Retirer')}</button>` : ''}
        </div>
        <div class="hx-guest-grid">
          <label><span>${tx('Nom complet')}</span><input data-hx-guest-name placeholder="${tx('Nom et prénom')}" value="${esc(g.name || '')}"></label>
          <label><span>${tx('Sexe')}</span><select data-hx-guest-sex>
            <option value="">${tx('Indéterminé')}</option>
            <option value="M" ${g.sex === 'M' ? 'selected' : ''}>${tx('Masculin (M)')}</option>
            <option value="F" ${g.sex === 'F' ? 'selected' : ''}>${tx('Féminin (F)')}</option>
          </select></label>
          <label><span>${tx('Nationalité')}</span>${cuNationalitySelectorHtml(g, idx)}</label>
          <label><span>${tx('Date de naissance')}</span><input data-hx-guest-birth inputmode="numeric" autocomplete="off" maxlength="10" dir="ltr" placeholder="${tx('JJ/MM/AAAA')}" value="${esc(cuBirthDisplay(g.birthDate))}"></label>
          <label><span>${tx('Mineurs accompagnants')}</span><input type="number" min="0" max="10" step="1" data-hx-guest-minors value="${esc(g.minorsUnder18 || 0)}"></label>
          <label><span>${tx('Pays de résidence')}</span><input data-hx-guest-residence placeholder="${tx('Ex. Maroc, France')}" value="${esc(g.residenceCountry || '')}"></label>
          <label><span>${tx('Type de pièce')}</span><select data-hx-guest-id-type>
            <option value="">${tx('Sélectionner')}</option>
            <option value="CNIE" ${g.idDocType === 'CNIE' ? 'selected' : ''}>${tx('CNIE (Maroc)')}</option>
            <option value="passeport" ${g.idDocType === 'passeport' ? 'selected' : ''}>${tx('Passeport')}</option>
            <option value="carte_sejour" ${g.idDocType === 'carte_sejour' ? 'selected' : ''}>${tx('Carte de séjour')}</option>
            <option value="autre" ${g.idDocType === 'autre' ? 'selected' : ''}>${tx('Autre pièce')}</option>
          </select></label>
          <label><span>${tx('N° de document')}</span><input data-hx-guest-id-num dir="ltr" placeholder="${tx('Ex. AB123456')}" value="${esc(g.idDocNumber || '')}"></label>
        </div>
      </div>
    `;
    const m = K().modal({ tag: booking ? booking.code || tx('SÉJOUR') : tx('NOUVEAU SÉJOUR'), title: booking ? tx('Modifier la réservation') : tx('Ajouter une réservation'), desc: tx('La chambre est contrôlée et bloquée côté serveur avant confirmation.'), width: 720,
      body: `<form class="hx-stay-form" data-hx-stay-form>
        ${linked ? `<p class="hx-commercial-stay">${tx('Nouvelle chambre du dossier {code}. Sa disponibilité, ses voyageurs et son annulation restent indépendants.', { code: esc(linked.code) })}</p>` : ''}
        ${booking ? `<div class="hx-room-form-actions"><button type="button" class="hx-btn ghost" data-action="hx-dossier" data-arg="${esc(booking.id)}">${tx('Chambres & facturation du dossier')}</button></div>` : ''}
        <div class="hx-room-form hx-type-form">
          <label class="hx-room-form-wide"><span>${tx('Nom du client')}</span><input name="name" maxlength="100" required value="${esc(booking?.customer?.name || '')}" placeholder="${tx('Nom et prénom')}"></label>
          <label><span>${tx('Arrivée')}</span><input name="checkIn" type="date" required value="${esc(booking?.hotel?.checkIn || today)}"></label>
          <label><span>${tx('Départ')}</span><input name="checkOut" type="date" required value="${esc(booking?.hotel?.checkOut || add(today, 1))}"></label>
          <label class="hx-room-form-wide"><span>${tx('Type de séjour')}</span><select name="stayMode" ${booking ? 'disabled' : ''}><option value="overnight">${tx('Avec nuitée')}</option><option value="day_use" ${booking?.hotel?.dayUse ? 'selected' : ''}>${tx('Day-use · sans nuitée')}</option></select></label>
          <label data-hx-day-use hidden><span>${tx('Heure d’arrivée')}</span><input name="arrivalTime" type="time" value="${esc(booking?.hotel?.arrivalTime || '09:00')}"></label>
          <label data-hx-day-use hidden><span>${tx('Heure de départ')}</span><input name="departureTime" type="time" value="${esc(booking?.hotel?.departureTime || '18:00')}"></label>
          <label data-hx-day-use hidden><span>${tx('Forfait day-use TTC · MAD')}</span><input name="dayUsePrice" inputmode="decimal" placeholder="${tx('Montant convenu')}" value="${booking?.hotel?.dayUse ? (booking.hotel.total || 0).toFixed(2) : ''}"></label>
          <label><span>${tx('Catégorie')}</span><select name="roomTypeId">${types.map((t) => `<option value="${esc(t.id)}" ${t.id === typeId ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></label>
          <label><span>${tx('Chambre')}</span><select name="resourceId"><option value="">${tx('Attribution automatique')}</option>${rooms.map((r) => `<option value="${esc(r.id)}" data-type="${esc(r.typeId)}" ${r.id === booking?.resourceId ? 'selected' : ''}>${tx('Ch. {n}', { n: r.n })} · ${esc(roomTypeOf(r.n).name)}</option>`).join('')}</select></label>
          <label><span>${tx('Canal')}</span><select name="channel"><option value="direct">${tx('Direct')}</option><option value="booking">Booking.com</option><option value="airbnb">Airbnb</option><option value="expedia">Expedia</option><option value="walkin">${tx('Walk-in')}</option><option value="other">${tx('Autre OTA')}</option></select></label>
          <label><span>${tx('Statut')}</span><select name="status">${statusChoices.map((value) => `<option value="${value}">${statusLabels[value]}</option>`).join('')}</select></label>
          <label><span>${tx('Voyageurs')}</span><input name="partySize" type="number" min="1" max="12" value="${booking?.partySize || 1}"><small class="hx-capacity-hint" data-hx-capacity-hint></small></label>
          <label><span>${tx('Référence OTA')} <small>· ${tx('optionnel')}</small></span><input name="externalRef" maxlength="80" dir="ltr" value="${esc(booking?.hotel?.externalRef || '')}" placeholder="${tx('Ex. 4219-8840')}"></label>
          <label><span>${tx('Téléphone')} <small>· ${tx('optionnel')}</small></span><input name="phone" maxlength="32" dir="ltr" value="${esc(booking?.customer?.phone || '')}"></label>
          <label><span>${tx('E-mail')} <small>· ${tx('optionnel')}</small></span><input name="email" type="email" maxlength="160" dir="ltr" value="${esc(booking?.customer?.email || '')}"></label>
          <fieldset class="hx-room-form-wide hx-commercial-stay" data-hx-commercial-stay><legend>${tx('Compte & formule de réservation')}</legend><p role="status">${tx('Chargement des comptes…')}</p></fieldset>
          <div class="hx-room-form-wide hx-guest-block">
            <div class="hx-guest-block-head">
              <b>${tx('Fiche voyageurs · identité et séjour')}</b>
              <button data-activation=write type="button" class="hx-link-btn hx-guest-add" data-action="hx-add-guest-row">+ ${tx('Ajouter un voyageur')}</button>
            </div>
            <div data-hx-guests-container>
              ${existingGuests.map(guestRowHtml).join('')}
            </div>
          </div>
          <label class="hx-room-form-wide"><span>${tx('Note interne')}</span><textarea name="note" maxlength="600" rows="3">${esc(booking?.note || '')}</textarea></label>
        </div><p class="hx-stay-error" data-hx-stay-error role="status"></p><div class="hx-room-form-actions">${booking && ['requested', 'confirmed'].includes(booking.status) ? `<button type="button" class="hx-btn warn" data-action="hx-stay-cancel" data-arg="${esc(booking.id)}">${tx('Annuler le séjour')}</button>` : '<span></span>'}<button data-activation=write class="hx-btn atlas" type="submit">${booking ? tx('Enregistrer les modifications') : (booking?.status === 'requested' ? tx('Poser une option (bloquer la chambre)') : tx('Confirmer la réservation'))}</button></div>
      </form>` });
    const form = m.el.querySelector('[data-hx-stay-form]');
    form.__hxStayScope = cuStayScope();
    form.__hxClientRef = booking?.publicRef || ('staff-' + crypto.randomUUID());
    form.__hxLinkedStayId = linked?.id || '';
    if (linked) {
      ['checkIn','checkOut'].forEach(k => { form.elements[k].value = linked.hotel[k]; });
      ['name','phone','email'].forEach(k => { form.elements[k].value = linked.customer?.[k] || ''; });
      if (linked.hotel.dayUse) form.elements.stayMode.value = 'day_use';
    }
    const submitBtn = form.querySelector('[type="submit"]');
    const updateSubmitButton = () => {
      if (booking) {
        submitBtn.textContent = tx('Enregistrer les modifications');
        return;
      }
      const val = form.elements.status?.value;
      if (val === 'requested') {
        submitBtn.textContent = tx('Poser une option (bloquer la chambre)');
      } else {
        submitBtn.textContent = tx('Confirmer la réservation');
      }
    };
    form.elements.status.addEventListener('change', updateSubmitButton);
    updateSubmitButton();

    let capacityMsg = '';
    const updateCapacityValidation = () => {
      const selectedTypeId = form.elements.roomTypeId.value;
      const typeObj = types.find(t => t.id === selectedTypeId);
      const maxGuests = typeObj?.maxGuests || 4;
      form.elements.partySize.max = maxGuests;
      const hint = form.querySelector('[data-hx-capacity-hint]');
      if (hint) hint.textContent = tx('Capacité max : {n} pers.', { n: maxGuests });
      const currentParty = Number(form.elements.partySize.value) || 1;
      const err = form.querySelector('[data-hx-stay-error]');
      if (currentParty > maxGuests) {
        capacityMsg = tx('La catégorie « {name} » ne peut pas accueillir {n} personnes (max : {max}). Réduisez le nombre de personnes.', { name: typeObj?.name || selectedTypeId, n: currentParty, c: txn(currentParty, 'personne'), max: maxGuests });
        if (err) err.textContent = capacityMsg;
        submitBtn.disabled = true;
      } else {
        // Cleared by identity, not by its words: it is no longer French under English or Arabic.
        if (err && capacityMsg && err.textContent === capacityMsg) err.textContent = '';
        capacityMsg = '';
        submitBtn.disabled = false;
      }
    };
    form.elements.roomTypeId.addEventListener('change', updateCapacityValidation);
    form.elements.partySize.addEventListener('input', updateCapacityValidation);
    updateCapacityValidation();

    const toggleDayUse = () => {
      const day = form.elements.stayMode.value === 'day_use';
      form.querySelectorAll('[data-hx-day-use]').forEach(el => { el.hidden = !day; });
      form.elements.checkOut.readOnly = day;
      if (day) form.elements.checkOut.value = form.elements.checkIn.value;
      else if (form.elements.checkOut.value <= form.elements.checkIn.value) form.elements.checkOut.value = add(form.elements.checkIn.value, 1);
      form.elements.dayUsePrice.required = day;
      if (day && form.elements.priceMode) { form.elements.priceMode.value = 'catalogue'; form.elements.board.value = 'room_only'; }
      if (form.elements.priceMode) form.elements.priceMode.disabled = day;
      if (form.elements.board) form.elements.board.disabled = day;
      const quoteButton = form.querySelector('[data-hx-quote]'); if (quoteButton) quoteButton.hidden = day || !form.elements.accountId?.value;
    };
    form.elements.stayMode.addEventListener('change', toggleDayUse);
    form.elements.checkIn.addEventListener('change', toggleDayUse); toggleDayUse();
    // A stay typed at the desk is direct unless staff pick an OTA; an older stay with no channel stays « Autre OTA ».
    form.elements.channel.value = booking?.hotel?.channel || (!booking || booking.source === 'public' ? 'direct' : 'other');
    form.elements.status.value = booking?.status || 'confirmed';
    updateSubmitButton();
    const filterRooms = () => { const selected = form.elements.resourceId.value; Array.from(form.elements.resourceId.options).forEach((o, i) => { if (!i) return; o.hidden = o.dataset.type !== form.elements.roomTypeId.value; }); if (selected && form.elements.resourceId.selectedOptions[0]?.hidden) form.elements.resourceId.value = ''; };
    form.elements.roomTypeId.addEventListener('change', filterRooms); filterRooms();
    form.addEventListener('click', (e) => {
      if (e.target.closest('[data-action="hx-add-guest-row"]')) {
        const c = form.querySelector('[data-hx-guests-container]');
        if (c) {
          const count = c.querySelectorAll('[data-hx-guest-row]').length;
          const wrap = document.createElement('div');
          wrap.innerHTML = guestRowHtml({}, count);
          const newRow = wrap.firstElementChild;
          c.appendChild(newRow);
          cuWireNationalitySelectors(newRow);
        }
      } else if (e.target.closest('[data-action="hx-remove-guest-row"]')) {
        const row = e.target.closest('[data-hx-guest-row]');
        if (row) row.remove();
      }
    });
    form.addEventListener('submit', (e) => { e.preventDefault(); cuSubmitStay(form, booking, m); });
    cuWireStayCommercial(form, booking).then(() => { toggleDayUse(); if (typeof Event === 'function' && typeof form.dispatchEvent === 'function') form.dispatchEvent(new Event('hx-refresh-direct')); });
    cuWireNationalitySelectors(form);
    scope.openModal = { el: m.el, close: m.close };
  }

async function cuOpenDossier(booking) {
    const scope=cuStayScope(),merchant=cuChannelMerchant(),id=booking.hotel.dossierId||booking.id;
    scope.openModal?.close?.();
    const m=K().modal({tag:booking.code || tx('DOSSIER'),title:tx('Chambres & préfacture'),desc:tx('Les chambres restent modifiables et annulables séparément.'),width:1080,
      body:`<div class="hx-room-form-actions"><button data-activation=write type="button" class="hx-btn ghost" data-hx-linked-room>${tx('Ajouter une chambre au dossier')}</button></div><div data-hx-dossier-body role="status">${tx('Chargement du dossier serveur…')}</div>`});
    scope.openModal={el:m.el,close:m.close};
    const host=m.el.querySelector('[data-hx-dossier-body]');
    m.el.querySelector('[data-hx-linked-room]').onclick=()=>{m.close();if(scope===cuStayScope())cuStayEditor(null,booking);};
    try{
      const res=await fetch('/api/hotel/billing-draft?'+new URLSearchParams({merchant,dossierId:id})),data=await res.json().catch(()=>({}));
      if(scope!==cuStayScope()||m.el.isConnected===false)return;
      if(!res.ok){
        const code=data?.error;
        if(code==='dossier-not-found')throw new Error(tx('Dossier introuvable. Actualisez la réception puis rouvrez-le.'));
        if(code==='unauthorized')throw new Error(tx('Session expirée. Reconnectez-vous puis rouvrez le dossier.'));
        if(code==='invalid-dossier')throw new Error(tx('Dossier illisible. Actualisez la réception.'));
        throw new Error(tx('Préfacturation indisponible. Aucune donnée comptable n’a été modifiée.'));
      }
      host.innerHTML=cuBillingBody(data); host.removeAttribute('role');
      const error=host.querySelector('[data-hx-billing-error],[data-hx-dossier-error]');
      host.querySelectorAll('[data-hx-open-stay]').forEach(button=>button.onclick=async()=>{
        if(scope!==cuStayScope()){m.close();return;}
        const response=await fetch('/api/hotel/stays?'+new URLSearchParams({merchant,id:button.dataset.hxOpenStay,includeCancelled:'1'}));
        const body=await response.json();if(scope!==cuStayScope())return;
        const stay=body.stays?.find(b=>b.id===button.dataset.hxOpenStay);
        if(!response.ok||!stay){if(error)error.textContent=tx('Séjour introuvable. Actualisez la réception.');return;}
        cuStayCache().set(stay.id,stay);m.close();cuStayEditor(stay);
      });
      const form=host.querySelector('[data-hx-billing-form]');
      if(form){
      const formError=form.querySelector('[data-hx-billing-error]');
      let extras=data.stale?[]:(data.saved?.input?.extras||[]),pending=null,dirty=false;
      const dirtyNow=()=>{dirty=true;pending=null;form.querySelector('[data-hx-print-draft]').disabled=true;};
      const summary=()=>{
        try{
          const input=cuDraftInput(form,extras),totals=new Map();
          input.allocations.forEach(a=>a.parts.forEach(p=>totals.set(p.payer,(totals.get(p.payer)||0)+p.amountCents)));
          form.querySelector('[data-hx-billing-summary]').innerHTML=[...totals].map(([payer,amount])=>`<span>${esc(data.source.payers.find(p=>p.id===payer)?.name||tx('Payeur'))} <b>${ltr(cuDraftMoney(amount) + ' MAD')}</b></span>`).join('');
          host.querySelector('[data-hx-draft-total]').textContent=cuDraftMoney([...totals.values()].reduce((a,b)=>a+b,0))+' MAD';
          error.textContent='';
        }catch(e){error.textContent=e.message;}
      };
      form.addEventListener('input',()=>{dirtyNow();summary();}); form.addEventListener('change',()=>{dirtyNow();summary();});
      host.querySelector('[data-hx-reset-draft]')?.addEventListener('click',()=>{form.querySelector('fieldset').disabled=false;dirtyNow();error.textContent=tx('Les anciens suppléments et répartitions seront remplacés uniquement après enregistrement.');});
      form.querySelector('[data-hx-add-extra]').onclick=()=>{
        const raw=form.elements.extraPrice.value.trim().replace(',','.'),quantity=Number(form.elements.extraQuantity.value),label=form.elements.extraLabel.value.trim(),date=form.elements.extraDate.value;
        if(!label||!date||!/^\d{1,7}(\.\d{1,2})?$/.test(raw)||!Number.isInteger(quantity)||quantity<1||quantity>10000){error.textContent=tx('Complétez la date, le libellé, la quantité et le prix du supplément.');return;}
        const e={id:'ex-'+crypto.randomUUID(),date,label,quantity,unitCents:Math.round(Number(raw)*100),payer:data.source.payers.find(p=>p.kind==='individual')?.id||data.source.payers[0]?.id};
        extras.push(e);const wrap=document.createElement('div');wrap.innerHTML=cuBillingLine({...e,id:'extra:'+e.id,kind:'extra',amountCents:e.unitCents*quantity},data.source.payers);
        form.querySelector('[data-hx-billing-lines]').appendChild(wrap.firstElementChild);dirtyNow();summary();form.elements.extraLabel.value='';
      };
      form.addEventListener('click',e=>{const button=e.target.closest('[data-hx-remove-extra]');if(!button)return;const row=button.closest('[data-hx-billing-line]');extras=extras.filter(x=>'extra:'+x.id!==row.dataset.hxBillingLine);row.remove();dirtyNow();summary();});
      form.querySelector('[data-hx-print-draft]').onclick=()=>{if(scope===cuStayScope()&&!dirty&&data.saved)cuPrintDraft(data.saved);};
      form.onsubmit=async e=>{
        e.preventDefault();if(form.__saving||scope!==cuStayScope())return;
        try{
          const input=cuDraftInput(form,extras);
          pending ||= {action:'save-draft',merchant,dossierId:id,rev:data.rev,sourceDigest:data.sourceDigest,directoryRev:data.directoryRev,commandId:'draft-'+crypto.randomUUID(),input};
          form.__saving=true;form.querySelector('fieldset').disabled=true;error.textContent=tx('Enregistrement serveur…');
          const response=await fetch('/api/hotel/billing-draft',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(pending)}),body=await response.json();
          if(scope!==cuStayScope())return;
          if(!response.ok)throw new Error(body.error==='draft-stale'?tx('Le dossier ou ses comptes ont changé. Rouvrez-le pour vérifier les prix avant enregistrement.'):(['billing-quote-mismatch','billing-bad-status','billing-bad-stay','billing-bad-dates','directory-unreadable'].includes(body.error)?cuBillingBlocked(body.error):tx('Enregistrement refusé. Vérifiez les montants et les payeurs.')));
          data.saved=body.saved;data.rev=body.rev;pending=null;dirty=false;form.querySelector('[data-hx-print-draft]').disabled=false;
          error.textContent=tx('Préfacture enregistrée. Aucun paiement ni facture fiscale créé.');
        }catch(e){error.textContent=e.message||tx('Réponse non reçue. Réessayez sans modifier les champs pour conserver la même référence.');}
        finally{form.__saving=false;form.querySelector('fieldset').disabled=false;}
      };
      }
    }catch(e){host.textContent=e.message||tx('Dossier indisponible.');}
  }

async function cuSubmitStay(form, booking, modal) {
    if (form.__hxSubmitting) return;
    const fd = new FormData(form), submit = form.querySelector('[type="submit"]'), error = form.querySelector('[data-hx-stay-error]');
    if (form.__hxStayScope !== cuStayScope()) { error.textContent = tx('L’hôtel actif a changé. Fermez ce dossier et rouvrez-le dans le bon établissement.'); return; }
    if (form.__hxTariffSyncState && form.__hxTariffSyncState !== 'ready') {
      error.textContent = form.__hxTariffSyncState === 'pending'
        ? tx('Attendez la confirmation du tarif par le serveur avant d’enregistrer la réservation.')
        : tx('Le nouveau tarif n’est pas encore confirmé par le serveur. Réessayez la synchronisation sans fermer ce brouillon.');
      return;
    }
    // The board selector lives in the commercial box: submitting before it
    // wires would silently fall back to room_only. Wait for it when the box
    // exists but is still loading; callers without the box (or with a failed
    // directory, where no meal choice exists) keep the legacy room-only path.
    if (form.querySelector('[data-hx-commercial-stay]') && !form.__commercialReady && !form.__commercialFailed) { error.textContent = tx('Tarifs en cours de chargement. Patientez quelques secondes puis réessayez.'); return; }
    const slug = cuMerchantSlug();
    const guestRows = [];
    const guestEls = Array.from(form.querySelectorAll('[data-hx-guest-row]'));
    for (let gi = 0; gi < guestEls.length; gi++) {
      const row = guestEls[gi];
      const birth = cuBirthIso(row.querySelector('[data-hx-guest-birth]')?.value);
      if (!birth.ok) {
        error.textContent = tx('Date de naissance invalide (voyageur {n}). Utilisez le format JJ/MM/AAAA.', { n: gi + 1 });
        row.querySelector('[data-hx-guest-birth]')?.focus?.();
        return;
      }
      guestRows.push({
        id: row.getAttribute('data-hx-guest-id') || '',
        name: String(row.querySelector('[data-hx-guest-name]')?.value || '').trim(),
        sex: String(row.querySelector('[data-hx-guest-sex]')?.value || '').trim(),
        nationality: String(row.querySelector('[data-hx-guest-nationality]')?.value || '').trim(),
        birthDate: birth.iso,
        minorsUnder18: Number(row.querySelector('[data-hx-guest-minors]')?.value || 0),
        residenceCountry: String(row.querySelector('[data-hx-guest-residence]')?.value || '').trim(),
        idDocType: String(row.querySelector('[data-hx-guest-id-type]')?.value || '').trim(),
        idDocNumber: String(row.querySelector('[data-hx-guest-id-num]')?.value || '').trim(),
      });
    }
    const guests = guestRows.filter((g) => g.name || g.nationality || g.idDocNumber);

    const partySize = Number(fd.get('partySize')) || 1;
    const roomTypeId = fd.get('roomTypeId');
    const selectedType = cuTypes().find((t) => t.id === roomTypeId);
    if (selectedType && partySize > (selectedType.maxGuests || 4)) {
      error.textContent = tx('La catégorie « {type} » ne peut pas accueillir {n} personnes (capacité max : {max}).', { type: selectedType.name || roomTypeId, n: partySize, c: txn(partySize, 'personne'), max: selectedType.maxGuests || 4 });
      return;
    }

    const payload = { action: 'save', merchant: slug, id: booking?.id || '', clientRef: form.__hxClientRef, roomTypeId, resourceId: fd.get('resourceId'), checkIn: fd.get('checkIn'), checkOut: fd.get('checkOut'), partySize, channel: fd.get('channel'), status: fd.get('status'), externalRef: fd.get('externalRef'), note: fd.get('note'), guests, customer: { name: fd.get('name'), phone: fd.get('phone'), email: fd.get('email') } };
    /* La version du dossier sur laquelle cette réception a travaillé. Le
       serveur refuse d'écrire par-dessus une version plus récente : c'est ce
       qui empêche deux réceptions d'effacer mutuellement leurs saisies. */
    if (booking) payload.expectedUpdatedAt = +booking.updatedAt || 0;
    payload.linkedStayId = form.__hxLinkedStayId || '';
    payload.dayUse = form.elements.stayMode?.value === 'day_use';
    if (payload.dayUse) {
      const price = String(fd.get('dayUsePrice') || '').trim().replace(',', '.');
      if (!/^\d{1,7}(\.\d{1,2})?$/.test(price)) { error.textContent = tx('Saisissez le forfait day-use convenu, avec deux décimales maximum.'); return; }
      payload.dayUseAmountCents = Math.round(Number(price) * 100);
      payload.arrivalTime = fd.get('arrivalTime'); payload.departureTime = fd.get('departureTime');
      payload.checkOut = payload.checkIn;
    }
    const board = fd.get('board') || 'room_only';
    const priceMode = fd.get('priceMode') || 'catalogue';
    const accountIdNow = form.__commercialReady ? String(fd.get('accountId') || '') : '';
    if (form.__commercialReady && !accountIdNow) {
      // Direct-guest path: the stay is priced from the hotel's own type
      // configuration — no account, no contract, no simulation. Ordinary
      // travelers were previously forced into creating a commercial account
      // for any meal plan; that gate is gone, replaced by configured rates.
      payload.commercial = { accountId: '', booker: fd.get('booker'), voucher: fd.get('voucher'), board, quoted: false };
      if (!payload.dayUse) {
        // Preservation first (defects 1+3): guest, contact, note, status and
        // traveler edits resend no pricing material at all, so the accepted
        // snapshot — including the original agreed authorization — survives
        // untouched. Only moved pricing inputs (or edited agreed terms)
        // attach fresh material, and configured changes need their own
        // confirmation click below.
        const storedNow = (booking && booking.pricing && booking.pricing.kind === 'direct') ? booking.pricing : null;
        const inputsMoved = !booking ? true : (typeof form.__pricingChanged === 'function' ? form.__pricingChanged() : true);
        const agreedNow = {
          amount: String(form.querySelector('[data-hx-agreed-amount]')?.value || '').trim().replace(',', '.'),
          reason: String(form.querySelector('[data-hx-agreed-reason]')?.value || '').trim(),
          checked: !!form.querySelector('[data-hx-agreed-confirm]')?.checked,
          visible: (() => { const bx = form.querySelector('[data-hx-agreed-box]'); return !!bx && !bx.hidden; })(),
        };
        const agreedDeviates = !!(storedNow && storedNow.agreed && agreedNow.amount !== '' && (
          Math.round(Number(agreedNow.amount) * 100) !== Number(storedNow.totalCents || 0) ||
          agreedNow.reason !== String(storedNow.reason || '')));
        if (!inputsMoved && !agreedDeviates) {
          // Nothing priced moved: keep the accepted snapshot server-side.
        } else {
          const typeNow = cuTypes().find((t) => t.id === fd.get('roomTypeId'));
          const dq = cuDirectQuote({
            typeRate: typeNow ? typeNow.rate : null, baseRate: cuState().baseRate, boardRates: typeNow ? typeNow.boardRates : null,
            board, checkIn: fd.get('checkIn'), checkOut: fd.get('checkOut'), occupancy: partySize,
          });
          if (agreedNow.visible && agreedNow.checked) {
            if (!/^\d{1,7}(\.\d{1,2})?$/.test(agreedNow.amount) || !(Number(agreedNow.amount) > 0)) { error.textContent = tx('Montant convenu invalide : un total TTC en MAD, supérieur à zéro.'); return; }
            if (agreedNow.reason.length < 3) { error.textContent = tx('Indiquez le motif du prix convenu (3 caractères minimum). Il sera enregistré sur la réservation avec votre identité.'); return; }
            payload.directPricing = { agreed: true, amountCents: Math.round(Number(agreedNow.amount) * 100), reason: agreedNow.reason.slice(0, 280), board, occupancy: partySize };
          } else if (!dq.ok) {
            if (booking && board === 'room_only' && !storedNow) {
              // Legacy room-only edit without a configured rate: keep the
              // previous behavior (server-side rate × nights) rather than
              // bricking the edit. New bookings never take this path.
            } else {
              const typeName = typeNow ? typeNow.name : tx('cette catégorie');
              const what = dq.missing.includes('dates')
                ? tx('Dates du séjour invalides.')
                : (dq.missing.includes('room')
                  ? tx('Aucun tarif logement configuré pour « {type} ».', { type: typeName })
                  : tx('Aucun tarif « {board} » configuré pour « {type} ».', { board: cuBoards[board] || board, type: typeName }));
              error.textContent = what + (dq.missing.includes('dates') ? '' : ' ' + tx('Renseignez-le dans Types de chambres, ou convenez un prix ci-dessous.'));
              return;
            }
          } else {
            if (booking && storedNow && inputsMoved) {
              const rw = form.querySelector('[data-hx-reprice-confirm]');
              if (!rw || !rw.checked) { error.textContent = tx('Le tarif a changé : vérifiez le nouveau total affiché puis confirmez la revalorisation.'); return; }
            }
            payload.directPricing = { board, occupancy: partySize, rows: dq.rows, totalCents: dq.totalCents };
          }
        }
      }
    } else if (form.__commercialReady) {
      payload.commercial = { accountId: fd.get('accountId'), booker: fd.get('booker'), voucher: fd.get('voucher'), board, quoted: priceMode === 'contract' };
      const preview = form.__commercialQuote;
      const changed = !booking ? true : (typeof form.__pricingChanged === 'function' ? form.__pricingChanged() : true);
      if (preview && preview.signature === cuStayQuoteSignature(form) && form.querySelector('[data-hx-accept-quote]')?.checked) {
        payload.acceptQuote = true; payload.quoteRevision = preview.rev;
      } else if (changed && (board !== 'room_only' || priceMode === 'contract')) {
        error.textContent = tx('Formule repas ou tarif contractuel : simulez le contrat et cochez l’acceptation du prix avant de valider.');
        return;
      }
    }
    if (!slug) { error.textContent = tx('Cette boutique n’est pas encore reliée à son compte Kiwi.'); return; }
    form.__hxSubmitting = true; submit.disabled = true; error.textContent = '';
    const scope = cuStayScope(), cache = cuStayCache();
    try {
      const res = await fetch('/api/hotel/stays', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.booking) {
        const messages = {
          'room-unavailable': tx('Cette chambre vient d’être prise sur ces dates. Choisissez-en une autre.'),
          'room-type-not-found': tx('La catégorie choisie ne peut pas accueillir {n} personnes. Ajustez le nombre d’occupants ou changez de catégorie.', { n: partySize, c: txn(partySize, 'personne') }),
          'duplicate-reference': tx('Cette référence OTA existe déjà.'),
          'invalid-dates': tx('Les dates du séjour sont invalides.'),
          'account-required': tx('Sélectionnez un compte commercial avant de simuler un contrat.'),
          'account-archived': tx('Le compte commercial sélectionné est archivé. Choisissez un compte actif ou réactivez-le dans le Cardex.'),
          'account-not-found': tx('Le compte commercial sélectionné est introuvable pour cet établissement.'),
          'invalid-formula': tx('La tarification contractuelle couvre de 1 à 3 personnes. Ajustez le nombre d’occupants.'),
          invalid: tx('Complétez le nom, les dates et la catégorie.'),
          unauthorized: tx('Votre session a expiré. Reconnectez-vous.'),
          /* Le dossier a bougé sous nos yeux : on ne l'écrase pas. La version
             fraîche revient avec le refus, on la remet en mémoire et on invite
             à rouvrir — la collègue qui vient d'y saisir un téléphone ne le
             perd pas. */
          'stay-conflict': tx('Ce dossier vient d’être modifié depuis un autre poste. Rouvrez-le pour voir la version à jour, puis refaites votre modification.'),
          'expected-updated-at-required': tx('Cette page est trop ancienne pour enregistrer sans risque d’écraser une autre saisie. Rafraîchissez, puis refaites votre modification.')
        };
        /* Le refus porte la version fraîche du serveur : on la range tout de
           suite, pour que la réouverture du dossier montre la vérité. */
        if (body.booking && (body.error === 'stay-conflict' || body.error === 'expected-updated-at-required')) {
          try {
            cache.set(body.booking.id, body.booking);
      cuStaysChanged();
            const live = window.KiwiReservations?.get?.();
            if (live && Array.isArray(live.bookings)) {
              const at = live.bookings.findIndex((x) => x.id === body.booking.id);
              if (at >= 0) live.bookings[at] = body.booking;
            }
          } catch (_) {}
        }
        error.textContent = messages[body.error] || cuCommercialError(body.error); return;
      }
      cache.set(body.booking.id, body.booking);
      cuStaysChanged();
      if (scope !== cuStayScope() || cuMerchantSlug() !== slug) { return; }
      const doc = window.KiwiReservations?.get?.();
      if (doc && Array.isArray(doc.bookings)) {
        const i = doc.bookings.findIndex((x) => x.id === body.booking.id);
        if (i < 0) doc.bookings.push(body.booking); else doc.bookings[i] = body.booking;
        window.KiwiReservations.set(doc);
      }
      modal?.close?.();
      if (scope.openModal?.el === modal?.el) scope.openModal = null;
      toast(tx('Séjour enregistré · ch. {n}', { n: (cuState().rooms && Object.values(cuState().rooms).find((r) => r.id === body.booking.resourceId)?.n) || '' }), { type: 'success', desc: cuDay(body.booking.hotel.checkIn) + hxTo() + cuDay(body.booking.hotel.checkOut) + ' · ' + (body.booking.hotel.channel || 'direct') });
      rerender();
    } catch (_) { error.textContent = tx('Réponse serveur non reçue. Vérifiez le dossier ou réessayez : la même référence sera conservée pour éviter un doublon.'); }
    finally {
      form.__hxSubmitting = false;
      submit.disabled = !!(form.__hxTariffSyncState && form.__hxTariffSyncState !== 'ready');
    }
  }

async function cuCancelStay(id, button, modal) {
    const slug = cuMerchantSlug();
    if (!slug || !id) return;
    const scope = cuStayScope(), cache = cuStayCache();
    button.disabled = true;
    try {
      const res = await fetch('/api/hotel/stays', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'cancel', merchant: slug, id }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.booking) { toast(tx('Annulation impossible'), { type: 'warn', desc: body.error || tx('Réessayez.') }); return; }
      cache.set(body.booking.id, body.booking);
      cuStaysChanged();
      if (scope !== cuStayScope() || cuMerchantSlug() !== slug) { return; }
      const doc = window.KiwiReservations?.get?.();
      if (doc && Array.isArray(doc.bookings)) {
        const i = doc.bookings.findIndex((x) => x.id === body.booking.id);
        if (i >= 0) doc.bookings[i] = body.booking;
        window.KiwiReservations.set(doc);
      }
      modal?.close?.();
      if (scope.openModal?.el === modal?.el) scope.openModal = null;
      toast(tx('Séjour annulé dans Kiwi'), { type: 'success', desc: tx('La disponibilité directe est mise à jour. Vérifiez séparément l’annulation sur l’OTA ou auprès de l’agence.') });
      rerender();
    } catch (_) { toast(tx('Confirmation non reçue'), { type: 'warn', desc: tx('Actualisez le dossier pour vérifier si l’annulation a été enregistrée.') }); }
    finally { button.disabled = false; }
  }

async function cuAwaitTariffAck(form) {
    // A scheduled save can already own the cloud writer when this flow starts.
    // Busy means "still pending", not "failed". Wait beyond cloud-doc's 10 s
    // request timeout, then keep the gate pending and retry in the background.
    const deadline = Date.now() + 14000;
    while (form && form.isConnected) {
      let ack = null;
      try { ack = await scope.hotelCloud?.flush?.(); } catch (_) { ack = null; }
      if (ack && ack.ok) return { ok: true };
      if (!ack || ack.error !== 'busy') return { ok: false, offline: !!(ack && ack.offline), error: ack && ack.error };
      if (Date.now() >= deadline) return { ok: false, pending: true };
      await new Promise((r) => setTimeout(r, 500));
    }
    return { ok: false, cancelled: true };
  }

async function cuLoadProduction() {
    const scope = cuStayScope(), st = cuProductionState(), sequence = ++st.request, month = st.month;
    st.loading = true; st.error = ''; st.report = null;
    if (scope.openDrawer?.page === 'production') rerender();
    try {
      const res = await fetch('/api/hotel/production?' + new URLSearchParams({ merchant: cuChannelMerchant(), month }), { cache: 'no-store' });
      const b = await res.json();
      if (!res.ok || b.month !== month || !Array.isArray(b.groups) || !Array.isArray(b.totals)) throw new Error(b.error || 'unavailable');
      if (st.request === sequence) st.report = b;
    } catch (e) {
      if (st.request === sequence) st.error = e.message === 'production-limit' ? txk('Ce mois dépasse la limite de lecture. Aucun total partiel n’est affiché.') : txk('Production indisponible. Le registre complet est nécessaire ; aucun total n’est estimé depuis le cache.');
    } finally {
      if (st.request === sequence) st.loading = false;
      if (scope === cuStayScope() && st.request === sequence && scope.openDrawer?.page === 'production') rerender();
    }
  }

function cuChannelGuide() {
    const rows = [
      ['Booking.com', tx('Extranet → Calendrier & tarifs → synchronisation des calendriers → copiez le lien d’exportation iCal de l’annonce.')],
      ['Expedia', tx('Expedia Partner Central → calendrier de l’établissement → exportation ou partage iCal (certaines propriétés le reçoivent via euro.expedia.net).')],
      ['Agoda', tx('YCS (Yield Control System) → calendrier de l’établissement → export iCal.')],
      ['Airbnb', tx('Annonces → Calendrier → paramètres de disponibilité → exporter / synchroniser le calendrier (lien iCal).')],
      [tx('JumboTours & centrales B2B'), tx('Pas d’export iCal : allotement géré au contrat. Saisissez chaque dossier à la main via + Réservation (canal Agence).')],
    ];
    const m = K().modal({ tag: tx('CANAUX OTA'), title: tx('Où trouver le lien iCal ?'),
      desc: tx('Un lien par chambre. Seules les dates bloquées sont importées : ni prix, ni clients, ni commissions.'), width: 620,
      body: `<div class="hx-list">${rows.map(([name, how]) => `<div class="hx-arr"><span class="tm">ICAL</span><div class="who"><b>${esc(name)}</b><div class="sub">${esc(how)}</div></div></div>`).join('')}</div>
      <div class="hx-room-form-actions"><button class="hx-btn atlas" data-action="hx-channel-close">${tx('Compris')}</button></div>` });
    m.el.querySelector('.kiwi-modal')?.classList.add('hx-hotel-modal');
    scope.openModal = { el: m.el, close: m.close };
  }

function cuCaptureEconomatDraft() {
    if (!scope.openDrawer || !['hotelintel', 'points-vente'].includes(scope.openDrawer.page) || !cuEconomatState.draft) return;
    const host = scope.openDrawer.el.querySelector('[data-hx-economat]');
    if (!host) return;
    cuEconomatState.draft.units.forEach((unit) => {
      const row = host.querySelector(`[data-hx-econ-unit="${CSS.escape(unit.id)}"]`);
      if (!row) return;
      unit.name = String(row.querySelector('[data-hx-econ-name]')?.value || unit.name).trim();
      unit.storeType = String(row.querySelector('[data-hx-econ-store]')?.value ?? unit.storeType);
      unit.active = unit.kind === 'economat' ? true : !!row.querySelector('[data-hx-econ-active]')?.checked;
    });
    cuEconomatState.draft.terminals = [...host.querySelectorAll('[data-hx-econ-terminal-row]')].map((row) => ({
      terminalId: String(row.querySelector('[data-hx-econ-terminal]')?.value || '').trim(),
      unitId: String(row.querySelector('[data-hx-econ-terminal-unit]')?.value || '').trim(),
    }));
  }

function cuIntelBody() {
    cuWarmStays();
    const st = cuState();
    const rooms = Object.values(st.rooms || {});
    const folios = Object.values(st.folios || {}).filter(Boolean);
    /* Les séjours, pas l'état du document des chambres : personne ne repasse
     * une chambre en « occupée » quand un client arrive, de sorte que cette page
     * disait « 0 % · 0 occupée » avec un client en maison et « 0 arrivée » avec
     * une arrivée au planning, puis en tirait « Occupation basse ». */
    const tonight = cuTonight();
    const today = cuToday();
    const stays = Array.from(cuAllStays().values()).filter((b) => b?.hotel && b.hotel.dayUse !== true);
    const arrivals = stays.filter((b) => b.hotel.checkIn === today && ['confirmed', 'checked_in', 'completed'].includes(b.status)).length;
    const dirty = rooms.filter((room) => cuRoomStatus(room).key === 'sale').length;
    const unavailable = rooms.filter((room) => room.status === 'hs').length;
    const total = rooms.length;
    const known = total > 0 && tonight.known;
    const occupied = tonight.sold;
    const occupancy = known ? Math.round(occupied / total * 100) : null;
    scope.cuStripUnknown = total > 0 && !tonight.known;
    const openBalance = folios.reduce((sum, folio) => sum + folioTotal(folio), 0);
    const configuredRates = cuTypes().map((type) => type.rate == null ? st.baseRate : type.rate).filter((rate) => rate != null && Number.isFinite(+rate));
    const averageRate = configuredRates.length ? Math.round(configuredRates.reduce((sum, rate) => sum + +rate, 0) / configuredRates.length) : null;
    const activeChannels = cuChannelState.loaded ? cuChannelState.rows.filter((row) => row.status === 'active').length : null;
    const recommendations = [];
    if (!rooms.length) recommendations.push([tx('Configurer les chambres'), tx('Le plan, les séjours, le ménage et les prévisions ont besoin de chambres réelles.')]);
    if (rooms.length && averageRate == null) recommendations.push([tx('Définir les tarifs'), tx('Aucun revenu potentiel ne peut être calculé tant que le tarif général ou les tarifs par type sont vides.')]);
    if (dirty) recommendations.push([tx('Prioriser le ménage'), tx(dirty === 1 ? '{n} chambre ne peut pas être revendue immédiatement.' : '{n} chambres ne peuvent pas être revendues immédiatement.', { n: dirty, c: txn(dirty, 'chambre') })]);
    if (known && occupancy >= 80 && averageRate != null) recommendations.push([tx('Demande forte'), tx(occupied === 1 ? '{n} chambre vendue sur {t} ce soir ({p} %). Vérifiez les prochaines dates avant d’augmenter les tarifs, sans modifier les réservations existantes.' : '{n} chambres vendues sur {t} ce soir ({p} %). Vérifiez les prochaines dates avant d’augmenter les tarifs, sans modifier les réservations existantes.', { n: occupied, c: txn(occupied, 'chambre'), t: total, p: occupancy })]);
    if (known && occupancy < 40 && total > 0) recommendations.push([tx('Occupation basse ce soir'), tx(occupied === 1 ? '{n} chambre vendue sur {t} ({p} %). Travaillez d’abord la vente directe et les dates creuses plutôt qu’une remise générale.' : '{n} chambres vendues sur {t} ({p} %). Travaillez d’abord la vente directe et les dates creuses plutôt qu’une remise générale.', { n: occupied, c: txn(occupied, 'chambre'), t: total, p: occupancy })]);
    if (activeChannels === 0) recommendations.push([tx('Connecter les calendriers OTA'), tx('Booking.com et Airbnb doivent bloquer la même disponibilité que les réservations directes.')]);
    if (!recommendations.length) recommendations.push([tx('Aucune urgence opérationnelle'), tx('Les chambres, tarifs, folios et canaux ne montrent pas de blocage immédiat.')]);
    return `<div class="hx-page">
      <div class="hx-strip">
        <div class="hx-kpi"><div class="l">${tx('Occupation ce soir')}</div><div class="v">${occupancy == null ? '·' : ltr(occupancy + ' %')}</div><div class="d">${total === 0 ? tx('aucune chambre déclarée') : (known ? tx(occupied === 1 ? '{n} vendue sur {t}' : '{n} vendues sur {t}', { n: occupied, t: total }) + (unavailable ? ' · ' + tx('{n} hors-service', { n: unavailable }) : '') : tx('lecture des séjours…'))}</div></div>
        <div class="hx-kpi"><div class="l">${tx('Arrivées du jour')}</div><div class="v">${tonight.known ? arrivals : '·'}</div><div class="d">${tx('selon les réservations')}</div></div>
        <div class="hx-kpi"><div class="l">${tx('Folios ouverts')}</div><div class="v">${folios.length}</div><div class="d">${tx('{amount} à suivre', { amount: MAD(openBalance) })}</div></div>
        <div class="hx-kpi"><div class="l">${tx('Tarif moyen configuré')}</div><div class="v">${averageRate == null ? '·' : ltr(fmt(averageRate) + ' <small>MAD</small>')}</div><div class="d">${tx('moyenne des tarifs de vos types')}</div></div>
      </div>
      <div class="hx-h"><span class="t">${tx('Décisions du jour')}</span><span class="s">${tx('calculées uniquement avec les données visibles de cet établissement')}</span></div>
      <div class="block" style="padding:8px 14px;">
        <div class="hx-list">${recommendations.map(([title, detail], index) => `<div class="hx-arr"><span class="tm">${String(index + 1).padStart(2, '0')}</span><div class="who"><b>${esc(title)}</b><div class="sub">${esc(detail)}</div></div><span class="hx-pill ${index ? 'neutral' : 'ok'}">${index ? tx('À SUIVRE') : tx('PRIORITÉ')}</span></div>`).join('')}</div>
      </div>
      <div class="block" style="padding:16px 18px;margin-top:14px;"><div class="hx-h" style="margin:0;"><span class="t">${tx('Limite des données')}</span><span class="s">${tx('Kiwi n’affiche pas de prévision 12 mois ni de risque no-show : il faudrait un historique quotidien que Kiwi ne tient pas encore. L’occupation à venir (Tarifs &amp; occupation) compte vos réservations, elle ne prédit rien.')}</span></div></div>
      ${cuEconomatBody()}
    </div>`;
  }

return Object.freeze({ rerender, roomModal, tarifsBody, guestModal, cuStrip, cuRoomBatchEditor, cuRoomEditor, cuTypesManager, cuTypeEditor, cuFloorsManager, cuViewsAndCharsManager, cuFloorEditor, cuRackBody, cuFiltersModal, cuBulkEditModal, cuBulkReviewModal, cuLoadPerformance, cuFoliosBody, cuSejoursBody, cuDispoBody, cuStayEditor, cuOpenDossier, cuSubmitStay, cuCancelStay, cuAwaitTariffAck, cuLoadProduction, cuChannelGuide, cuCaptureEconomatDraft, cuIntelBody });
};
