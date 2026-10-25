/* Owner: hotel groups. Exposes a private factory; immutable dependencies are explicit, mutable owner state is accessed through live scope getters/setters. */
(window.__kiwiHotelSections ||= {}).groups = (scope) => {
'use strict';
const { DEFAULT_VIEWS, K, MAD, cuBoards, cuCommercialError, cuCommercialState, cuDay, cuDirectQuote, cuDraftMoney, cuDraftStatus, cuKinds, cuLoadCommercial, cuMatchNationality, cuMerchantSlug, cuNationalityLabel, cuNationalitySelectorHtml, cuNormalizeText, cuParseDelimitedLine, cuState, cuStayCache, cuStayScope, cuStaysChanged, cuTypes, cuViewLabel, cuWireNationalitySelectors, esc, hxColon, hxTo, ltr, rerender, roomTypeOf, toast, tx, txn } = scope;
async function cuGroupReservationModal(options = {}) {
    const resume = options.resume === true;
    const initialScope = cuStayScope();
    const initialMerchant = cuMerchantSlug();
    const initialCache = cuStayCache();
    const st = cuState(), types = cuTypes(), allRooms = Object.values(st.rooms || {}).sort((a, b) => a.n - b.n);
    if (!types.length || !allRooms.length) { toast(tx('Configurez vos chambres d’abord'), { type: 'warn' }); return; }
    await cuLoadCommercial();
    if (initialScope !== cuStayScope() || initialMerchant !== cuMerchantSlug()) return;
    const commState = cuCommercialState();
    const today = new (globalThis.KiwiZoneLaw?.DateTimeFormat || Intl.DateTimeFormat)('en-CA', { timeZone: 'Africa/Casablanca', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const add = (ymd, n) => { const d = new Date(ymd + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
    const tomorrow = add(today, 1);

    const stagedKey = 'kiwi:hotel-group-staged:' + initialMerchant;
    let staged = null;
    if (resume) {
      try {
        staged = JSON.parse(localStorage.getItem(stagedKey) || 'null');
      } catch (_) {}
    }
    if (!staged || staged.merchant !== initialMerchant) staged = null;
    /* Ticket #0007 · a stale staged draft must never wedge "new reservation".
     * The staged cache is UI progress only (server truth is untouched), so a
     * draft pointing at deleted rooms, an archived account or impossible
     * dates is dropped and the modal opens blank instead of frozen. */
    const stagedUsable = (s) => {
      if (!s || typeof s !== 'object') return false;
      if (s.checkIn && !/^\d{4}-\d{2}-\d{2}$/.test(s.checkIn)) return false;
      if (s.checkOut && !/^\d{4}-\d{2}-\d{2}$/.test(s.checkOut)) return false;
      if (s.checkIn && s.checkOut && s.checkOut <= s.checkIn) return false;
      const roomIds = new Set(allRooms.map((r) => r.id));
      if (Array.isArray(s.selectedRoomIds) && s.selectedRoomIds.some((id) => !roomIds.has(id))) return false;
      if (Array.isArray(s.travelers) && s.travelers.some((t) => t && t.roomId && !roomIds.has(t.roomId))) return false;
      if (s.accountId) {
        const accounts = (commState && commState.accounts) || [];
        if (accounts.length && !accounts.some((a) => a && a.id === s.accountId && !a.archived)) return false;
      }
      return true;
    };
    if (staged && !stagedUsable(staged)) {
      try { localStorage.removeItem(stagedKey); } catch (_) {}
      staged = null;
    }

    // ── Durable submission intent, v2 (defect 2) ──────────────────────────
    // kiwi_hx_intent_<dossier> is the ONE authoritative recovery record: it
    // carries the frozen terms, the exact per-room payloads attempted (with
    // their stable clientRef identities), the quote position and a status.
    // The staged draft (kiwi:hotel-group-staged:) stays a UI/progress cache;
    // whenever both exist and disagree, the unresolved intent wins for the
    // dossier it covers, and the merge is said out loud. v1 records (terms
    // only, no rooms) are honoured for their terms and ignored for anything
    // else. Proven local progress (savedRooms with server answers in hand)
    // always outranks an unknown-outcome intent for ANOTHER dossier — that
    // intent simply surfaces again once this dossier is done or discarded.
    const INTENT_VERSION = 2;
    const intentKeyFor = (dossierId) => 'kiwi_hx_intent_' + dossierId;
    const readIntent = (dossierId) => {
      try {
        const raw = JSON.parse(localStorage.getItem(intentKeyFor(dossierId)) || 'null');
        if (!raw || raw.merchant !== initialMerchant || raw.dossierId !== dossierId) return null;
        return raw;
      } catch (_) { return null; }
    };
    const readAnyUnresolvedIntent = () => {
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (!key || !key.startsWith('kiwi_hx_intent_')) continue;
          let raw = null;
          try { raw = JSON.parse(localStorage.getItem(key) || 'null'); } catch (_) { continue; }
          if (raw && raw.merchant === initialMerchant && raw.status !== 'complete') return raw;
        }
      } catch (_) {}
      return null;
    };
    const writeIntent = (record) => {
      // Throws on quota/denied storage: the caller must stop before any
      // booking write when the authoritative record cannot be persisted.
      localStorage.setItem(intentKeyFor(record.dossierId), JSON.stringify(record));
    };

    const pendingIntent = resume ? readAnyUnresolvedIntent() : null;
    const draftSavedCount = (staged && staged.savedRooms) ? Object.keys(staged.savedRooms).length : 0;
    // Adopt the in-flight dossier only when this draft holds no proven rooms.
    const adoptIntent = !!(pendingIntent && pendingIntent.dossierId
      && (!staged || staged.dossierId !== pendingIntent.dossierId)
      && draftSavedCount === 0);
    let intentNotice = '';
    if (pendingIntent && pendingIntent.dossierId && (!staged || staged.dossierId !== pendingIntent.dossierId) && !adoptIntent) {
      intentNotice = 'other-pending';
    }
    if (adoptIntent) {
      staged = null;
      intentNotice = 'adopted';
    }
    // Terms of the adopted intent (same dossier, or newly adopted dossier).
    const intentTerms = (pendingIntent && (adoptIntent || (staged && staged.dossierId === pendingIntent.dossierId)) && pendingIntent.terms && typeof pendingIntent.terms === 'object')
      ? { ...pendingIntent.terms }
      : null;
    const intentRooms = (pendingIntent && (adoptIntent || (staged && staged.dossierId === pendingIntent.dossierId)) && Array.isArray(pendingIntent.rooms))
      ? pendingIntent.rooms.filter(r => r && r.roomId && allRooms.some((room) => room.id === r.roomId))
      : [];
    const intentTravelers = (pendingIntent && (adoptIntent || (staged && staged.dossierId === pendingIntent.dossierId)) && Array.isArray(pendingIntent.travelers) && pendingIntent.travelers.length)
      ? pendingIntent.travelers
      : null;

    let groupDossierId = (staged && staged.dossierId)
      ? staged.dossierId
      : ((pendingIntent && adoptIntent)
        ? pendingIntent.dossierId
        : ('grp_' + Date.now() + '_' + crypto.randomUUID().slice(0, 8)));

    let savedRooms = (staged && staged.savedRooms) ? staged.savedRooms : {};
    let failedRooms = (staged && staged.failedRooms) ? staged.failedRooms : {};
    let quoteBreakdown = (staged && staged.quoteBreakdown) ? staged.quoteBreakdown : {};
    let quoteRevision = (staged && staged.quoteRevision != null) ? staged.quoteRevision : null;
    let quoteAccepted = !!(staged && staged.quoteAccepted && staged.quoteBreakdown && Object.keys(staged.quoteBreakdown).length > 0);
    if (!staged && pendingIntent && adoptIntent) {
      quoteBreakdown = (pendingIntent.quoteBreakdown && typeof pendingIntent.quoteBreakdown === 'object') ? { ...pendingIntent.quoteBreakdown } : {};
      quoteRevision = (pendingIntent.quoteRevision != null) ? pendingIntent.quoteRevision : null;
      quoteAccepted = !!(pendingIntent.quoteAccepted && Object.keys(quoteBreakdown).length > 0);
    }
    // Frozen dossier terms (defect 1): once any room is saved, dates, account,
    // meal plan, channel and group/contact identity are locked in the DOM and
    // every later submit reads them from here — never from disabled controls
    // that FormData silently drops. Intent terms (an actual attempt) outrank
    // the draft cache.
    let committedTerms = (staged && staged.committedTerms && typeof staged.committedTerms === 'object')
      ? { ...staged.committedTerms }
      : null;
    if (!committedTerms && intentTerms) committedTerms = { ...intentTerms };
    // Per-room commercial directory revision captured with each accepted quote
    // (defect 4): a quote is only submittable when every room was priced under
    // the single revision the group was reviewed with.
    let quoteRevs = (staged && staged.quoteRevs && typeof staged.quoteRevs === 'object')
      ? { ...staged.quoteRevs }
      : {};
    if (!staged && pendingIntent && adoptIntent && pendingIntent.quoteRevs && typeof pendingIntent.quoteRevs === 'object') {
      quoteRevs = { ...pendingIntent.quoteRevs };
    }

    const selectedRoomIds = new Set(
      (staged && Array.isArray(staged.selectedRoomIds) && staged.selectedRoomIds.length)
        ? staged.selectedRoomIds
        : []
    );
    for (const r of intentRooms) selectedRoomIds.add(r.roomId);

    let travelers = (staged && Array.isArray(staged.travelers) && staged.travelers.length)
      ? staged.travelers
      : (intentTravelers
        ? JSON.parse(JSON.stringify(intentTravelers))
        : [{ id: 'gst_' + crypto.randomUUID().slice(0, 12), name: '', sex: '', nationality: '', residenceCountry: '', birthDate: '', idDocType: '', idDocNumber: '', roomId: '' }]);

    const it = intentTerms || {};
    const initialGroupName = (staged && staged.groupName) || it.groupName || '';
    const initialCheckIn = (staged && staged.checkIn) || it.checkIn || today;
    const initialCheckOut = (staged && staged.checkOut) || it.checkOut || tomorrow;
    const initialContactName = (staged && staged.contactName) || it.contactName || '';
    const initialContactPhone = (staged && staged.contactPhone) || it.contactPhone || '';
    const initialContactEmail = (staged && staged.contactEmail) || it.contactEmail || '';
    const initialAccountId = (staged && staged.accountId) || it.accountId || '';
    const initialChannel = (staged && staged.channel) || it.channel || 'direct';
    const initialBoard = (staged && staged.board) || it.board || 'room_only';

    const hasSavedRooms = Object.keys(savedRooms).length > 0;

    const m = K().modal({
      tag: tx('RÉSERVATION DE GROUPE'),
      title: tx('Nouveau dossier groupe'),
      desc: tx('Sélection multi-chambres avec contrôle de disponibilité serveur, répartition des voyageurs et pré-confirmation.'),
      width: 920,
      body: `
        <form class="hx-group-modal" data-hx-group-form>
          <div data-hx-group-recovery-slot>
            ${hasSavedRooms ? `
              <div class="hx-group-partial-alert" data-hx-group-resume-alert>
                <b>${tx('Dossier en cours de reprise')}</b>${hxColon()}${tx('{n} chambre(s) déjà enregistrée(s) sous le dossier {code}.', { n: Object.keys(savedRooms).length, code: `<code>${esc(groupDossierId)}</code>` })}
                <br>${tx('Les chambres confirmées sont conservées et verrouillées. Vous pouvez finaliser les chambres restantes ou remplacer une chambre indisponible.')}
                <div style="margin-top:6px;display:flex;gap:8px;">
                  <button type="button" class="hx-link-btn" data-action="hx-discard-staged">${tx('Abandonner ce brouillon local')}</button>
                </div>
              </div>
            ` : ''}
            ${!hasSavedRooms && committedTerms ? `
              <div class="hx-group-partial-alert" data-hx-group-resume-alert>
                <b>${tx('Tentative précédente reprise')}</b>${hxColon()}${tx('aucune chambre enregistrée, et les informations sont verrouillées pour protéger l’envoi en cours.')}
                <br>${tx('Finalisez l’envoi, ou repartez d’un dossier vierge.')}
                <div style="margin-top:6px;display:flex;gap:8px;">
                  <button data-activation=write type="button" class="hx-link-btn" data-action="hx-discard-staged">${tx('Abandonner et nouveau dossier vierge')}</button>
                </div>
              </div>
            ` : ''}
            ${(!hasSavedRooms && !committedTerms && (staged || pendingIntent)) ? `
              <div class="hx-group-partial-alert" data-hx-group-resume-alert>
                <b>${tx('Brouillon repris')}</b>${hxColon()}${tx('ce formulaire a été prérempli avec une saisie précédente')}${staged && staged.dossierId ? ` (${tx('dossier {code}', { code: `<code>${esc(staged.dossierId)}</code>` })})` : ''}.
                <br>${tx('Aucune chambre n’a été enregistrée. Vous pouvez continuer, ou repartir d’un dossier vierge.')}
                <div style="margin-top:6px;display:flex;gap:8px;">
                  <button data-activation=write type="button" class="hx-link-btn" data-action="hx-discard-staged">${tx('Abandonner et nouveau dossier vierge')}</button>
                </div>
              </div>
            ` : ''}
          </div>

          <div class="hx-commercial-hero">
            <div>
              <span class="hx-commercial-eyebrow">${tx('DOSSIER GROUPE · RÉSERVATION MULTI-CHAMBRES')}</span>
              <h3 style="margin:4px 0;font-size:16px;">${tx('Séminaires, agences et groupes de voyageurs')}</h3>
              <p style="font-size:12px;color:var(--n-600);margin:0;">${tx('Chaque chambre est contrôlée et garantie sous la même référence de dossier.')}</p>
            </div>
          </div>

          <fieldset class="hx-room-form-wide" style="border:1px solid var(--n-200);border-radius:12px;padding:14px;">
            <legend style="font-size:12px;font-weight:600;padding:0 6px;">${tx('1. Informations du groupe et séjour')}</legend>
            <div class="hx-room-form hx-type-form">
              <label class="hx-room-form-wide"><span>${tx('Nom du groupe / événement *')}</span><input name="groupName" required maxlength="120" placeholder="${tx('Ex. Séminaire Atlas Tech, Groupe Tourisme')}" value="${esc(initialGroupName)}"></label>
              <label><span>${tx('Date d’arrivée *')}</span><input name="checkIn" type="date" required value="${esc(initialCheckIn)}"></label>
              <label><span>${tx('Date de départ *')}</span><input name="checkOut" type="date" required value="${esc(initialCheckOut)}"></label>
              <label><span>${tx('Contact principal (nom) *')}</span><input name="contactName" required maxlength="100" placeholder="${tx('Nom du responsable')}" value="${esc(initialContactName)}"></label>
              <label><span>${tx('Téléphone contact')}</span><input name="contactPhone" maxlength="32" dir="ltr" placeholder="${tx('Ex. +212 6...')}" value="${esc(initialContactPhone)}"></label>
              <label><span>${tx('E-mail contact')}</span><input name="contactEmail" type="email" maxlength="160" dir="ltr" placeholder="contact@groupe.com" value="${esc(initialContactEmail)}"></label>
              <label><span>${tx('Compte commercial')}</span><select name="accountId">
                <option value="">${tx('Sans compte commercial')}</option>
                ${(commState.accounts || []).filter(a => !a.archived).map(a => `<option value="${esc(a.id)}" ${a.id === initialAccountId ? 'selected' : ''}>${esc(cuKinds[a.kind] + ' · ' + a.name)}</option>`).join('')}
              </select></label>
              <label><span>${tx('Canal')}</span><select name="channel">
                <option value="direct" ${initialChannel === 'direct' ? 'selected' : ''}>${tx('Direct')}</option>
                <option value="agency" ${initialChannel === 'agency' ? 'selected' : ''}>${tx('Agence')}</option>
                <option value="booking" ${initialChannel === 'booking' ? 'selected' : ''}>Booking.com</option>
                <option value="expedia" ${initialChannel === 'expedia' ? 'selected' : ''}>Expedia</option>
                <option value="other" ${initialChannel === 'other' ? 'selected' : ''}>${tx('Autre')}</option>
              </select></label>
              <label><span>${tx('Formule repas par défaut')}</span><select name="board">
                ${Object.entries(cuBoards).map(([v, l]) => `<option value="${v}" ${v === initialBoard ? 'selected' : ''}>${esc(l)}</option>`).join('')}
              </select></label>
            </div>
          </fieldset>

          <fieldset class="hx-room-form-wide" style="border:1px solid var(--n-200);border-radius:12px;padding:14px;">
            <legend style="font-size:12px;font-weight:600;padding:0 6px;">${tx('2. Sélection des chambres')}</legend>
            <div class="hx-group-filter-bar" style="display:flex;flex-wrap:wrap;gap:12px;align-items:flex-start;margin-bottom:12px;font-size:12px;">
              <div style="display:flex;flex-direction:column;gap:4px;">
                <span style="font-weight:500;">${tx('Section / Étage (choix multiple) :')}</span>
                <div class="hx-group-filter-floors" style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;">
                  ${Object.values(st.floors || {}).map(f => `
                    <label class="hx-filter-pill-label">
                      <input type="checkbox" data-hx-filter-floor="${esc(f.id)}">
                      <span>${esc(f.name)}</span>
                    </label>
                  `).join('')}
                </div>
              </div>
              <label>${tx('Catégorie :')}
                <select data-hx-filter-type>
                  <option value="">${tx('Toutes les catégories')}</option>
                  ${types.map(t => `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join('')}
                </select>
              </label>
              <label>${tx('Vue :')}
                <select data-hx-filter-view>
                  <option value="">${tx('Toutes les vues')}</option>
                  ${((Array.isArray(st.views) && st.views.length) ? st.views : DEFAULT_VIEWS).map(v => `<option value="${esc(v)}">${esc(cuViewLabel(v))}</option>`).join('')}
                </select>
              </label>
              <label>${tx('Capacité min. :')}
                <select data-hx-filter-cap>
                  <option value="0">${tx('Toutes capacités')}</option>
                  <option value="1">${tx('1+ personne')}</option>
                  <option value="2">${tx('2+ personnes')}</option>
                  <option value="3">${tx('3+ personnes')}</option>
                  <option value="4">${tx('4+ personnes')}</option>
                </select>
              </label>
              <label>${tx('Portes communicantes :')}
                <select data-hx-filter-conn>
                  <option value="">${tx('Toutes')}</option>
                  <option value="with">${tx('Avec porte communicante')}</option>
                  <option value="without">${tx('Sans communicante')}</option>
                </select>
              </label>
            </div>

            <div class="hx-group-rooms-grid" data-hx-group-rooms-grid></div>

            <div class="hx-group-summary-card" data-hx-rooms-summary style="margin-top:10px;">
              <span data-hx-rooms-counter>${tx('0 chambre sélectionnée')}</span>
            </div>
          </fieldset>

          <fieldset class="hx-room-form-wide" style="border:1px solid var(--n-200);border-radius:12px;padding:14px;">
            <legend style="font-size:12px;font-weight:600;padding:0 6px;">${tx('3. Fiche et répartition des voyageurs')}</legend>
            <div class="hx-group-paste-wrap">
              <details data-hx-import-details>
                <summary style="font-size:12px;color:var(--atlas);cursor:pointer;font-weight:500;">${tx('Importer rapidement une liste de voyageurs (copier-coller CSV / TSV)')}</summary>
                <div style="margin-top:8px;">
                  <textarea class="hx-group-paste-area" data-hx-group-paste placeholder="${tx('Collez les voyageurs (un voyageur par ligne : “Nom, Prénom”, Nationalité, Document)…')}"></textarea>
                  <div style="margin-top:6px;display:flex;gap:8px;align-items:center;">
                    <button data-activation=write type="button" class="hx-btn ghost" data-action="hx-preview-paste">${tx('Prévisualiser l’import')}</button>
                  </div>
                  <div data-hx-import-preview-area style="margin-top:8px;"></div>
                </div>
              </details>
            </div>

            <div class="hx-group-travelers-sec" style="margin-top:10px;">
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <span style="font-size:12px;font-weight:600;color:var(--ink);" data-hx-travelers-count>${tx('{n} voyageur(s)', { n: travelers.length, c: txn(travelers.length, 'voyageur') })}</span>
                <button data-activation=write type="button" class="hx-btn ghost" data-action="hx-add-group-traveler">+ ${tx('Ajouter un voyageur')}</button>
              </div>
              <div data-hx-group-travelers-container></div>
              <div data-hx-capacity-alerts style="margin-top:8px;"></div>
            </div>
          </fieldset>

          <div data-hx-group-quote-slot></div>

          <div class="hx-group-summary-card" data-hx-group-review>
            <h4 style="margin:0 0 6px;font-size:13.5px;color:var(--ink);">${tx('Récapitulatif du dossier de groupe')}</h4>
            <div class="hx-group-summary-grid">
              <div><small style="color:var(--n-500);display:block;">${tx('Identifiant dossier')}</small><code style="font-family:var(--mono);font-size:11.5px;">${esc(groupDossierId)}</code></div>
              <div><small style="color:var(--n-500);display:block;">${tx('Période')}</small><span data-hx-rev-dates>-</span></div>
              <div><small style="color:var(--n-500);display:block;">${tx('Chambres réservées')}</small><b data-hx-rev-rooms>${tx('0 chambre')}</b></div>
              <div><small style="color:var(--n-500);display:block;">${tx('Voyageurs enregistrés')}</small><span data-hx-rev-guests>${txn(0, 'personne')}</span></div>
            </div>
          </div>

          <p class="hx-stay-error" data-hx-group-error role="status" style="margin:4px 0;"></p>

          <div class="hx-room-form-actions">
            <button type="button" class="hx-btn ghost" data-action="hx-group-cancel">${tx('Fermer')}</button>
            <button data-activation=write type="submit" class="hx-btn atlas" data-hx-group-submit>${hasSavedRooms ? tx('Reprendre la confirmation ({n} enregistrée(s))', { n: Object.keys(savedRooms).length }) : tx('Confirmer la réservation du groupe')}</button>
          </div>
        </form>
      `
    });

    scope.openModal = { el: m.el, close: m.close };
    const form = m.el.querySelector('[data-hx-group-form]');
    const roomsGrid = form.querySelector('[data-hx-group-rooms-grid]');
    const roomsCounter = form.querySelector('[data-hx-rooms-counter]');
    const travelersContainer = form.querySelector('[data-hx-group-travelers-container]');
    const travelersCountLabel = form.querySelector('[data-hx-travelers-count]');
    const capacityAlerts = form.querySelector('[data-hx-capacity-alerts]');
    const quoteSlot = form.querySelector('[data-hx-group-quote-slot]');
    const errorEl = form.querySelector('[data-hx-group-error]');

    let filterFloors = new Set();
    let filterType = '';
    let filterView = '';
    let filterMinCap = 0;
    let filterConn = '';

    // A partially committed dossier is one commercial identity: group name,
    // contact, channel, dates, account and meal plan all freeze with the
    // first saved room. They must not LOOK editable afterwards — any edit
    // would either split the dossier across two identities or be silently
    // ignored for the rooms already on the server. The frozen values live in
    // committedTerms (defect 1) and are restored from the draft cache.
    const lockCommittedFields = () => {
      // Locked once the dossier has proven rooms OR frozen terms (an adopted
      // unresolved intent): in both cases the controls no longer feed the
      // submission, and an editable look would promise edits that go nowhere.
      const frozen = Object.keys(savedRooms).length > 0 || !!committedTerms;
      for (const name of ['groupName', 'checkIn', 'checkOut', 'contactName', 'contactPhone', 'contactEmail', 'accountId', 'channel', 'board']) {
        if (form.elements[name]) form.elements[name].disabled = frozen;
      }
    };

    const persistStaged = () => {
      try {
        const payload = {
          merchant: initialMerchant,
          dossierId: groupDossierId,
          groupName: String(form.elements.groupName?.value || '').trim(),
          checkIn: form.elements.checkIn?.value,
          checkOut: form.elements.checkOut?.value,
          contactName: String(form.elements.contactName?.value || '').trim(),
          contactPhone: String(form.elements.contactPhone?.value || '').trim(),
          contactEmail: String(form.elements.contactEmail?.value || '').trim(),
          accountId: form.elements.accountId?.value || '',
          channel: form.elements.channel?.value || 'direct',
          board: form.elements.board?.value || 'room_only',
          committedTerms,
          quoteRevs,
          selectedRoomIds: Array.from(selectedRoomIds),
          savedRooms,
          failedRooms,
          travelers,
          quoteBreakdown,
          quoteRevision,
          quoteAccepted,
          updatedAt: Date.now(),
        };
        localStorage.setItem(stagedKey, JSON.stringify(payload));
        return true;
      } catch (_) { return false; }
    };

    // Authoritative submission terms for this attempt (defect 1). Frozen
    // terms win over live controls: after a partial save the controls that
    // carry them are disabled (and therefore invisible to FormData), so the
    // frozen model is the only honest source.
    const getTerms = () => {
      if (committedTerms) return { ...committedTerms };
      return {
        groupName: String(form.elements.groupName?.value || '').trim(),
        checkIn: form.elements.checkIn?.value || '',
        checkOut: form.elements.checkOut?.value || '',
        contactName: String(form.elements.contactName?.value || '').trim(),
        contactPhone: String(form.elements.contactPhone?.value || '').trim(),
        contactEmail: String(form.elements.contactEmail?.value || '').trim(),
        accountId: form.elements.accountId?.value || '',
        channel: form.elements.channel?.value || 'direct',
        board: form.elements.board?.value || 'room_only',
      };
    };
    const freezeTerms = (terms) => {
      committedTerms = { ...terms };
      persistStaged();
    };
    const termsDiffer = (a, b) => {
      const keys = ['groupName', 'checkIn', 'checkOut', 'contactName', 'contactPhone', 'contactEmail', 'accountId', 'channel', 'board'];
      return keys.some(k => String(a?.[k] ?? '') !== String(b?.[k] ?? ''));
    };

    const cuGroupQuoteSignature = () => {
      const checkIn = form.elements.checkIn?.value || '';
      const checkOut = form.elements.checkOut?.value || '';
      const board = form.elements.board?.value || 'room_only';
      const accountId = form.elements.accountId?.value || '';
      const selected = Array.from(selectedRoomIds).sort();
      const roomsInfo = selected.map(rid => {
        const room = allRooms.find(r => r.id === rid);
        const count = travelers.filter(t => t.roomId === rid).length;
        return `${rid}:${room?.typeId || ''}:${count}`;
      }).join(';');
      return `${checkIn}|${checkOut}|${board}|${accountId}|${roomsInfo}`;
    };

    let activeQuoteSignature = quoteAccepted ? cuGroupQuoteSignature() : '';

    const invalidateQuote = () => {
      quoteGen++;
      quoteAccepted = false;
      quoteBreakdown = {};
      quoteRevision = null;
      quoteRevs = {};
      activeQuoteSignature = '';
      renderQuoteBox();
      persistStaged();
    };

    const syncTravelersFromDom = () => {
      const rows = travelersContainer.querySelectorAll('[data-hx-group-traveler]');
      if (!rows.length) return;
      const updated = [];
      rows.forEach((row) => {
        const id = row.dataset.travelerId;
        const name = String(row.querySelector('[data-hx-t-name]')?.value || '').trim();
        const sex = String(row.querySelector('[data-hx-t-sex]')?.value || '').trim();
        const nationality = String(row.querySelector('[data-hx-guest-nationality]')?.value || '').trim();
        const birthDate = String(row.querySelector('[data-hx-t-birth]')?.value || '').trim();
        const idDocNumber = String(row.querySelector('[data-hx-t-doc]')?.value || '').trim();
        const roomId = String(row.querySelector('[data-hx-t-room]')?.value || '').trim();
        const existing = travelers.find(t => t.id === id) || {};
        updated.push({
          ...existing,
          id,
          name,
          sex,
          nationality,
          birthDate,
          idDocNumber,
          roomId,
        });
      });
      travelers = updated;
    };

    const renderRooms = () => {
      const filtered = allRooms.filter(r => {
        if (filterFloors.size > 0 && !filterFloors.has(r.floorId) && !filterFloors.has(r.floor)) return false;
        if (filterType && r.typeId !== filterType) return false;
        if (filterView && r.view !== filterView) return false;
        if (filterMinCap > 0 && (roomTypeOf(r.n).maxGuests || 2) < filterMinCap) return false;
        const hasConn = Array.isArray(r.connectingRoomIds) && r.connectingRoomIds.length > 0;
        if (filterConn === 'with' && !hasConn) return false;
        if (filterConn === 'without' && hasConn) return false;
        return true;
      });

      if (!filtered.length) {
        roomsGrid.innerHTML = `<div style="padding:16px;color:var(--n-500);font-size:12px;text-align:center;">${tx('Aucune chambre correspondante aux filtres.')}</div>`;
        return;
      }

      roomsGrid.innerHTML = filtered.map(r => {
        const type = roomTypeOf(r.n);
        const isChecked = selectedRoomIds.has(r.id);
        const isSaved = !!savedRooms[r.id];
        const isFailed = !!failedRooms[r.id];
        const connRoomNumbers = (r.connectingRoomIds || [])
          .map(cid => allRooms.find(x => x.id === cid)?.n)
          .filter(Boolean);

        let badge = '';
        if (isSaved) {
          badge = `<span class="hx-badge-saved">${tx('Chambre enregistrée')}</span>`;
        } else if (isFailed) {
          badge = '<span class="hx-badge-dup" style="font-size:11px;">' + tx('Échec : {reason}', { reason: esc(failedRooms[r.id]) }) + '</span>';
        }

        return `
          <label class="hx-group-room-card ${isChecked ? 'is-selected' : ''} ${isSaved ? 'is-saved' : ''}" data-room-card-id="${esc(r.id)}">
            <input type="checkbox" data-hx-group-cb value="${esc(r.id)}" ${isChecked ? 'checked' : ''} ${isSaved ? 'disabled' : ''}>
            <div class="hx-group-room-details">
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <span class="hx-group-room-title">${tx('Chambre {n}', { n: r.n })}</span>
                ${badge}
              </div>
              <span class="hx-group-room-sub">${esc(type.name)} · ${tx('max {n} pers.', { n: type.maxGuests || 4 })} · ${type.base != null ? tx('{amount}/nuit', { amount: MAD(type.base) }) : tx('Tarif standard')}</span>
              ${connRoomNumbers.length ? `<span class="hx-group-room-conn">${tx('Porte communicante : ch. {list}', { list: esc(connRoomNumbers.join(', ')) })}</span>` : ''}
            </div>
          </label>
        `;
      }).join('');
    };

    const renderQuoteBreakdownHtml = () => {
      const selected = allRooms.filter(r => selectedRoomIds.has(r.id));
      let totalCentsAll = 0;
      let allQuoted = true;
      const lines = selected.map(r => {
        const q = quoteBreakdown[r.id];
        if (!q || !Array.isArray(q.rows) || !Number.isSafeInteger(q.totalCents)) {
          allQuoted = false;
          return `<div>${tx('Ch. {n}', { n: r.n })} (${esc(roomTypeOf(r.n).name)})${hxColon()}<span style="color:var(--warn-ink);">${tx('En attente de calcul')}</span></div>`;
        }
        totalCentsAll += q.totalCents;
        const roomMad = cuDraftMoney(q.totalCents);
        const nights = q.rows.length;
        const rates = q.rows.map(row => row.amountCents);
        const minRate = cuDraftMoney(Math.min(...rates));
        const maxRate = cuDraftMoney(Math.max(...rates));
        const rateSummary = minRate === maxRate ? tx('{amount} MAD/nuit', { amount: ltr(minRate) }) : tx('de {min} à {max} MAD/nuit', { min: ltr(minRate), max: ltr(maxRate) });
        const taxLabel = q.taxBasis === 'exclusive' ? tx('HT') : tx('TTC');
        return `<div>${tx('Ch. {n}', { n: r.n })} (${esc(roomTypeOf(r.n).name)})${hxColon()}<b>${ltr(roomMad + ' MAD')} ${taxLabel}</b> (${txn(nights, 'nuit')} · ${rateSummary})</div>`;
      });
      if (allQuoted && selected.length > 0) {
        const totalMadAll = cuDraftMoney(totalCentsAll);
        const groupTax = Object.values(quoteBreakdown)[0]?.taxBasis === 'exclusive' ? tx('HT') : tx('TTC');
        lines.push(`<div style="margin-top:4px;font-weight:700;color:var(--ink);border-top:1px dashed var(--n-200);padding-top:4px;">${tx('Total commercial groupe : {amount} MAD {tax}', { amount: ltr(totalMadAll), tax: groupTax })}</div>`);
      }
      return lines.join('');
    };

    // Direct-guest group pricing (defect: no account needed). Pure recompute
    // from the hotel's own type configuration; agreed prices are not offered
    // here — a room without a configured rate names exactly what is missing.
    const groupDirectQuotes = () => {
      const board = form.elements.board?.value || 'room_only';
      const checkIn = form.elements.checkIn?.value || '';
      const checkOut = form.elements.checkOut?.value || '';
      const perRoom = {};
      let totalCents = 0, allOk = true;
      const missing = [];
      for (const r of allRooms.filter(x => selectedRoomIds.has(x.id))) {
        const type = cuTypes().find(t => t.id === r.typeId);
        const occ = Math.max(1, travelers.filter(t => t.roomId === r.id).length);
        const q = cuDirectQuote({
          typeRate: type ? type.rate : null, baseRate: cuState().baseRate, boardRates: type ? type.boardRates : null,
          board, checkIn, checkOut, occupancy: occ,
        });
        if (q.ok) {
          perRoom[r.id] = { rows: q.rows, totalCents: q.totalCents, nights: q.nights };
          totalCents += q.totalCents;
        } else {
          perRoom[r.id] = { missing: q.missing };
          allOk = false;
          missing.push({ room: r, missing: q.missing });
        }
      }
      return { perRoom, totalCents, allOk, missing };
    };

    const renderQuoteBox = () => {
      const board = form.elements.board?.value || 'room_only';
      const accountId = form.elements.accountId?.value || '';
      const selected = allRooms.filter(r => selectedRoomIds.has(r.id));
      const contractMode = !!accountId;
      if (!contractMode) {
        if (!selected.length) { quoteSlot.innerHTML = ''; return; }
        const dq = groupDirectQuotes();
        const lines = selected.map(r => {
          const q = dq.perRoom[r.id];
          if (!q || !q.rows) {
            const what = (q && q.missing && q.missing.includes('room'))
              ? tx('sans tarif logement pour « {type} »', { type: esc(roomTypeOf(r.n).name) })
              : tx('sans tarif « {board} » pour « {type} »', { board: esc(cuBoards[board] || board), type: esc(roomTypeOf(r.n).name) });
            return `<div>${tx('Ch. {n}', { n: r.n })}${hxColon()}<span style="color:var(--warn-ink);">${tx('En attente de tarif, {what}. Renseignez-le dans Types de chambres, ou réservez cette chambre en prix convenu depuis sa fiche individuelle.', { what })}</span></div>`;
          }
          return `<div>${tx('Ch. {n}', { n: r.n })} (${esc(roomTypeOf(r.n).name)})${hxColon()}<b>${ltr(cuDraftMoney(q.totalCents) + ' MAD')} ${tx('TTC')}</b> (${txn(q.nights, 'nuit')})</div>`;
        });
        if (dq.allOk && selected.length > 0) {
          lines.push(`<div style="margin-top:4px;font-weight:700;color:var(--ink);border-top:1px dashed var(--n-200);padding-top:4px;">${tx('Total groupe (tarifs maison) : {amount} MAD TTC', { amount: ltr(cuDraftMoney(dq.totalCents)) })}</div>`);
        }
        quoteSlot.innerHTML = `
          <div class="hx-quote-group-card">
            <div class="hx-quote-group-title">${tx('Tarifs maison · Formule : {board}', { board: esc(cuBoards[board] || board) })}</div>
            <p style="font-size:11.5px;color:var(--n-600);margin:0 0 8px;">${tx('Sans compte : chaque chambre est chiffrée au tarif configuré de sa catégorie. Vérifié côté serveur avant enregistrement.')}</p>
            <div class="hx-quote-group-breakdown">${lines.join('')}</div>
          </div>`;
        return;
      }


      const allQuoted = selected.length > 0 && selected.every(r => quoteBreakdown[r.id] && Number.isSafeInteger(quoteBreakdown[r.id].totalCents));
      const hasTaxExclusive = selected.some(r => quoteBreakdown[r.id]?.taxBasis === 'exclusive');

      let unsupportedWarn = '';
      if (board !== 'room_only' && !accountId) {
        unsupportedWarn = `<p class="hx-warn-note" style="color:var(--warn-ink);background:var(--warn-soft);padding:6px 10px;border-radius:6px;font-size:11.5px;margin:4px 0;">${tx('Formule repas : un compte commercial avec des contrats actifs est requis pour cette formule.')}</p>`;
      } else {
        const overCapRooms = selected.filter(r => {
          const count = travelers.filter(t => t.roomId === r.id).length;
          return count > 3;
        });
        if (overCapRooms.length > 0) {
          unsupportedWarn = `<p class="hx-warn-note" style="color:var(--danger,#b91c1c);background:rgba(201,74,58,0.08);padding:6px 10px;border-radius:6px;font-size:11.5px;margin:4px 0;">${tx('Attention : La tarification contractuelle couvre au maximum 3 personnes par chambre. Les chambres {list} dépassent cette limite (1 à 3 pers.).', { list: overCapRooms.map(r => r.n).join(', ') })}</p>`;
        }
      }

      let acceptCheckboxHtml = '';
      if (allQuoted && !unsupportedWarn) {
        if (hasTaxExclusive) {
          acceptCheckboxHtml = `<p class="hx-warn-note" style="color:var(--warn-ink);margin-top:6px;font-size:11.5px;">${tx('Tarif HT détecté : la configuration fiscale est requise avant validation.')}</p>`;
        } else {
          acceptCheckboxHtml = `
            <label class="hx-quote-accept" style="font-size:12px;display:flex;align-items:center;gap:6px;cursor:pointer;">
              <input type="checkbox" data-hx-group-accept-quote ${quoteAccepted ? 'checked' : ''}>
              <span>${tx('J’accepte ce devis commercial pour l’ensemble des chambres et la formule choisie.')}</span>
            </label>
          `;
        }
      } else {
        acceptCheckboxHtml = `
          <label class="hx-quote-accept" style="font-size:12px;display:flex;align-items:center;gap:6px;color:var(--n-500);cursor:not-allowed;">
            <input type="checkbox" disabled>
            <span>${tx('Simulez un devis complet et valide pour pouvoir accepter les tarifs.')}</span>
          </label>
        `;
      }

      quoteSlot.innerHTML = `
        <div class="hx-quote-group-card">
          <div class="hx-quote-group-title">${tx('Tarification commerciale · Formule : {board}', { board: esc(cuBoards[board] || board) })}</div>
          ${quoteRevision != null ? `<div style="font-size:11px;color:var(--n-500);margin:2px 0 6px;">${tx('Révision commerciale n°{n}', { n: quoteRevision })} · ${quoteAccepted ? tx('devis accepté pour ces tarifs') : tx('en attente d’acceptation')}</div>` : ''}
          <p style="font-size:11.5px;color:var(--n-600);margin:0 0 8px;">${tx('Cette formule nécessite la simulation et l’acceptation d’un devis commercial avant validation.')}</p>
          ${unsupportedWarn}
          <div class="hx-quote-group-breakdown" data-hx-quote-breakdown>
            ${allQuoted ? renderQuoteBreakdownHtml() : `<span style="color:var(--n-500);">${tx('Devis non encore simulé ou incomplet.')}</span>`}
          </div>
          <div style="display:flex;gap:8px;align-items:center;margin-top:6px;">
            <button type="button" class="hx-btn ghost" data-action="hx-simulate-group-quote" style="font-size:11.5px;padding:4px 10px;">${tx('Simuler / Actualiser le devis')}</button>
          </div>
          <div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--n-100);">
            ${acceptCheckboxHtml}
          </div>
        </div>
      `;
    };

    // Monotonic quote generation (defect 4): overlapping simulations and
    // late failures must neither replace nor clear a newer quote. The
    // signature guard below only sees user edits; the generation sees time.
    let quoteGen = 0;

    const simulateQuotes = async () => {
      syncTravelersFromDom();
      const selected = allRooms.filter(r => selectedRoomIds.has(r.id));
      if (!selected.length) {
        toast(tx('Sélectionnez au moins une chambre avant de simuler le devis.'), { type: 'warn' });
        return;
      }
      const board = form.elements.board?.value || 'room_only';
      const accountId = form.elements.accountId?.value || null;
      const checkIn = form.elements.checkIn.value;
      const checkOut = form.elements.checkOut.value;

      if (board !== 'room_only' && !accountId) {
        toast(tx('Formule repas : sélectionnez un compte commercial avant de simuler le devis.'), { type: 'warn' });
        return;
      }

      for (const room of selected) {
        const occ = travelers.filter(t => t.roomId === room.id).length;
        if (occ > 3) {
          toast(tx('Chambre {n} : la tarification contractuelle couvre de 1 à 3 personnes (actuellement {occ}).', { n: room.n, occ }), { type: 'warn' });
          return;
        }
      }

      const simBtn = form.querySelector('[data-action="hx-simulate-group-quote"]');
      if (simBtn) { simBtn.disabled = true; simBtn.textContent = tx('Calcul en cours…'); }

      quoteBreakdown = {};
      quoteAccepted = false;
      quoteRevision = null;
      quoteRevs = {};
      const targetSig = cuGroupQuoteSignature();
      const gen = ++quoteGen;

      try {
        let firstRev = null;
        const revs = {};
        for (const room of selected) {
          const roomGuests = travelers.filter(t => t.roomId === room.id);
          const occupancy = Math.max(1, roomGuests.length);
          const res = await fetch('/api/hotel/commercial', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'quote',
              merchant: initialMerchant,
              accountId,
              roomTypeId: room.typeId,
              checkIn,
              checkOut,
              occupancy,
              board,
            }),
          });

          if (initialScope !== cuStayScope() || initialMerchant !== cuMerchantSlug() || scope.openModal?.el !== m.el || !form.isConnected) {
            return;
          }
          if (gen !== quoteGen) {
            return;
          }
          if (targetSig !== cuGroupQuoteSignature()) {
            return;
          }

          const b = await res.json().catch(() => ({}));
          if (gen !== quoteGen) {
            return;
          }
          if (!res.ok || !b.quote) {
            throw new Error(tx('Chambre {n} : {reason}', { n: room.n, reason: cuCommercialError(b.error) || b.error || tx('Erreur devis') }));
          }
          // One reviewed group, one directory revision (defect 4): if the
          // commercial directory moved between two rooms' responses, the
          // displayed totals would mix two price lists while the submission
          // carries a single revision. Reject the whole simulation instead.
          if (!Number.isSafeInteger(b.rev)) {
            throw new Error(tx('Chambre {n} : devis sans révision vérifiable. Relancez la simulation.', { n: room.n }));
          }
          if (firstRev === null) {
            firstRev = b.rev;
          } else if (b.rev !== firstRev) {
            throw new Error(tx('Le répertoire commercial a changé pendant la simulation (révision {a} puis {b}). Relancez la simulation pour un devis cohérent.', { a: firstRev, b: b.rev }));
          }
          revs[room.id] = b.rev;
          quoteBreakdown[room.id] = b.quote;
        }

        if (gen !== quoteGen) {
          return;
        }
        quoteRevision = firstRev;
        quoteRevs = revs;
        activeQuoteSignature = targetSig;
        renderQuoteBox();
        persistStaged();
        toast(tx('Devis commercial simulé avec succès'), { type: 'success' });
      } catch (err) {
        // A late failure from an older attempt must not wipe the newer
        // quote it no longer owns (defect 4: async results clearing newer).
        if (gen !== quoteGen) {
          return;
        }
        quoteBreakdown = {};
        quoteAccepted = false;
        quoteRevision = null;
        quoteRevs = {};
        activeQuoteSignature = '';
        renderQuoteBox();
        const area = quoteSlot.querySelector('[data-hx-quote-breakdown]');
        if (area) area.innerHTML = `<span style="color:var(--danger,#b91c1c);">${esc(err.message)}</span>`;
      } finally {
        const btn = form.querySelector('[data-action="hx-simulate-group-quote"]');
        if (btn) { btn.disabled = false; btn.textContent = tx('Simuler / Actualiser le devis'); }
      }
    };

    const updateRoomsSummary = () => {
      const selected = allRooms.filter(r => selectedRoomIds.has(r.id));
      const totalCapacity = selected.reduce((acc, r) => acc + (roomTypeOf(r.n).maxGuests || 4), 0);
      const nights = Math.max(1, Math.round((Date.parse(form.elements.checkOut.value + 'T12:00:00Z') - Date.parse(form.elements.checkIn.value + 'T12:00:00Z')) / 86400000) || 1);
      const totalEst = selected.reduce((acc, r) => {
        const baseRate = roomTypeOf(r.n).base ?? cuState().baseRate ?? 0;
        return acc + (baseRate * nights);
      }, 0);

      const visibleSelectedCount = allRooms.filter(r => selectedRoomIds.has(r.id) &&
        (filterFloors.size === 0 || filterFloors.has(r.floorId) || filterFloors.has(r.floor)) &&
        (!filterType || r.typeId === filterType) &&
        (!filterView || r.view === filterView) &&
        (filterMinCap === 0 || (roomTypeOf(r.n).maxGuests || 2) >= filterMinCap) &&
        (filterConn !== 'with' || (Array.isArray(r.connectingRoomIds) && r.connectingRoomIds.length > 0)) &&
        (filterConn !== 'without' || (!Array.isArray(r.connectingRoomIds) || r.connectingRoomIds.length === 0))
      ).length;

      let counterHtml = `<b>${tx('{n} chambre(s) sélectionnée(s)', { n: selected.length, c: txn(selected.length, 'chambre') })}</b>`;
      if (selected.length > 0 && visibleSelectedCount < selected.length) {
        counterHtml += ` (${tx('{n} visible(s) selon les filtres', { n: visibleSelectedCount })})`;
      }
      counterHtml += ` · ${tx('Capacité totale : {n} personnes', { n: totalCapacity, c: txn(totalCapacity, 'personne') })} · ${tx('Estimation base : {amount}', { amount: MAD(totalEst) })} (${txn(nights, 'nuit')})`;
      roomsCounter.innerHTML = counterHtml;

      form.querySelector('[data-hx-rev-dates]').textContent = `${cuDay(form.elements.checkIn.value)}${hxTo()}${cuDay(form.elements.checkOut.value)} (${txn(nights, 'nuit')})`;
      form.querySelector('[data-hx-rev-rooms]').textContent = tx('{n} chambre(s) ({v} validée(s))', { n: selected.length, c: txn(selected.length, 'chambre'), v: Object.keys(savedRooms).length });
      form.querySelector('[data-hx-rev-guests]').textContent = txn(travelers.length, 'voyageur');

      renderQuoteBox();
      updateTravelerRoomOptions();
      validateCapacity();
    };

    const updateTravelerRoomOptions = () => {
      // Committed rooms are not assignable (defect 3): a traveler parked on
      // a saved room would never reach the server, and the UI would pretend
      // otherwise. The row's own saved room stays visible so frozen rows
      // keep showing where their travelers sleep.
      const selected = allRooms.filter(r => selectedRoomIds.has(r.id));
      const roomSelects = form.querySelectorAll('[data-hx-t-room]');
      roomSelects.forEach(sel => {
        const currentVal = sel.value;
        const avail = selected.filter(r => !savedRooms[r.id] || r.id === currentVal);
        sel.innerHTML = `<option value="">${tx('-- Sélectionner une chambre --')}</option>` + avail.map(r => `<option value="${esc(r.id)}" ${r.id === currentVal ? 'selected' : ''}>${tx('Ch. {n}', { n: r.n })} · ${esc(roomTypeOf(r.n).name)}</option>`).join('');
      });
    };

    const travelerRowHtml = (t, idx) => {
      const selected = allRooms.filter(r => selectedRoomIds.has(r.id));
      const isUnassigned = !t.roomId;
      const isRoomSaved = !!(t.roomId && savedRooms[t.roomId]);
      return `
        <div class="hx-guest-item ${isUnassigned ? 'is-unassigned' : ''} ${isRoomSaved ? 'is-frozen' : ''}" data-hx-group-traveler data-traveler-id="${esc(t.id || ('gst_' + crypto.randomUUID().slice(0, 12)))}" style="margin-bottom:10px;">
          <div class="hx-guest-head" style="display:flex;justify-content:space-between;align-items:center;">
            <div style="display:flex;align-items:center;gap:8px;">
              <span>${tx('VOYAGEUR {n}', { n: idx + 1 })}</span>
              ${isUnassigned ? `<span class="hx-badge-unassigned">${tx('Non attribué à une chambre')}</span>` : ''}
              ${isRoomSaved ? `<span class="hx-badge-saved" style="font-size:11px;">${tx('Enregistré · Verrouillé')}</span>` : ''}
            </div>
            ${!isRoomSaved && travelers.length > 1 ? `<button type="button" class="hx-link-btn" data-action="hx-remove-group-traveler">${tx('Retirer')}</button>` : ''}
          </div>
          <div class="hx-guest-grid">
            <label><span>${tx('Nom complet *')}</span><input data-hx-t-name required placeholder="${tx('Nom et prénom')}" value="${esc(t.name || '')}" ${isRoomSaved ? 'disabled' : ''}></label>
            <label><span>${tx('Sexe')}</span><select data-hx-t-sex ${isRoomSaved ? 'disabled' : ''}>
              <option value="">${tx('Indéterminé')}</option>
              <option value="M" ${t.sex === 'M' ? 'selected' : ''}>${tx('Masculin (M)')}</option>
              <option value="F" ${t.sex === 'F' ? 'selected' : ''}>${tx('Féminin (F)')}</option>
            </select></label>
            <label><span>${tx('Nationalité')}</span>${cuNationalitySelectorHtml(t, idx, 'grp_', isRoomSaved)}</label>
            <label><span>${tx('Date de naissance')}</span><input type="date" dir="ltr" data-hx-t-birth value="${esc(t.birthDate || '')}" ${isRoomSaved ? 'disabled' : ''}></label>
            <label><span>${tx('N° de document')}</span><input dir="ltr" data-hx-t-doc placeholder="${tx('Passeport / CNIE')}" value="${esc(t.idDocNumber || '')}" ${isRoomSaved ? 'disabled' : ''}></label>
            <label><span>${tx('Chambre attribuée *')}</span><select data-hx-t-room ${isRoomSaved ? 'disabled' : ''} ${isUnassigned ? 'style="border-color:var(--warn-ink);"' : ''}>
              <option value="">${tx('-- Sélectionner une chambre --')}</option>
              ${selected.filter(r => !savedRooms[r.id] || r.id === t.roomId).map(r => `<option value="${esc(r.id)}" ${t.roomId === r.id ? 'selected' : ''}>${tx('Ch. {n}', { n: r.n })} · ${esc(roomTypeOf(r.n).name)}</option>`).join('')}
            </select></label>
          </div>
        </div>
      `;
    };

    const renderTravelers = () => {
      travelersContainer.innerHTML = travelers.map((t, idx) => travelerRowHtml(t, idx)).join('');
      travelersCountLabel.textContent = txn(travelers.length, 'voyageur');
      form.querySelector('[data-hx-rev-guests]').textContent = txn(travelers.length, 'voyageur');
      cuWireNationalitySelectors(travelersContainer);
      validateCapacity();
    };

    const validateCapacity = () => {
      syncTravelersFromDom();
      const selected = allRooms.filter(r => selectedRoomIds.has(r.id));
      const roomAssignedCounts = new Map();
      const names = [];
      let unassignedCount = 0;

      travelers.forEach(t => {
        const name = String(t.name || '').trim();
        if (name) names.push(cuNormalizeText(name));
        if (t.roomId) {
          roomAssignedCounts.set(t.roomId, (roomAssignedCounts.get(t.roomId) || 0) + 1);
        } else {
          unassignedCount++;
        }
      });

      const alerts = [];
      if (unassignedCount > 0) {
        alerts.push(`<p class="hx-warn-note" style="color:var(--warn-ink);background:var(--warn-soft);padding:6px 10px;border-radius:6px;font-size:11.5px;margin:3px 0;">${tx('Attention : {n} voyageur(s) ne sont pas encore attribués à une chambre.', { n: unassignedCount, c: txn(unassignedCount, 'voyageur') })}</p>`);
      }

      selected.forEach(r => {
        const assigned = roomAssignedCounts.get(r.id) || 0;
        const max = roomTypeOf(r.n).maxGuests || 4;
        if (assigned === 0) {
          alerts.push(`<p class="hx-warn-note" style="color:var(--warn-ink);background:var(--warn-soft);padding:6px 10px;border-radius:6px;font-size:11.5px;margin:3px 0;">${tx('Chambre {n} : aucun voyageur attribué.', { n: r.n })}</p>`);
        } else if (assigned > max) {
          alerts.push(`<p class="hx-warn-note" style="color:var(--danger,#b91c1c);background:rgba(201,74,58,0.08);padding:6px 10px;border-radius:6px;font-size:11.5px;margin:3px 0;">${tx('Attention : Chambre {n} dépasse sa capacité maximale ({a} / {max} pers.).', { n: r.n, a: assigned, max })}</p>`);
        }
      });

      const dups = names.filter((n, i) => names.indexOf(n) !== i);
      if (dups.length) {
        alerts.push(`<p class="hx-warn-note" style="color:var(--warn-ink);background:var(--warn-soft);padding:6px 10px;border-radius:6px;font-size:11.5px;margin:3px 0;">${tx('Noms en double détectés dans la liste des voyageurs. Vérifiez les homonymes.')}</p>`);
      }

      capacityAlerts.innerHTML = alerts.join('');
    };

    form.addEventListener('change', (e) => {
      const floorCb = e.target.closest('[data-hx-filter-floor]');
      if (floorCb) {
        const val = floorCb.getAttribute('data-hx-filter-floor');
        if (floorCb.checked) {
          filterFloors.add(val);
        } else {
          filterFloors.delete(val);
        }
        renderRooms();
        updateRoomsSummary();
      }
    });

    form.querySelector('[data-hx-filter-type]')?.addEventListener('change', (e) => {
      filterType = e.target.value; renderRooms(); updateRoomsSummary();
    });
    form.querySelector('[data-hx-filter-view]')?.addEventListener('change', (e) => {
      filterView = e.target.value; renderRooms(); updateRoomsSummary();
    });
    form.querySelector('[data-hx-filter-cap]')?.addEventListener('change', (e) => {
      filterMinCap = Number(e.target.value) || 0; renderRooms(); updateRoomsSummary();
    });
    form.querySelector('[data-hx-filter-conn]')?.addEventListener('change', (e) => {
      filterConn = e.target.value; renderRooms(); updateRoomsSummary();
    });

    roomsGrid.addEventListener('change', (e) => {
      const cb = e.target.closest('[data-hx-group-cb]');
      if (cb) {
        syncTravelersFromDom();
        if (cb.checked) {
          selectedRoomIds.add(cb.value);
        } else {
          selectedRoomIds.delete(cb.value);
          // Preserve travelers by unassigning rather than deleting
          travelers.forEach(t => {
            if (t.roomId === cb.value) {
              t.roomId = '';
            }
          });
        }
        invalidateQuote();
        const card = cb.closest('.hx-group-room-card');
        if (card) card.classList.toggle('is-selected', cb.checked);
        renderTravelers();
        updateRoomsSummary();
        persistStaged();
      }
    });

    form.elements.checkIn?.addEventListener('change', () => { invalidateQuote(); updateRoomsSummary(); persistStaged(); });
    form.elements.checkOut?.addEventListener('change', () => { invalidateQuote(); updateRoomsSummary(); persistStaged(); });
    form.elements.board?.addEventListener('change', () => { invalidateQuote(); updateRoomsSummary(); persistStaged(); });
    form.elements.accountId?.addEventListener('change', () => { invalidateQuote(); updateRoomsSummary(); persistStaged(); });

    form.addEventListener('change', (e) => {
      if (e.target.matches('[data-hx-group-accept-quote]')) {
        quoteAccepted = e.target.checked;
        persistStaged();
      }
    });

    form.addEventListener('click', (e) => {
      if (e.target.closest('[data-action="hx-add-group-traveler"]')) {
        syncTravelersFromDom();
        travelers.push({ id: 'gst_' + crypto.randomUUID().slice(0, 12), name: '', sex: '', nationality: '', residenceCountry: '', birthDate: '', idDocType: '', idDocNumber: '', roomId: '' });
        invalidateQuote();
        renderTravelers();
        persistStaged();
      } else if (e.target.closest('[data-action="hx-remove-group-traveler"]')) {
        syncTravelersFromDom();
        const item = e.target.closest('[data-hx-group-traveler]');
        if (item) {
          const id = item.dataset.travelerId;
          travelers = travelers.filter(t => t.id !== id);
          if (!travelers.length) travelers.push({ id: 'gst_' + crypto.randomUUID().slice(0, 12), name: '', sex: '', nationality: '', residenceCountry: '', birthDate: '', idDocType: '', idDocNumber: '', roomId: '' });
          invalidateQuote();
          renderTravelers();
          persistStaged();
        }
      } else if (e.target.closest('[data-action="hx-preview-paste"]')) {
        const pasteText = String(form.querySelector('[data-hx-group-paste]')?.value || '').trim();
        const previewArea = form.querySelector('[data-hx-import-preview-area]');
        if (!pasteText) {
          previewArea.innerHTML = `<span style="color:var(--warn-ink);font-size:11.5px;">${tx('Veuillez coller du texte avant de prévisualiser.')}</span>`;
          return;
        }
        const lines = pasteText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        const parsed = lines.map(line => {
          const parts = cuParseDelimitedLine(line);
          const name = parts[0] || '';
          const natRaw = parts[1] || '';
          const doc = parts[2] || '';
          const matchedNat = cuMatchNationality(natRaw);
          return {
            name,
            natRaw,
            natCode: matchedNat || '',
            natLabel: matchedNat ? cuNationalityLabel(matchedNat) : '',
            doc,
          };
        }).filter(p => p.name);

        if (!parsed.length) {
          previewArea.innerHTML = `<span style="color:var(--warn-ink);font-size:11.5px;">${tx('Aucun voyageur valide détecté dans le texte.')}</span>`;
          return;
        }

        form.__parsedImport = parsed;
        previewArea.innerHTML = `
          <div class="hx-import-preview-box">
            <table class="hx-import-preview-table">
              <thead><tr><th>#</th><th>${tx('Nom')}</th><th>${tx('Nationalité détectée')}</th><th>${tx('Document')}</th></tr></thead>
              <tbody>
                ${parsed.map((p, i) => `<tr><td>${i+1}</td><td><b>${esc(p.name)}</b></td><td>${esc(p.natLabel || p.natRaw || tx('Indéterminée'))}</td><td dir="ltr">${esc(p.doc || '-')}</td></tr>`).join('')}
              </tbody>
            </table>
          </div>
          <div style="display:flex;gap:8px;margin-top:6px;">
            <button data-activation=write type="button" class="hx-btn atlas" data-action="hx-confirm-import" style="font-size:11.5px;padding:4px 10px;">${tx('Confirmer l’import ({n} voyageurs)', { n: parsed.length, c: txn(parsed.length, 'voyageur') })}</button>
            <button data-activation=write type="button" class="hx-btn ghost" data-action="hx-cancel-import" style="font-size:11.5px;padding:4px 10px;">${tx('Annuler')}</button>
          </div>
        `;
      } else if (e.target.closest('[data-action="hx-confirm-import"]')) {
        const parsed = form.__parsedImport || [];
        if (parsed.length) {
          syncTravelersFromDom();
          const selected = allRooms.filter(r => selectedRoomIds.has(r.id));
          let rIndex = 0;
          parsed.forEach(p => {
            const assignedRoom = selected.length ? selected[rIndex % selected.length].id : '';
            travelers.push({
              id: 'gst_' + crypto.randomUUID().slice(0, 12),
              name: p.name,
              sex: '',
              nationality: p.natCode || p.natRaw || '',
              residenceCountry: '',
              birthDate: '',
              idDocType: '',
              idDocNumber: p.doc,
              roomId: assignedRoom,
            });
            if (selected.length) rIndex++;
          });
          if (travelers.length > 1 && !travelers[0].name) {
            travelers.shift();
          }
          invalidateQuote();
          renderTravelers();
          updateRoomsSummary();
          persistStaged();
          form.querySelector('[data-hx-group-paste]').value = '';
          form.querySelector('[data-hx-import-preview-area]').innerHTML = '';
          delete form.__parsedImport;
          toast(tx('{n} voyageur(s) importé(s)', { n: parsed.length, c: txn(parsed.length, 'voyageur') }), { type: 'success' });
        }
      } else if (e.target.closest('[data-action="hx-cancel-import"]')) {
        form.querySelector('[data-hx-import-preview-area]').innerHTML = '';
        delete form.__parsedImport;
      } else if (e.target.closest('[data-action="hx-simulate-group-quote"]')) {
        simulateQuotes();
      } else if (e.target.closest('[data-action="hx-discard-staged"]')) {
        localStorage.removeItem(stagedKey);
        try { localStorage.removeItem(intentKeyFor(groupDossierId)); } catch (_) {}
        /* ── ABANDONNER DOIT VOULOIR DIRE ABANDONNER (ticket #0007) ────────
         * On n'effaçait que la trace du dossier COURANT. Une tentative
         * inachevée portant un AUTRE identifiant survivait donc au geste, et
         * la fois suivante « nouvelle réservation » la réadoptait : le même
         * essai revenait, avec ses champs verrouillés, sans qu'aucun bouton
         * ne puisse plus s'en défaire. C'est très exactement le blocage
         * décrit — « quand on ferme et qu'on reclique, on retombe sur le
         * même dossier qui n'a pas pu se charger ».
         *
         * Ces enregistrements sont des aides à la reprise LOCALES : les
         * chambres déjà enregistrées côté serveur le restent, et un dossier
         * réellement en cours se relit depuis la liste des séjours. Les
         * effacer sur un geste explicite ne perd donc aucune réservation. */
        try {
          const orphans = [];
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (!key || !key.startsWith('kiwi_hx_intent_')) continue;
            let raw = null;
            try { raw = JSON.parse(localStorage.getItem(key) || 'null'); } catch (_) { raw = null; }
            if (raw && raw.merchant === initialMerchant && raw.status !== 'complete') orphans.push(key);
          }
          orphans.forEach((key) => { try { localStorage.removeItem(key); } catch (_) {} });
        } catch (_) {}
        savedRooms = {};
        failedRooms = {};
        quoteBreakdown = {};
        quoteAccepted = false;
        quoteRevision = null;
        quoteRevs = {};
        committedTerms = null;
        activeQuoteSignature = '';
        groupDossierId = 'grp_' + Date.now() + '_' + crypto.randomUUID().slice(0, 8);
        // A fresh dossier means blank inputs, no rooms, one empty traveler:
        // leaving adopted values behind would re-freeze the next persist.
        selectedRoomIds.clear();
        travelers = [{ id: 'gst_' + crypto.randomUUID().slice(0, 12), name: '', sex: '', nationality: '', residenceCountry: '', birthDate: '', idDocType: '', idDocNumber: '', roomId: '' }];
        for (const [name, value] of [['groupName', ''], ['checkIn', today], ['checkOut', tomorrow], ['contactName', ''], ['contactPhone', ''], ['contactEmail', ''], ['accountId', ''], ['channel', 'direct'], ['board', 'room_only']]) {
          if (form.elements[name]) form.elements[name].value = value;
        }
        const recoverySlot = form.querySelector('[data-hx-group-recovery-slot]');
        if (recoverySlot) recoverySlot.innerHTML = '';
        lockCommittedFields();
        renderRooms();
        renderTravelers();
        updateRoomsSummary();
        toast(tx('Brouillon local abandonné. Nouveau dossier prêt.'), { type: 'info' });
      } else if (e.target.closest('[data-action="hx-group-cancel"]')) {
        m.close();
        scope.openModal = null;
      }
    });

    travelersContainer.addEventListener('change', (e) => {
      if (e.target.matches('[data-hx-t-room]')) {
        invalidateQuote();
      }
      validateCapacity();
      persistStaged();
    });
    travelersContainer.addEventListener('input', () => { validateCapacity(); persistStaged(); });

    lockCommittedFields();
    renderRooms();
    renderTravelers();
    updateRoomsSummary();
    if (intentNotice === 'adopted') {
      toast(tx('Dossier en cours de finalisation restauré ({id}). Les chambres seront revérifiées auprès du serveur avant tout nouvel enregistrement.', { id: groupDossierId }), { type: 'info' });
    } else if (intentNotice === 'other-pending' && pendingIntent) {
      toast(tx('Un autre dossier ({id}) attend encore sa finalisation. Terminez ou abandonnez ce brouillon pour le reprendre.', { id: pendingIntent.dossierId }), { type: 'info' });
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (form.__hxSubmitting) return;
      errorEl.textContent = '';
      const submitBtn = form.querySelector('[data-hx-group-submit]');

      if (initialScope !== cuStayScope() || initialMerchant !== cuMerchantSlug()) {
        errorEl.textContent = tx('L’hôtel actif a changé. Ce dossier ne peut pas être finalisé dans un autre établissement.');
        return;
      }

      syncTravelersFromDom();

      // Defect 1: read the frozen submission model, never the (possibly
      // disabled, hence FormData-invisible) controls. On a first attempt the
      // model mirrors the live form; after any room is saved it is the exact
      // terms that room was booked with.
      const terms = getTerms();
      const groupName = terms.groupName;
      const checkIn = terms.checkIn;
      const checkOut = terms.checkOut;
      const contactName = terms.contactName;
      const contactPhone = terms.contactPhone;
      const contactEmail = terms.contactEmail;
      const accountId = terms.accountId || null;
      const channel = terms.channel;
      const board = terms.board;

      if (!groupName) { errorEl.textContent = tx('Indiquez le nom du groupe.'); return; }
      if (!contactName) { errorEl.textContent = tx('Indiquez le contact principal.'); return; }
      if (!checkIn || !checkOut || checkOut <= checkIn) { errorEl.textContent = tx('Vérifiez les dates d’arrivée et de départ.'); return; }
      if (selectedRoomIds.size === 0) { errorEl.textContent = tx('Sélectionnez au moins une chambre pour le groupe.'); return; }

      // Check unassigned travelers
      const unassigned = travelers.filter(t => !t.roomId);
      if (unassigned.length > 0) {
        errorEl.textContent = tx('Tous les voyageurs doivent être attribués à une chambre. Veuillez attribuer ou retirer les {n} voyageur(s) sans chambre.', { n: unassigned.length, c: txn(unassigned.length, 'voyageur') });
        return;
      }

      // Check room capacity
      const selected = allRooms.filter(r => selectedRoomIds.has(r.id));
      for (const room of selected) {
        const assignedCount = travelers.filter(t => t.roomId === room.id).length;
        const maxCap = roomTypeOf(room.n).maxGuests || 4;
        if (assignedCount === 0) {
          errorEl.textContent = tx('La chambre {n} n’a aucun voyageur attribué.', { n: room.n });
          return;
        }
        if (assignedCount > maxCap) {
          errorEl.textContent = tx('La chambre {n} dépasse sa capacité maximale ({a} / {max} pers.).', { n: room.n, a: assignedCount, max: maxCap });
          return;
        }
      }

      // Check quotes for meal plans and accounts (defect 4). The accepted
      // quote must still describe THIS dossier: same signature as at accept
      // time, one single revision across every quoted room, a complete entry
      // for each room that is about to be written, and a directory revision
      // that has not moved since. Anything else restarts the simulation —
      // the operator reviews one total and the server books exactly it
      // (the save endpoint re-checks the revision and 409s otherwise).
      // Two genuinely separate pricing paths (defect: ordinary groups need
      // no account). Contract groups simulate and accept; direct groups are
      // priced live from the hotel configuration, no simulation to accept.
      const contractMode = !!accountId;
      let groupDirect = null;
      if (contractMode && !quoteAccepted) {
        errorEl.textContent = tx('Veuillez simuler et accepter le devis commercial pour cette formule de séjour avant de confirmer le groupe.');
        return;
      }
      if (!contractMode) {
        groupDirect = groupDirectQuotes();
        const missingRoom = allRooms
          .filter(r => selectedRoomIds.has(r.id) && !savedRooms[r.id])
          .find(r => !groupDirect.perRoom[r.id] || !groupDirect.perRoom[r.id].rows);
        if (missingRoom) {
          const miss = (groupDirect.perRoom[missingRoom.id] && groupDirect.perRoom[missingRoom.id].missing) || ['meal'];
          const what = miss.includes('room')
            ? tx('sans tarif logement pour « {type} »', { type: roomTypeOf(missingRoom.n).name })
            : (miss.includes('dates') ? tx('dates du séjour invalides') : tx('sans tarif « {board} » pour « {type} »', { board: cuBoards[board] || board, type: roomTypeOf(missingRoom.n).name }));
          errorEl.textContent = tx('Chambre {n} {what}. Renseignez le tarif dans Types de chambres, ou réservez cette chambre en prix convenu depuis sa fiche individuelle.', { n: missingRoom.n, what });
          return;
        }
      }
      if (contractMode) {
        if (!activeQuoteSignature || activeQuoteSignature !== cuGroupQuoteSignature() || quoteRevision == null) {
          errorEl.textContent = tx('Le devis accepté ne correspond plus au dossier (dates, chambres, voyageurs ou formule ont changé). Relancez la simulation.');
          return;
        }
        const pendingRooms = allRooms.filter(r => selectedRoomIds.has(r.id) && !savedRooms[r.id]);
        const incomplete = pendingRooms.find(r => {
          const q = quoteBreakdown[r.id];
          return !q || !Array.isArray(q.rows) || !Number.isSafeInteger(q.totalCents) || quoteRevs[r.id] !== quoteRevision;
        });
        if (incomplete) {
          errorEl.textContent = tx('Devis incomplet ou périmé pour la chambre {n}. Relancez la simulation pour l’ensemble du groupe.', { n: incomplete.n });
          return;
        }
        try {
          const revRes = await fetch('/api/hotel/commercial?merchant=' + encodeURIComponent(initialMerchant), { cache: 'no-store' });
          const revBody = await revRes.json().catch(() => ({}));
          if (revRes.ok && Number.isSafeInteger(revBody.rev) && revBody.rev !== quoteRevision) {
            invalidateQuote();
            errorEl.textContent = tx('Le répertoire commercial a changé (révision {a} → {b}) depuis le devis accepté. Relancez la simulation avant de confirmer.', { a: quoteRevision, b: revBody.rev });
            return;
          }
        } catch (_) { /* unreachable directory: the save endpoint re-checks per room */ }
      }

      // Build the exact per-room payloads first (defect 2): stable clientRef
      // identities, frozen terms, traveler snapshot. Nothing is posted before
      // these payloads — with the frozen terms — are durably recorded.
      const roomPlans = allRooms
        .filter(r => selectedRoomIds.has(r.id))
        .map(room => {
          const roomKey = String(room.id).replace(/[^A-Za-z0-9_-]/g, '_');
          const clientRef = ('staff-grp-' + groupDossierId + '-' + roomKey).slice(0, 80);
          const roomGuests = travelers.filter(t => t.roomId === room.id).map(g => ({
            name: g.name,
            sex: g.sex || '',
            nationality: g.nationality || '',
            birthDate: g.birthDate || '',
            residenceCountry: g.residenceCountry || '',
            idDocType: g.idDocType || '',
            idDocNumber: g.idDocNumber || '',
          }));
          const roomDirect = (!accountId && groupDirect && groupDirect.perRoom[room.id] && groupDirect.perRoom[room.id].rows)
            ? { board, occupancy: Math.max(1, roomGuests.length), rows: groupDirect.perRoom[room.id].rows, totalCents: groupDirect.perRoom[room.id].totalCents }
            : null;
          return {
            room, clientRef,
            payload: {
              action: 'save',
              merchant: initialMerchant,
              dossierId: groupDossierId,
              groupName,
              clientRef,
              roomTypeId: room.typeId,
              resourceId: room.id,
              checkIn,
              checkOut,
              partySize: Math.max(1, roomGuests.length),
              status: 'confirmed',
              channel,
              customer: {
                name: roomGuests[0]?.name || contactName,
                phone: contactPhone,
                email: contactEmail,
              },
              guests: roomGuests,
              commercial: {
                accountId,
                booker: contactName,
                board,
                quoted: !!quoteAccepted,
              },
              quoteRevision: quoteRevision != null ? quoteRevision : undefined,
              acceptQuote: !!quoteAccepted,
              ...(roomDirect ? { directPricing: roomDirect } : {}),
            },
          };
        });

      // Never overwrite an unresolved intent with incompatible edits: a retry
      // reuses the frozen terms by construction, so any divergence here means
      // the draft was tampered with outside the locked UI — stop loudly
      // instead of splitting one dossier across two commercial identities.
      const priorIntent = readIntent(groupDossierId);
      if (priorIntent && priorIntent.status !== 'complete' && Object.keys(savedRooms).length > 0 && priorIntent.terms && termsDiffer(priorIntent.terms, terms)) {
        errorEl.textContent = tx('Ce dossier a changé depuis son enregistrement partiel et ne peut pas être repris tel quel. Abandonnez le brouillon local pour recommencer un dossier propre.');
        return;
      }

      // Persist the authoritative intent before the first network write.
      // A failure here stops everything: no booking is written without its
      // recovery record. The draft cache (persistStaged) is best-effort —
      // recovery is driven by the intent, never by the cache.
      try {
        writeIntent({
          version: INTENT_VERSION,
          status: 'in-progress',
          merchant: initialMerchant,
          dossierId: groupDossierId,
          terms: { ...terms },
          rooms: roomPlans.map(p => ({ roomId: p.room.id, roomN: p.room.n, clientRef: p.clientRef, payload: p.payload })),
          travelers: JSON.parse(JSON.stringify(travelers)),
          quoteBreakdown: JSON.parse(JSON.stringify(quoteBreakdown)),
          quoteRevs: { ...quoteRevs },
          quoteRevision,
          quoteAccepted,
          activeQuoteSignature,
          createdAt: (priorIntent && priorIntent.createdAt) || Date.now(),
          updatedAt: Date.now(),
        });
      } catch (storageErr) {
        errorEl.textContent = tx('Impossible de sécuriser l’intention de réservation en stockage local ({reason}). Aucune chambre n’a été enregistrée : libérez de l’espace ou autorisez le stockage, puis relancez la confirmation.', { reason: storageErr.message || tx('quota dépassé') });
        return;
      }
      // Read the record back: the loop below iterates the persisted attempt,
      // proving the payloads were durable before the first booking write.
      const attempt = readIntent(groupDossierId);
      if (!attempt || attempt.status === 'complete' || !Array.isArray(attempt.rooms) || attempt.rooms.length !== roomPlans.length) {
        errorEl.textContent = tx('Intention de réservation illisible après écriture. Aucune chambre n’a été enregistrée : réessayez la confirmation.');
        return;
      }
      if (!persistStaged()) {
        toast(tx('Brouillon local non sauvegardé (stockage indisponible). La reprise reste assurée par l’intention durable du dossier.'), { type: 'warn' });
      }

      form.__hxSubmitting = true;
      form.classList.add('is-submitting');
      submitBtn.disabled = true;
      errorEl.textContent = tx('Contrôle des disponibilités et enregistrement des chambres…');

      const formControls = Array.from(form.querySelectorAll('input, select, textarea, button'));
      formControls.forEach(el => {
        if (!el.disabled) {
          el.setAttribute('data-hx-submitting-disabled', '1');
          el.disabled = true;
        }
      });

      // Material comparison between a server booking and the payload we would
      // write (defect 3, hardened). Room, dates, party and dossier are not
      // enough: a guest renamed, a swapped account or meal plan, or a
      // different booker on another device must surface as an
      // incompatibility — never as a silent adopt, and never as a
      // delete-and-recreate.
      //
      // Empty values compare as REAL values (defect 2): the old
      // `if (a && ...)` guard let a cleared phone, e-mail, account, board or
      // group name pass as "unchanged". Every field below is stored by every
      // save path (room, dates, partySize, dossierId defaulted to the stay
      // id, groupName since dossiers exist, channel defaulted, customer
      // always written, commercial normalized to '' when absent), so an
      // empty-vs-filled difference is a genuine change — including a legacy
      // record that never contained the term. Such a record must not certify
      // terms it never held: the run fails naming the field, the server
      // version is preserved, and the explicit amendment flow (or a clean
      // restart after discarding the draft) is the way forward.
      const normField = (s) => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase();
      const guestIdentity = (g) => [g && g.name, g && g.idDocNumber, g && g.nationality, g && g.birthDate, g && g.sex].map(normField).join('|');
      // A reconciliation answer is only authoritative entry by entry
      // (follow-up): nulls, primitives, arrays masquerading as bookings and
      // records without identity (id) or status must never read as "no
      // booking". That misreading used to fall through to POST, whose
      // idempotent replay was then adopted with zero material checks.
      const asBookingRecord = (value) => {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
        if (typeof value.id !== 'string' || !value.id) return null;
        if (typeof value.status !== 'string' || !value.status) return null;
        return value;
      };
      // Shared adoption gate for GET-found and POST-returned bookings
      // (follow-up): cancelled/no-show refuses, then the material
      // comparison. Fresh POSTs pass by construction (the server echoes the
      // payload); idempotent replays pass only when the pre-existing booking
      // still matches what we would write. Returns null when adoptable,
      // otherwise { kind, field } for the caller to phrase.
      const adoptionProblem = (booking, payload, room) => {
        if (['cancelled', 'no_show'].includes(booking.status)) return { kind: 'cancelled' };
        const mismatch = bookingMatchesPayload(booking, payload, room);
        if (mismatch) return { kind: 'mismatch', field: mismatch };
        return null;
      };
      /* The compared fields keep their French names; the message reads them. */
      const cuFieldLabel = (f) => ({ chambre: tx('chambre'), 'arrivée': tx('arrivée'), 'départ': tx('départ'), effectif: tx('effectif'),
        dossier: tx('dossier'), 'nom du groupe': tx('nom du groupe'), canal: tx('canal'), contact: tx('contact'), 'téléphone': tx('téléphone'),
        'e-mail': tx('e-mail'), compte: tx('compte'), formule: tx('formule'), voyageurs: tx('voyageurs') })[f] || f;
      const bookingMatchesPayload = (existing, payload, room) => {
        const pairs = [
          ['chambre', existing.resourceId || existing.hotel?.roomId || '', room.id],
          ['arrivée', existing.hotel?.checkIn || '', payload.checkIn],
          ['départ', existing.hotel?.checkOut || '', payload.checkOut],
          ['effectif', String(existing.partySize ?? ''), String(payload.partySize)],
          ['dossier', existing.hotel?.dossierId || '', payload.dossierId],
          ['nom du groupe', existing.hotel?.groupName || '', payload.groupName || ''],
          ['canal', existing.hotel?.channel || '', payload.channel || ''],
          ['contact', existing.customer?.name || '', (payload.customer && payload.customer.name) || ''],
          ['téléphone', existing.customer?.phone || '', (payload.customer && payload.customer.phone) || ''],
          ['e-mail', existing.customer?.email || '', (payload.customer && payload.customer.email) || ''],
          ['compte', (existing.commercial && existing.commercial.accountId) || '', (payload.commercial && payload.commercial.accountId) || ''],
          ['formule', (existing.commercial && existing.commercial.board) || '', (payload.commercial && payload.commercial.board) || ''],
        ];
        for (const [label, a, b] of pairs) {
          if (normField(a) !== normField(b)) return label;
        }
        // Guest identities, order-insensitive (homonyms stay distinct rows,
        // the server drops fully-empty rows exactly like the payload filter).
        const keptGuests = (payload.guests || []).filter(g => g && (g.name || g.nationality || g.idDocNumber));
        const aGuests = (existing.guests || []).map(guestIdentity).sort().join(';');
        const bGuests = keptGuests.map(guestIdentity).sort().join(';');
        if (aGuests !== bGuests) return 'voyageurs';
        return null;
      };

      try {
        // Iterate the persisted attempt (defect 2): every payload below was
        // durable before the first booking write of this attempt.
        for (const entry of attempt.rooms) {
          const room = allRooms.find(r => r.id === entry.roomId);
          if (!room) {
            const errMsg = tx('La chambre {n} n’existe plus au plan. Retirez-la du dossier pour continuer.', { n: entry.roomN || entry.roomId });
            failedRooms[entry.roomId] = errMsg;
            persistStaged();
            renderRooms();
            throw new Error(errMsg);
          }
          const payload = entry.payload;
          const clientRef = entry.clientRef;
          if (initialScope !== cuStayScope() || initialMerchant !== cuMerchantSlug() || scope.openModal?.el !== m.el || !form.isConnected) {
            throw new Error(tx('L’hôtel actif a changé pendant l’enregistrement.'));
          }

          // Server reconciliation (defect 3): EVERY room is checked against
          // the server by its stable clientRef — including rooms this browser
          // already marks saved. A cancellation or an edit on another device
          // must surface here, never hide behind an old local snapshot. Only
          // when the server itself is unreachable do we provisionally trust
          // the local snapshot (the following write would fail first anyway,
          // and the next online pass re-verifies).
          // Reconciliation lookup, schema-validated (defect 1): only a
          // well-formed envelope authorizes anything below. A failed HTTP
          // status, a network fault, or a malformed body (stays missing,
          // not a list, first entry not an object) all mean the same thing:
          // this room is UNVERIFIED, and nothing may treat it as confirmed.
          let existingBooking = null;
          let checkOk = false;
          try {
            const checkRes = await fetch('/api/hotel/stays?merchant=' + encodeURIComponent(initialMerchant) + '&clientRef=' + encodeURIComponent(clientRef) + '&includeCancelled=1', { cache: 'no-store' });
            if (checkRes.ok) {
              const checkData = await checkRes.json().catch(() => null);
              const stays = (checkData && Array.isArray(checkData.stays)) ? checkData.stays : null;
              // Valid-empty ([]) authorizes the POST below; every non-empty
              // answer must be entry-validated first. A single malformed
              // entry poisons the whole lookup: treating it as "no booking"
              // would route into POST, whose replay used to bypass every
              // check. The returned identity must also answer to the
              // reference we asked for.
              if (stays !== null) {
                const malformed = stays.some((s) => {
                  const rec = asBookingRecord(s);
                  return !rec || (typeof rec.publicRef === 'string' && rec.publicRef !== '' && rec.publicRef !== clientRef);
                });
                if (!malformed) {
                  checkOk = true;
                  existingBooking = stays.length ? stays[0] : null;
                }
              }
            }
          } catch (_) { checkOk = false; }

          if (initialScope !== cuStayScope() || initialMerchant !== cuMerchantSlug() || scope.openModal?.el !== m.el || !form.isConnected) {
            throw new Error(tx('L’hôtel actif a changé pendant la vérification.'));
          }

          // A claimed-saved room the server could not confirm PAUSES the
          // operation (defect 1): adopting it would bless a stale snapshot
          // (e.g. a cancellation on another device), and skipping past it
          // would let the run finish "successfully" around a hole — room 102
          // saved, modal closed, room 101 quietly cancelled. The intent and
          // draft records stay exactly as they are, the room keeps its
          // failure badge, and the retry (server reachable again) re-runs
          // this same lookup. Nothing is counted as confirmed here.
          if (!existingBooking && savedRooms[room.id] && !checkOk) {
            const errMsg = tx('La chambre {n} n’a pas pu être revérifiée auprès du serveur (réconciliation indisponible). La reprise est en pause : réessayez avec le serveur joignable. Rien n’a été validé à tort.', { n: room.n });
            failedRooms[room.id] = errMsg;
            persistStaged();
            renderRooms();
            throw new Error(errMsg);
          }

          if (existingBooking) {
            const problem = adoptionProblem(existingBooking, payload, room);
            if (problem) {
              const errMsg = problem.kind === 'cancelled'
                ? tx('La réservation existante pour la chambre {n} est annulée ou non présentée ({status}).', { n: room.n, status: cuDraftStatus(existingBooking.status) })
                : tx('Incompatibilité ({field}) détectée pour la réservation existante ({id}) de la chambre {n}. Le serveur a une version différente : aucune écriture, utilisez un avenant explicite.', { field: cuFieldLabel(problem.field), id: existingBooking.id, n: room.n });
              failedRooms[room.id] = errMsg;
              persistStaged();
              renderRooms();
              throw new Error(errMsg);
            }

            savedRooms[room.id] = existingBooking;
            delete failedRooms[room.id];
            initialCache.set(existingBooking.id, existingBooking);
            if (!committedTerms) { freezeTerms(terms); lockCommittedFields(); }
            persistStaged();
            renderRooms();
            renderTravelers();
            updateTravelerRoomOptions();
            continue;
          }

          // A lost response is not a failed booking (defect 2): the server
          // may have saved it. Name the room, keep the badge, and let the
          // clientRef reconciliation adopt it on retry instead of guessing.
          let res;
          try {
            res = await fetch('/api/hotel/stays', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
            });
          } catch (netErr) {
            const errMsg = tx('La réponse du serveur pour la chambre {n} a été perdue ({reason}). La réservation sera vérifiée à la reprise.', { n: room.n, reason: (netErr && netErr.message) || tx('réseau') });
            failedRooms[room.id] = errMsg;
            persistStaged();
            renderRooms();
            throw new Error(errMsg);
          }
          const body = await res.json().catch(() => ({}));

          if (initialScope !== cuStayScope() || initialMerchant !== cuMerchantSlug() || scope.openModal?.el !== m.el || !form.isConnected) {
            throw new Error(tx('L’hôtel actif a changé pendant l’enregistrement.'));
          }

          if (!res.ok || !body.booking) {
            const errMsg = cuCommercialError(body.error) || body.error || tx('chambre indisponible');
            failedRooms[room.id] = errMsg;
            persistStaged();
            renderRooms();
            throw new Error(tx('Erreur sur la chambre {n} : {reason}', { n: room.n, reason: errMsg }));
          }

          // The POST answer goes through the same gate (follow-up): a
          // malformed record is a failed write, never an adoption, and an
          // idempotent replay is only adopted when it still matches what we
          // would write — a replay carrying another device's edits must fail
          // here, not masquerade as our fresh booking.
          const returned = asBookingRecord(body.booking);
          if (!returned || (typeof returned.publicRef === 'string' && returned.publicRef !== '' && returned.publicRef !== clientRef)) {
            const errMsg = tx('La réponse du serveur pour la chambre {n} est inexploitable. La reprise est en pause : réessayez avec le serveur joignable.', { n: room.n });
            failedRooms[room.id] = errMsg;
            persistStaged();
            renderRooms();
            throw new Error(errMsg);
          }
          const postProblem = adoptionProblem(returned, payload, room);
          if (postProblem) {
            const errMsg = postProblem.kind === 'cancelled'
              ? tx('La réservation retournée pour la chambre {n} est annulée ou non présentée.', { n: room.n })
              : tx('Incompatibilité ({field}) détectée pour la réservation retournée ({id}) de la chambre {n}. Le serveur a une version différente : aucune écriture, utilisez un avenant explicite.', { field: cuFieldLabel(postProblem.field), id: returned.id, n: room.n });
            failedRooms[room.id] = errMsg;
            persistStaged();
            renderRooms();
            throw new Error(errMsg);
          }

          savedRooms[room.id] = returned;
          delete failedRooms[room.id];
          initialCache.set(returned.id, returned);
          cuStaysChanged();
          // First proven room freezes the dossier identity (defects 1+3):
          // the locked controls stop feeding submissions from here on.
          if (!committedTerms) { freezeTerms(terms); lockCommittedFields(); }
          persistStaged();
          renderRooms();
          renderTravelers();
          updateTravelerRoomOptions();
        }

        // Scope check before completing
        if (initialScope !== cuStayScope() || initialMerchant !== cuMerchantSlug() || scope.openModal?.el !== m.el || !form.isConnected) {
          return;
        }

        // All rooms saved successfully: the intent is fulfilled, both the
        // authoritative record and the draft cache go away together.
        try { localStorage.removeItem(intentKeyFor(groupDossierId)); } catch (_) {}
        try { localStorage.removeItem(stagedKey); } catch (_) {}

        const doc = window.KiwiReservations?.get?.();
        if (doc && Array.isArray(doc.bookings)) {
          Object.values(savedRooms).forEach(b => {
            const idx = doc.bookings.findIndex(x => x.id === b.id);
            if (idx < 0) doc.bookings.push(b);
            else doc.bookings[idx] = b;
          });
          window.KiwiReservations.set(doc);
        }

        m.close();
        scope.openModal = null;
        toast(tx('Réservation de groupe enregistrée'), {
          type: 'success',
          desc: groupName + ' · ' + tx('{n} chambre(s) confirmée(s).', { n: Object.keys(savedRooms).length, c: txn(Object.keys(savedRooms).length, 'chambre') }),
        });
        rerender();
      } catch (err) {
        if (initialScope !== cuStayScope() || initialMerchant !== cuMerchantSlug() || scope.openModal?.el !== m.el || !form.isConnected) {
          return;
        }
        errorEl.textContent = (err.message || tx('Échec de la réservation de groupe.')) + (Object.keys(savedRooms).length ? ' ' + tx('Les chambres déjà enregistrées ({n}) restent conservées sous le dossier {id}.', { n: Object.keys(savedRooms).length, id: groupDossierId }) : '');
        if (Object.keys(savedRooms).length > 0) {
          submitBtn.textContent = tx('Reprendre la confirmation ({n} enregistrée(s))', { n: Object.keys(savedRooms).length });
        }
      } finally {
        form.__hxSubmitting = false;
        form.classList.remove('is-submitting');
        formControls.forEach(el => {
          if (el.hasAttribute('data-hx-submitting-disabled')) {
            el.removeAttribute('data-hx-submitting-disabled');
            el.disabled = false;
          }
        });
        lockCommittedFields();
        renderRooms();
        renderTravelers();
        submitBtn.disabled = false;
      }
    });
  }

return Object.freeze({ cuGroupReservationModal });
};
