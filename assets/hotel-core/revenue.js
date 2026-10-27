  /* Tariff-save acknowledgment for the stay editor. The type editor returns
   * after the LOCAL write; its server push is still in flight. A new total
   * is ready to book only once the rooms document is acknowledged — never
   * before. Pending, busy, offline and failed saves each get a visible
   * state; the reservation draft is never touched and retry is offered. */
  const HX_TARIFF_SYNC_COPY = {
    get pending() { return tx('Synchronisation du tarif avec le serveur…'); },
    get failed() { return tx('Tarif enregistré sur cet appareil, mais pas confirmé par le serveur. Votre brouillon est intact.'); },
    get offline() { return tx('Connexion perdue : tarif enregistré sur cet appareil uniquement. Votre brouillon est intact.'); },
    get retry() { return tx('Réessayer la synchronisation'); },
  };
  function cuSetTariffSync(form, state, render = true) { return window.__kiwiHotelInternal.part('rates').cuSetTariffSync.apply(this, arguments); }
  async function cuAwaitTariffAck() { return hotelSection('editors').cuAwaitTariffAck.apply(this, arguments); }
  function cuTariffSyncCycle(form, pendingDelayMs) { return window.__kiwiHotelInternal.part('rates').cuTariffSyncCycle.apply(this, arguments); }
  function cuTariffRetry(form) { return window.__kiwiHotelInternal.part('rates').cuTariffRetry.apply(this, arguments); }
  function cuDirectQuote(input) { return window.__kiwiHotelInternal.part('rates').cuDirectQuote.apply(this, arguments); }
  function cuQuoteRows(q) { return window.__kiwiHotelInternal.part('rates').cuQuoteRows.apply(this, arguments); }
  function cuWireStayCommercial(form, booking) { return window.__kiwiHotelInternal.part('rates').cuWireStayCommercial.apply(this, arguments); }
  function cuCommercialState() {
    const scope = cuStayScope();
    if (!cuCommercialByScope.has(scope)) cuCommercialByScope.set(scope, { accounts: [], contracts: [], rev: 0, loaded: false, loading: false, error: '', kind: '', search: '' });
    return cuCommercialByScope.get(scope);
  }
  function cuCommercialError() { return hotelSection('views').cuCommercialError.apply(this, arguments); }
  async function cuLoadCommercial() {
    const st = cuCommercialState(), scope = cuStayScope(), merchant = cuChannelMerchant();
    if (!merchant || st.loading) return;
    st.loading = true; st.error = '';
    try {
      const res = await fetch('/api/hotel/commercial?merchant=' + encodeURIComponent(merchant), { cache: 'no-store' });
      const b = await res.json();
      if (!res.ok || !Array.isArray(b.accounts) || !Array.isArray(b.contracts)) throw new Error(b.error || 'unavailable');
      Object.assign(st, { accounts: b.accounts, contracts: b.contracts, rev: b.rev, loaded: true });
    } catch (e) { st.error = cuCommercialError(e.message); }
    finally { st.loading = false; if (scope === cuStayScope() && openDrawer?.page === 'commercial') rerender(); }
  }
  function cuCommercialBody() { return hotelSection('views').cuCommercialBody.apply(this, arguments); }
  const cuProductionByScope = new Map();
  function cuProductionState() {
    const scope = cuStayScope();
    if (!cuProductionByScope.has(scope)) cuProductionByScope.set(scope, {
      month: new (globalThis.KiwiZoneLaw?.DateTimeFormat || Intl.DateTimeFormat)('en-CA', { timeZone: 'Africa/Casablanca', year: 'numeric', month: '2-digit' }).format(new Date()).slice(0, 7),
      report: null, loading: false, error: '', request: 0,
    });
    return cuProductionByScope.get(scope);
  }
  async function cuLoadProduction() { return hotelSection('editors').cuLoadProduction.apply(this, arguments); }
  function cuProductionBody() {
    const st = cuProductionState(), r = st.report;
    return `<div class="hx-page hx-commercial hx-production"><div class="hx-commercial-head"><div><span class="hx-kicker">${tx('PRODUCTION MENSUELLE')}</span><h3>${tx('Qui remplit<br>vos chambres.')}</h3><p>${tx('Chambres-nuits réservées par compte ou canal. Séjours confirmés, en maison et terminés ; annulations, no-shows et demandes exclus.')}</p></div><button class="hx-btn ghost" data-action="hx-commercial">${tx('Retour aux comptes')}</button></div>
      <form data-hx-production-filter class="hx-commercial-filter"><label>${tx('Mois du séjour')}<input type="month" dir="ltr" name="month" value="${esc(st.month)}" required min="0001-01" max="9998-12"></label><button type="submit" class="hx-btn atlas">${tx('Afficher le mois')}</button></form>
      <p class="hx-commercial-feedback" role="status">${esc(tx(st.error) || (st.loading ? tx('Lecture du registre des réservations…') : tx('Une chambre-nuit correspond à une chambre réservée pour une nuit. Ce ne sont ni des encaissements ni un relevé de présence.')))}</p>
      ${r ? `<div class="hx-commercial-summary"><div><span>${tx('Chambres-nuits')}</span><strong>${r.nights}</strong><small>${tx('sur le mois sélectionné')}</small></div><div><span>${tx('Réservations')}</span><strong>${r.reservations}</strong><small>${tx('croisant la période')}</small></div><div><span>${tx('Comptes & canaux')}</span><strong>${r.groups.length}</strong><small>${tx('avec une production')}</small></div><div><span>${tx('Sans chambre attribuée')}</span><strong>${r.unassigned}</strong><small>${tx('réservations incluses')}</small></div></div>
      <div class="hx-production-scroll" tabindex="0" role="region" aria-label="${tx('Tableau mensuel défilant horizontalement')}"><table class="hx-production-table"><caption>${tx('Chambres-nuits')} · ${ltr(esc(r.month))} · ${tx('faites défiler pour consulter tous les jours')}</caption><thead><tr><th scope="col">${tx('Compte / canal')}</th><th scope="col">${tx('Total')}</th>${r.totals.map((_, i) => `<th scope="col"><abbr title="${esc(r.month + '-' + String(i + 1).padStart(2, '0'))}">${i + 1}</abbr></th>`).join('')}</tr></thead><tbody>${r.groups.map(g => `<tr><th scope="row"><b>${esc(g.name)}</b><small>${esc(cuKinds[g.kind] || tx('Canal de réservation'))}</small></th><td><strong>${g.nights}</strong></td>${g.days.map(n => `<td${n ? ' class="has-nights"' : ''}>${n || '·'}</td>`).join('')}</tr>`).join('')}</tbody><tfoot><tr><th scope="row">${tx('Total chambres-nuits')}</th><td>${r.nights}</td>${r.totals.map(n => `<td>${n}</td>`).join('')}</tr></tfoot></table></div>${!r.groups.length ? `<p class="hx-commercial-empty">${tx('Aucune réservation confirmée sur ce mois.')}</p>` : ''}
      <p class="hx-daily-note">${tx('La nuit du départ est exclue. Les séjours sans compte commercial sont regroupés par canal. Une réservation sans chambre attribuée reste comptée ; ce tableau ne mesure pas les chambres encore disponibles.')}</p>` : ''}</div>`;
  }
  async function cuAccountStays(id) {
    const scope = cuStayScope(), account = cuCommercialState().accounts.find(a => a.id === id);
    if (!account) return;
    const m = K().modal({ tag: cuKinds[account.kind], title: tx('Séjours · {name}', { name: account.name }), width: 800, desc: tx('Dossiers rattachés à ce compte. Les montants réservés ne sont ni des encaissements ni un solde débiteur.'), body: `<div data-hx-account-stays role="status">${tx('Chargement des dossiers…')}</div>` });
    const host = m.el.querySelector('[data-hx-account-stays]');
    try {
      const res = await fetch('/api/hotel/stays?' + new URLSearchParams({ merchant: cuChannelMerchant(), accountId: id, includeCancelled: '1' }), { cache: 'no-store' });
      const b = await res.json();
      if (scope !== cuStayScope()) { m.close(); return; }
      if (!res.ok || !Array.isArray(b.stays)) throw new Error('unavailable');
      host.innerHTML = `<p>${tx('{n} dossier(s)', { n: b.stays.length, c: txn(b.stays.length, 'dossier') })}${b.capped ? ' · ' + tx('limite de lecture atteinte, liste incomplète') : ''}${b.coverage === 'document' ? ' · ' + tx('document actif seulement, historique non vérifié') : ''}</p><div class="hx-commercial-grid">${b.stays.map(s => `<article class="block hx-commercial-card"><div><span class="hx-kicker">${ltr(esc(s.code))} · ${esc(({ confirmed: tx('Confirmé'), requested: tx('Demandé'), checked_in: tx('En maison'), completed: tx('Terminé'), cancelled: tx('Annulé'), no_show: tx('No-show') })[s.status] || s.status)}</span><h3>${esc(s.customer?.name || '')}</h3><p>${esc(cuDay(s.hotel?.checkIn))}${hxTo()}${esc(cuDay(s.hotel?.checkOut))} · ${esc(cuBoards[s.commercial?.board] || tx('Logement seul'))}</p><p>${tx('{amount} MAD réservés', { amount: ltr(Number(s.hotel?.total || 0).toFixed(2)) })}</p><small>${esc(s.commercial?.voucher || tx('Sans voucher / bon de commande'))}</small></div></article>`).join('') || `<p>${tx('Aucun séjour rattaché. Sélectionnez ce compte dans le dossier de réservation.')}</p>`}</div>`;
    } catch (_) { host.textContent = tx('Historique indisponible. Aucun dossier n’a été modifié.'); }
  }
  async function cuCommercialEditor() { return hotelSection('views').cuCommercialEditor.apply(this, arguments); }
  function cuHotesBody() {
    return `<div class="hx-page">
      <div class="block" style="padding:8px 14px;">
        ${cuStarter(
          tx('Vos fiches clients se créent toutes seules.'),
          tx('Dès le premier séjour, chaque client a sa fiche : préférences, allergies, dépenses par poste, valeur vie, et la reconnaissance des fidèles au check-in.'),
          [tx('« Client fidèle ×2 » signalé à l\'arrivée'), tx('Mix nationalités pour viser vos marchés'), tx('Relance directe −10 % pour court-circuiter les OTA')]
        )}
      </div>
    </div>`;
  }
  const cuChannelState = { loading: false, loaded: false, rows: [], error: '' };
  function cuChannelMerchant() { return window.__kiwiHotelInternal.part('channels').cuChannelMerchant.apply(this, arguments); }
  function cuLoadChannels(sync) { return window.__kiwiHotelInternal.part('channels').cuLoadChannels.apply(this, arguments); }
  function cuChannelRoomLabel(id) { return window.__kiwiHotelInternal.part('channels').cuChannelRoomLabel.apply(this, arguments); }
  function cuChannelEditor(provider) {
    const name = ({ airbnb: 'Airbnb', expedia: 'Expedia', agoda: 'Agoda' })[provider] || 'Booking.com';
    const rooms = Object.values(cuState().rooms || {}).sort((a,b) => a.n-b.n);
    if (!rooms.length) { toast(tx('Ajoutez d’abord vos chambres'), {type:'warn'}); return; }
    const m = K().modal({ tag: tx('CALENDRIER OTA'), title: tx('Connecter {name}', { name }),
      desc: tx('Collez le lien iCal exporté par {name} et liez-le à une chambre physique. Le lien reste chiffré et ne sera plus affiché.', { name }), width:600,
      body:`<div class="hx-room-form">
        <label><span>${tx('Nom de la connexion')}</span><input data-hx-channel-label maxlength="80" value="${esc(name)} · ${esc(vName())}"></label>
        <label><span>${tx('Chambre Kiwi')}</span><select data-hx-channel-room>${rooms.map((r)=>`<option value="${esc(r.id)}">${tx('Chambre {n}', { n: r.n })} · ${esc(r.typeName || '')}</option>`).join('')}</select></label>
        <label class="hx-room-form-wide"><span>${tx('Lien calendrier iCal (.ics)')}</span><input data-hx-channel-url dir="ltr" type="url" inputmode="url" autocomplete="off" spellcheck="false" placeholder="https://…/calendar.ics"></label>
        <p class="hx-room-form-wide" data-hx-channel-status>${tx('Une connexion par chambre. Ajoutez les autres chambres ensuite.')}</p>
      </div><div class="hx-room-form-actions"><button class="hx-btn ghost" data-action="hx-channel-close">${tx('Annuler')}</button><button data-activation=write class="hx-btn atlas" data-action="hx-channel-save" data-arg="${provider}">${tx('Connecter et vérifier')}</button></div>` });
    m.el.querySelector('.kiwi-modal')?.classList.add('hx-hotel-modal'); openModal={el:m.el,close:m.close};
  }
  /* Ticket #0009 · where each extranet hides its iCal export. Generic on
   * purpose: extranet menus move, but every platform below ships an iCal
   * export per listing — except B2B allotment (JumboTours), which stays
   * manual entry via + Réservation. */
  function cuChannelGuide() { return hotelSection('editors').cuChannelGuide.apply(this, arguments); }
  /* Le lien de réservation publique est-il ouvert ? La tuile disait « source de
   * réservations non connectée » quoi qu'il arrive, y compris avec le lien ouvert
   * et des clients qui réservent. */
  function cuDirectOpen() { return window.__kiwiHotelInternal.part('channels').cuDirectOpen.apply(this, arguments); }
  function cuCanauxBody() { return window.__kiwiHotelInternal.part('channels').cuCanauxBody.apply(this, arguments); }
  const cuEconomatState = {
    loading: false, loaded: false, saving: false, error: '', rev: 0,
    registry: { units: [], terminalUnits: {} }, draft: null,
    report: null, reportError: '', shifts: [], shiftReport: null, selectedShift: '',
  };
  function cuMerchantSlug() {
    try {
      return String(window.KiwiStore?.slugFor?.(cuVenueId())
        || window.KiwiVenue?.getCurrentVenueData?.()?.slug
        || window.KiwiMe?.merchant
        || '').trim();
    } catch (_) { return ''; }
  }
  function cuEconomatDraft(value) {
    const raw = value && typeof value === 'object' ? value : {};
    let units = Array.isArray(raw.units) ? raw.units.map((unit) => ({ ...unit })) : [];
    if (!units.length) units = [{
      id: 'economat-central', name: tx('Économat central'), kind: 'economat',
      storeType: 'economat', locationId: 'loc-economat-central', active: true,
    }];
    return {
      units,
      terminals: Object.entries(raw.terminalUnits || {}).map(([terminalId, unitId]) => ({ terminalId, unitId })),
    };
  }
  function cuNewUnit(kind) {
    const tail = Date.now().toString(36).slice(-7);
    const id = `${kind}-${tail}`;
    return {
      id, name: kind === 'department' ? tx('Nouveau département') : tx('Nouveau point de vente'),
      kind, storeType: kind === 'department' ? '' : 'restaurant',
      locationId: `loc-${id}`, active: true,
    };
  }
  function cuQty(milli) {
    return (window.KiwiNumber?.format((Number(milli) || 0) / 1000, {maximumFractionDigits:3}) ?? new Intl.NumberFormat(document.documentElement?.lang === 'en' ? 'en-GB' : 'fr-FR', {maximumFractionDigits:3}).format((Number(milli) || 0) / 1000));
  }
  function cuMoney(cents) { const v = (window.KiwiNumber?.format((Number(cents) || 0) / 100) ?? new Intl.NumberFormat(document.documentElement?.lang === 'en' ? 'en-GB' : 'fr-FR').format((Number(cents) || 0) / 100)) + ' MAD'; return hxLang() === 'ar' ? '⁦' + v + '⁩' : v; }
  function cuCaptureEconomatDraft() { return hotelSection('editors').cuCaptureEconomatDraft.apply(this, arguments); }
  function cuEconomatBody() { return hotelSection('views').cuEconomatBody.apply(this, arguments); }
  /* Every active outlet mapped to at least one till: the single readiness
   * rule for the shared registry, read by both host pages. */
  function cuOutletsMapped(d) {
    const outlets = d.units.filter((unit) => unit.kind === 'outlet' && unit.active);
    const mapped = new Set(d.terminals.filter((row) => row.terminalId && row.unitId).map((row) => row.unitId));
    return outlets.length > 0 && outlets.every((unit) => mapped.has(unit.id));
  }
  /* Units + tills editor, shared by Intelligence hôtel and Points de vente:
   * one draft, one registry, one save. Editing here never duplicates an
   * establishment: names, kinds and till assignments all land in the same
   * hotel-units document, and locationId stays immutable server-side, so
   * stock history and room-charge scoping keep pointing at the same units. */
  function cuUnitsEditorHtml() { return hotelSection('views').cuUnitsEditorHtml.apply(this, arguments); }
  /* Points de vente: the outlet-facing host for the same shared draft.
   * Rename a restaurant here and the Économat page shows it, because both
   * read cuEconomatState — never a second establishment list. */
  const HX_PDV_KINDS = { get restaurant() { return tx('Restaurant'); }, get bar() { return tx('Bar'); }, get cafe() { return tx('Café'); }, get spa() { return tx('Spa'); } };
  function cuPdvBody() { return hotelSection('views').cuPdvBody.apply(this, arguments); }
  async function cuLoadEconomat() { return hotelSection('views').cuLoadEconomat.apply(this, arguments); }
  async function cuLoadRoomShift(shiftId) {
    const merchant = cuMerchantSlug();
    if (!merchant || !shiftId) return;
    cuEconomatState.selectedShift = shiftId; cuEconomatState.shiftReport = null; rerender();
    try {
      const response = await fetch(`/api/hotel/room-charges?merchant=${encodeURIComponent(merchant)}&shiftId=${encodeURIComponent(shiftId)}`, { credentials: 'same-origin' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'rapport indisponible');
      cuEconomatState.shiftReport = body.report;
    } catch (error) { cuEconomatState.error = String(error && error.message || error); }
    rerender();
  }
  async function cuSaveEconomat() { return hotelSection('views').cuSaveEconomat.apply(this, arguments); }
  function cuIntelBody() { return hotelSection('editors').cuIntelBody.apply(this, arguments); }
