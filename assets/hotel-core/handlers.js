
  function register() {
    if (!window.Kiwi || !window.Kiwi.handlers || !window.Kiwi.appPage) { setTimeout(register, 80); return; }
    const { handlers, toast } = window.Kiwi;

    /* Read the tenant-scoped room document as soon as the hotel module is
     * operational. Venue switches reuse the same conflict-safe handle under
     * the new slug; the local copy still paints immediately while it loads. */
    bindCuCloud();
    try { window.KiwiVenue.subscribe(() => { bindCuCloud(); }); } catch (_) {}
    if (!cuReservationEventsBound) {
      cuReservationEventsBound = true;
      /* La première lecture des séjours remplace le « · » des bandeaux : une
       * seule fois (cuStripUnknown), jamais sous le curseur d'un champ. */
      window.addEventListener('kiwi-hotel-stays-loaded', () => {
        if (!cuStripUnknown || !isCustomHotel()) return;
        if (['reception', 'sejours', 'tarifs', 'hotelintel', 'chambres', 'menage', 'folios'].includes(openDrawer?.page)) rerender();
      });
      window.addEventListener('kiwi-reservations-changed', () => {
        if (isCustomHotel() && ['sejours', 'reception'].includes(openDrawer?.page)) rerender();
      });
      /* A language switch re-reads the open hotel page: title, context line,
       * breadcrumb, then the body. appPage() is not called again, so the
       * page keeps its scroll and the sidebar keeps its focus. The page host
       * outlives a return to the dashboard (hidden, still connected), so
       * « open » is also « <body> still shows a genpage »: otherwise the
       * hotel title landed in the dashboard's own « Home / Dashboard ». */
      window.addEventListener('kiwi:langchange', () => {
        const d = openDrawer;
        if (!d || !d.el || !d.el.isConnected || !document.body.classList.contains('page-genpage')) return;
        const title = String(d.titleFn ? d.titleFn() : '');
        const h1 = d.el.querySelector('.genpage-head h1');
        if (h1) h1.textContent = title;
        window.Kiwi?.breadcrumb?.(title);
        const p = d.el.querySelector('.genpage-head p');
        const sub = d.subFn ? d.subFn() : '';
        if (p && sub) {
          p.textContent = '';
          String(sub).split(' · ').forEach((seg, i) => {
            if (i) { const dot = document.createElement('i'); dot.className = 'dot'; dot.setAttribute('aria-hidden', 'true'); p.appendChild(dot); }
            const s = document.createElement('span'); s.className = 'seg'; s.textContent = seg; p.appendChild(s);
          });
        }
        rerender();
      });
    }

    /* The 0000 wizard now offers « Hôtel / Riad » — fork of
     * interactive.js's onboard handler (see obOnboard above). Re-asserted
     * after load like pages-pro's starter wraps, in case of re-registration. */
    handlers['onboard'] = obOnboard;

    /* — navigation (sidebar + cards) — custom (0000) hotels get their own
     * starter pages on the live rack/folio engine; the riad keeps its demo.
     * The Riad Yasmina demo is a showroom: a real session never paints it,
     * even before its venue type has caught up (KiwiEnv.isReal). Its seed
     * data stays French; every surface a real hotel sees reads tx(). */
    const cu = () => isCustomHotel() || !!window.KiwiEnv?.isReal?.();
    handlers['nav-reception'] = () => cu()
      ? (page('reception', () => tx('Réception'), () => vName() + ' · ' + tx('arrivées, départs et dossiers en maison'), cuReceptionBody), cuRefreshReception())
      : page('reception', () => tx('Réception'), 'Riad Yasmina · Médina, Marrakech · arrivées, départs, walk-ins, en un geste', receptionBody);
    handlers['nav-chambres'] = () => cu()
      ? page('chambres', () => tx('Plan des chambres'), () => roomCountLabel() + ' · ' + tx('toucher une chambre libre la vend en walk-in'), cuRackBody)
      : page('chambres', () => tx('Plan des chambres'), '24 chambres · 3 niveaux · toucher une chambre ouvre le client et son folio', rackBody);
    handlers['nav-sejours'] = () => cu()
      ? page('sejours', () => tx('Réservations & séjours'), () => vName() + ' · ' + tx('le tape chart se remplit avec vos réservations'), cuSejoursBody)
      : page('sejours', () => tx('Réservations & séjours'), 'Tape chart · chambres × dates · sources de réservation et ligne d\'occupation', tapeBody);
    handlers['nav-menage'] = () => cu()
      ? page('menage', () => tx('Ménage'), () => tx('Remise à blanc · chaque départ encaissé pousse sa chambre ici'), cuMenageBody)
      : page('menage', () => tx('Ménage'), 'File de remise à blanc · assignation · inspection gouvernante', menageBody);
    handlers['nav-tarifs'] = () => cu()
      ? page('tarifs', () => tx('Tarifs & occupation'), () => tx('Tarifs par type · occupation, ADR et RevPAR calculés sur vos séjours'), cuTarifsBody)
      : page('tarifs', () => tx('Tarifs & occupation'), 'ADR · RevPAR · calendrier tarifaire propriétaire + suggestions IA', tarifsBody);
    /* Backward-compatible alias for old bookmarks only. The hotel-specific
     * guest mock was removed from the sidebar; Hospitality+ is the real shared
     * client directory used by dashboard and reception caisse. */
    handlers['nav-hotes'] = () => cu() ? handlers['hx-commercial']() : handlers['clients-directory']?.();
    handlers['hx-commercial'] = () => {
      if (!cu()) return;
      const p = page('commercial', () => tx('Clients, agences & sociétés'), () => tx('Comptes de facturation · contrats · Cardex voyageurs'), cuCommercialBody);
      p.el.addEventListener('submit', e => {
        if (!e.target.matches('[data-hx-commercial-filter]')) return;
        e.preventDefault(); const fd = new FormData(e.target), st = cuCommercialState();
        st.kind = fd.get('kind'); st.search = fd.get('search'); rerender();
      });
      cuLoadCommercial();
    };
    handlers['hx-commercial-refresh'] = () => cuLoadCommercial();
    handlers['hx-production'] = () => {
      if (!cu()) return;
      const p = page('production', () => tx('Production mensuelle'), () => tx('Comptes & canaux · chambres-nuits réservées'), cuProductionBody);
      p.el.addEventListener('submit', e => {
        if (!e.target.matches('[data-hx-production-filter]')) return;
        e.preventDefault(); cuProductionState().month = new FormData(e.target).get('month'); cuLoadProduction();
      });
      cuLoadProduction();
    };
    handlers['hx-account-new'] = () => cuCommercialEditor('account');
    handlers['hx-account-edit'] = (el, id) => cuCommercialEditor('account', id);
    handlers['hx-account-stays'] = (el, id) => cuAccountStays(id);
    handlers['hx-contract-new'] = () => cuCommercialEditor('contract');
    handlers['hx-contract-edit'] = (el, id) => cuCommercialEditor('contract', id);
    handlers['nav-folios'] = () => cu()
      ? page('folios', () => tx('Notes clients · folios'), () => tx('Une note par séjour : nuits, formule repas et consommations de la chambre'), cuFoliosBody)
      : page('folios', () => tx('Notes clients · folios'), 'Chambres + restaurant + hammam + taxe de séjour, une seule note par séjour', foliosBody);
    handlers['nav-canaux'] = () => cu()
      ? (page('canaux', () => tx('Canaux & OTA'), () => tx('Calendriers importés et limites de synchronisation'), cuCanauxBody), setTimeout(()=>cuLoadChannels(false),0))
      : page('canaux', () => tx('Canaux & OTA'), 'Booking.com, Expedia, Airbnb, direct · commissions visibles, enfin', canauxBody);
    handlers['nav-hotelintel'] = () => cu()
      ? (page('hotelintel', () => tx('Intelligence hôtel'), () => tx('Prévisions, Économat et contrôle opérationnel'), cuIntelBody), setTimeout(() => cuLoadEconomat(false), 0))
      : page('hotelintel', () => tx('Intelligence hôtel'), 'Prévision d\'occupation · tarification · no-shows · où part l\'argent', intelBody);
    /* Points de vente: the clear entry for outlet configuration. Same shared
     * draft and registry as the Économat section — naming and till mapping
     * here is naming and till mapping there. nav-economat stays owned by
     * hotel-economat.js (stock/receiving workspace); this page links there
     * instead of duplicating it. */
    handlers['nav-points-vente'] = () => cu()
      ? (page('points-vente', () => tx('Points de vente'), () => tx('Restaurants, bars et caisses · un seul registre partagé'), cuPdvBody), setTimeout(() => cuLoadEconomat(false), 0))
      : null;
    /* Per-outlet menu: what this outlet's tills actually sell, read-only.
     * Prices come from the merchant catalogue — the same document every
     * till sells from — so there is nothing outlet-specific to drift. */
    handlers['hx-outlet-menu'] = async (el, arg) => {
      if (!isCustomHotel()) return;
      const unit = (cuEconomatState.draft?.units || cuEconomatState.registry.units || []).find((u) => u && u.id === String(arg));
      const name = unit?.name || tx('Point de vente');
      const m = K().modal({ tag: tx('POINT DE VENTE'), title: tx('Menu · {name}', { name }), desc: tx('Articles et prix de vente pratiqués par les caisses de ce point de vente.'), width: 620,
        body: `<div data-hx-outlet-menu role="status">${tx('Chargement du catalogue…')}</div>` });
      m.el.querySelector('.kiwi-modal')?.classList.add('hx-hotel-modal');
      m.el.__hxClose = m.close;
      const host = m.el.querySelector('[data-hx-outlet-menu]');
      // One catalogue for the whole hotel: editing a price here changes what
      // every till sells. Linked, never duplicated.
      const foot = `<p class="hx-outlet-shared">${tx('Prix partagés par tout l’hôtel : le catalogue est commun à tous les points de vente. Modifier un prix change ce que toutes les caisses vendent.')}</p><button data-activation=write type="button" class="hx-btn ghost" data-action="hx-outlet-edit-menu">${tx('Modifier dans le catalogue')}</button>`;
      try {
        const res = await fetch('/api/catalog?merchant=' + encodeURIComponent(cuMerchantSlug()), { credentials: 'same-origin' });
        const body = await res.json().catch(() => ({}));
        const products = res.ok && body && body.data && Array.isArray(body.data.products)
          ? body.data.products.filter((p) => p && p.id && p.name && !p.archived) : null;
        if (!res.ok || !products) { if (host) host.innerHTML = `<p class="hx-econ-empty">${tx('Catalogue indisponible pour le moment.')}</p>` + foot; return; }
        if (host) host.innerHTML = products.length
          ? `<div class="hx-outlet-menu">${products.slice(0, 200).map((p) => `<div><span>${esc(p.name)}</span><b>${MAD(Number(p.priceMAD) || 0)}</b></div>`).join('')}</div><small>${tx('{c} au catalogue de l’établissement.', { c: txn(products.length, 'article') })}</small>` + foot
          : `<p class="hx-econ-empty">${tx('Aucun article au catalogue pour le moment.')}</p>` + foot;
      } catch (_) { if (host) host.innerHTML = `<p class="hx-econ-empty">${tx('Catalogue indisponible pour le moment.')}</p>` + foot; }
    };
    /* From an outlet's menu into the existing authorized catalogue editor.
     * The modal closes first so the editor opens onto a clean page. */
    handlers['hx-outlet-edit-menu'] = (el) => {
      const back = el.closest('.kiwi-backdrop');
      const close = back && back.__hxClose;
      if (typeof close === 'function') { try { close(); } catch (_) {} }
      else if (back) back.remove();
      const nav = window.Kiwi && window.Kiwi.handlers && window.Kiwi.handlers['nav-inventory'];
      if (typeof nav === 'function') nav();
      else if (typeof toast === 'function') toast(tx('Catalogue indisponible'), { type: 'warn', desc: tx('Ouvrez l’inventaire depuis le tableau de bord.') });
    };

    handlers['hx-econ-refresh'] = () => { cuEconomatState.loaded = false; cuLoadEconomat(true); };
    handlers['hx-econ-add-unit'] = (el, arg) => { if (!cuEconomatState.draft) cuEconomatState.draft = cuEconomatDraft(cuEconomatState.registry); cuCaptureEconomatDraft(); cuEconomatState.draft.units.push(cuNewUnit(arg === 'department' ? 'department' : 'outlet')); rerender(); };
    handlers['hx-econ-add-terminal'] = () => { if (!cuEconomatState.draft) cuEconomatState.draft = cuEconomatDraft(cuEconomatState.registry); cuCaptureEconomatDraft(); cuEconomatState.draft.terminals.push({ terminalId: '', unitId: '' }); rerender(); };
    handlers['hx-econ-remove-terminal'] = (el, arg) => { if (!cuEconomatState.draft) return; cuCaptureEconomatDraft(); cuEconomatState.draft.terminals.splice(Math.max(0, parseInt(arg, 10) || 0), 1); rerender(); };
    handlers['hx-econ-save'] = (el) => cuSaveEconomat(el);
    handlers['hx-econ-shift'] = (el, arg) => cuLoadRoomShift(String(arg || ''));

  async function cuMonthlyClosingModal() {
    const slug = window.KiwiStore?.slugFor?.(cuVenueId()) || '';
    if (!slug) { toast(tx('Établissement non connecté'), { type: 'warn' }); return; }

    const now = new Date();
    const curY = now.getFullYear();
    const curM = now.getMonth() + 1;
    const defaultMonth = (now.getDate() <= 5)
      ? (curM === 1 ? `${curY - 1}-12` : `${curY}-${String(curM - 1).padStart(2, '0')}`)
      : `${curY}-${String(curM).padStart(2, '0')}`;

    let activeMonth = defaultMonth;
    const pendingReviewKeys = new Map();

    const m = K().modal({
      tag: tx('REVUE INTERNE'),
      title: tx('Contrôle mensuel interne'),
      desc: tx('Cohérence des séjours du mois · scellé horodaté à usage interne, sans valeur déclarative.'),
      width: 760,
      body: `<div data-hx-closing-container class="hx-close-loading">
        <span>${tx('Chargement des contrôles…')}</span>
      </div>`
    });

    openModal = { el: m.el, close: m.close };

    function serverExceptionsHtml(exceptions) {
      if (!Array.isArray(exceptions) || !exceptions.length) return '';
      const rows = exceptions.slice(0, 12).map((e) => {
        const where = [e.bookingCode, e.roomId].filter(Boolean).map((x) => esc(String(x))).join(' · ');
        return `<div class="hx-close-exc-row"><b>${esc(String(e.code || tx('anomalie')))}</b><span>${esc(String(e.label || ''))}</span>${where ? `<small>${where}</small>` : ''}</div>`;
      }).join('');
      return `<div class="hx-close-exc-list" role="alert">${rows}</div>`;
    }

    async function postReview(action, extra, btn) {
      const pin = prompt(tx('Code PIN Direction / Gérant (si non connecté avec le compte propriétaire) :')) || '';
      const intent = [action, activeMonth, String(extra?.rectificationReason || '')].join('|');
      let idempotencyKey = pendingReviewKeys.get(intent);
      if (!idempotencyKey) {
        idempotencyKey = 'hotel-review-' + crypto.randomUUID();
        pendingReviewKeys.set(intent, idempotencyKey);
      }
      btn.disabled = true;
      const errBox = m.el.querySelector('[data-hx-closing-error]');
      if (errBox) errBox.innerHTML = '';
      try {
        const resp = await fetch('/api/hotel/declarations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, merchant: slug, month: activeMonth, pin, idempotencyKey, ...(extra || {}) })
        });
        const resBody = await resp.json().catch(() => ({}));
        if (resp.ok || resp.status < 500) pendingReviewKeys.delete(intent);
        if (!resp.ok) {
          if (errBox) {
            errBox.innerHTML = `<div class="hx-close-err">${esc(resBody.detail || resBody.error || tx('Contrôle impossible pour ce mois.'))}${serverExceptionsHtml(resBody.exceptions)}</div>`;
          } else {
            toast(resBody.detail || resBody.error || tx('Contrôle impossible pour ce mois.'), { type: 'error' });
          }
        } else if (resBody.replayed) {
          toast(tx('Demande déjà scellée, révision existante rechargée'), { type: 'success' });
          load(activeMonth);
        } else {
          toast(action === 'finalize' ? tx('Mois {m} scellé en contrôle interne', { m: activeMonth }) : tx('Révision {n} enregistrée', { n: resBody.declaration?.revision }), { type: 'success' });
          load(activeMonth);
        }
      } catch (_) {
        if (errBox) errBox.innerHTML = `<div class="hx-close-err">${tx('Erreur réseau.')}</div>`;
        else toast(tx('Erreur réseau.'), { type: 'error' });
      } finally { btn.disabled = false; }
    }

    async function load(month) {
      activeMonth = month;
      const container = m.el.querySelector('[data-hx-closing-container]');
      if (!container) return;
      container.innerHTML = `<div class="hx-close-loading"><span>${tx('Calcul et vérification des règles…')}</span></div>`;

      try {
        const res = await fetch(`/api/hotel/declarations?merchant=${encodeURIComponent(slug)}&month=${encodeURIComponent(month)}`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          container.innerHTML = `<div class="hx-close-err">${esc(data.detail || data.error || tx('Lecture impossible.'))}</div>`;
          return;
        }
        const decls = data.declarations || [];
        const latest = decls[0] || null;

        const [yStr, mStr] = month.split('-');
        const y = parseInt(yStr, 10), mVal = parseInt(mStr, 10);
        const mStart = `${month}-01`;
        const mEnd = mVal === 12 ? `${y + 1}-01-01` : `${y}-${String(mVal + 1).padStart(2, '0')}-01`;

        let d1Stays = [];
        try {
          const sRes = await fetch(`/api/hotel/stays?merchant=${encodeURIComponent(slug)}&from=${encodeURIComponent(mStart)}&to=${encodeURIComponent(mEnd)}`);
          if (sRes.ok) {
            const sData = await sRes.json();
            if (Array.isArray(sData.stays)) d1Stays = sData.stays;
          }
        } catch (_) {}

        const allMonthStays = new Map();
        const doc = window.KiwiReservations?.get?.() || { bookings: [] };
        (doc.bookings || []).forEach((b) => { if (b && b.id) allMonthStays.set(b.id, b); });
        d1Stays.forEach((b) => { if (b && b.id) allMonthStays.set(b.id, b); });

        const monthStays = Array.from(allMonthStays.values()).filter((b) => b.hotel && b.status !== 'cancelled' && b.status !== 'no_show' && b.hotel.checkIn < mEnd && b.hotel.checkOut > mStart);

        const todayStr = new (globalThis.KiwiZoneLaw?.DateTimeFormat || Intl.DateTimeFormat)('en-CA', { timeZone: 'Africa/Casablanca', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

        const exceptions = [];
        monthStays.forEach((b) => {
          const errs = cuEvaluateStayExceptions(b, todayStr);
          if (errs.length) exceptions.push({ booking: b, errs });
        });

        const blockingCount = exceptions.filter((x) => x.errs.some((e) => e.severity === 'danger')).length;

        let statusBadge = '';
        if (latest) {
          statusBadge = `<span class="hx-close-badge closed">${tx('CONTRÔLÉ (Rév. {n})', { n: latest.revision })}</span>`;
        } else if (blockingCount > 0) {
          statusBadge = `<span class="hx-close-badge blocked">${tx('NON CONTRÔLÉ · {n} ANOMALIE(S)', { n: blockingCount })}</span>`;
        } else {
          statusBadge = `<span class="hx-close-badge ready">${tx('PRÊT POUR CONTRÔLE')}</span>`;
        }

        let summaryHtml = '';
        if (latest) {
          const p = latest.payload || {};
          summaryHtml = `<div class="hx-close-grid">
            <div class="hx-close-stat"><span>${tx('Arrivées')}</span><b>${p.totalArrivals || 0}</b></div>
            <div class="hx-close-stat"><span>${tx('Nuitées clients')}</span><b>${p.totalBedNights || 0}</b></div>
            <div class="hx-close-stat"><span>${tx('Nuits-chambres occupées')}</span><b>${p.occupiedRoomNightsCount || 0}</b></div>
            <div class="hx-close-stat"><span>${tx('Empreinte SHA-256')}</span><small class="hx-mono" dir="ltr">${esc((latest.canonicalHash || '').slice(0, 16))}...</small></div>
          </div>`;
        } else if (!monthStays.length) {
          summaryHtml = `<p class="hx-close-note">${tx('Aucun séjour sur ce mois, un mois sans activité peut être scellé tel quel.')}</p>`;
        }

        let historyHtml = '';
        if (decls.length > 0) {
          historyHtml = `<div class="hx-close-hist">
            <div class="hx-close-hist-title">${tx('HISTORIQUE DES RÉVISIONS')}</div>
            <div class="hx-close-hist-scroll">
              <table>
                <thead><tr><th>${tx('Rév.')}</th><th>${tx('Date')}</th><th>${tx('Responsable')}</th><th>${tx('Motif')}</th></tr></thead>
                <tbody>
                  ${decls.map((d) => `<tr>
                    <td><b>#${d.revision}</b> (${esc(d.state || '')})</td>
                    <td>${new Date(d.closedAt).toLocaleDateString(hxLocale())} ${new Date(d.closedAt).toLocaleTimeString(hxLocale(), { hour: '2-digit', minute: '2-digit' })}</td>
                    <td>${esc(d.closedBy?.name || tx('Direction'))}</td>
                    <td>${esc(d.rectificationReason || tx('Contrôle initial'))}</td>
                  </tr>`).join('')}
                </tbody>
              </table>
            </div>
          </div>`;
        }

        let actionBlock = '';
        if (!latest) {
          if (blockingCount > 0) {
            actionBlock = `<div class="hx-close-blocked">
              <b>${tx('Contrôle bloqué : {n} anomalie(s) bloquante(s)', { n: blockingCount })}</b>
              <p>${tx('Complétez les fiches voyageurs ou clôturez les départs dépassés avant de sceller le contrôle interne.')}</p>
            </div>`;
          } else {
            actionBlock = `<div class="hx-close-actions">
              <button data-activation=write class="hx-btn atlas hx-close-finalize">${tx('Valider le contrôle du mois (Réservé Direction)')}</button>
            </div>`;
          }
        } else {
          actionBlock = `<div class="hx-close-actions between">
            <span class="hx-close-note">${tx('Contrôle interne scellé. Toute correction se fait par révision motivée.')}</span>
            <button class="hx-btn warn hx-close-rectify">${tx('Déposer une révision corrective…')}</button>
          </div>`;
        }

        container.innerHTML = `
          <div class="hx-close-bar">
            <div>
              <label>${tx('Mois contrôlé :')}</label>
              <input type="month" dir="ltr" data-hx-closing-month value="${month}">
            </div>
            <div>${statusBadge}</div>
          </div>
          ${summaryHtml}
          <div data-hx-closing-error></div>
          ${actionBlock}
          ${historyHtml}
        `;

        const monthInput = container.querySelector('[data-hx-closing-month]');
        monthInput?.addEventListener('change', (e) => load(e.target.value));

        const finalizeBtn = container.querySelector('.hx-close-finalize');
        finalizeBtn?.addEventListener('click', () => postReview('finalize', null, finalizeBtn));

        const rectifyBtn = container.querySelector('.hx-close-rectify');
        rectifyBtn?.addEventListener('click', () => {
          const reason = prompt(tx('Motif de la révision corrective (au moins 10 caractères) :'));
          if (!reason || reason.trim().length < 10) { toast(tx('Un motif d’au moins 10 caractères est obligatoire.'), { type: 'warn' }); return; }
          postReview('rectify', { rectificationReason: reason.trim() }, rectifyBtn);
        });

      } catch (err) {
        container.innerHTML = `<div class="hx-close-err">${tx('Erreur : {reason}', { reason: esc(err.message) })}</div>`;
      }
    }

    load(activeMonth);
  }

  /* — custom-hotel controls — */
  /* Le sélecteur « Vue » annonce lui-même ce qu'il contient — « Départs (1) ».
   * Tant qu'il fallait ensuite appuyer sur « Afficher », la liste restait sur
   * la vue précédente : le compteur promettait un départ et la page répondait
   * « Aucun dossier dans cette vue ». Lire les contrôles est donc séparé de la
   * décision de recharger. */
  function cuReadReceptionControls(root) {
    const date = root.querySelector('[data-hx-daily-date]');
    if (!date?.value || !date.checkValidity()) { date?.reportValidity(); return null; }
    const filter = cuReceptionSelection();
    const previousDate = filter.date;
    filter.date = date.value;
    const view = root.querySelector('[data-hx-daily-view]')?.value;
    filter.view = ['arrivals', 'departures', 'inhouse', 'attention'].includes(view) ? view : 'arrivals';
    filter.q = String(root.querySelector('[data-hx-daily-search]')?.value || '').slice(0, 100);
    return { dateChanged: previousDate !== filter.date };
  }
  handlers['hx-daily-apply'] = (el) => {
    const root = el.closest('.hx-daily');
    if (!root || !isCustomHotel()) return;
    if (!cuReadReceptionControls(root)) return;
    cuRefreshReception();
  };
  if (!cuReceptionControlsBound) {
    cuReceptionControlsBound = true;
    /* Délégué au document : `rerender()` remplace tout le corps du tiroir, donc
     * un écouteur posé sur le <select> lui-même ne survivrait pas au premier
     * rafraîchissement. La recherche texte garde « Afficher » — elle ne doit
     * pas se relancer à chaque frappe. */
    document.addEventListener('change', (event) => {
      const dispo = event.target?.closest?.('[data-hx-dispo-page-select]');
      if (dispo && cuStayView === 'availability' && !dispo.closest('.kiwi-modal')) {
        cuDispoCat = String(dispo.value || 'all');
        rerender();
        return;
      }
      const control = event.target?.closest?.('[data-hx-daily-view], [data-hx-daily-date]');
      if (!control || !isCustomHotel()) return;
      const root = control.closest('.hx-daily');
      if (!root) return;
      const read = cuReadReceptionControls(root);
      if (!read) return;
      // Changer de vue relit des dossiers déjà chargés ; changer de date
      // demande un aller-retour serveur.
      if (read.dateChanged) cuRefreshReception(); else rerender();
    });
  }
  handlers['hx-stay-checkin'] = (el, arg) => { if (isCustomHotel()) cuMoveStayStatus(String(arg || ''), 'checked_in', el); };
  handlers['hx-stay-checkout'] = (el, arg) => { if (isCustomHotel()) cuMoveStayStatus(String(arg || ''), 'completed', el); };
  /* Une arrivée enregistrée sur le mauvais dossier se défait : la chambre est
     rendue et le séjour repart de « confirmé ». Sans ce geste, la réception
     n'avait qu'une sortie — clôturer un séjour qui n'a jamais commencé, et le
     facturer en entier. */
  handlers['hx-stay-undo-checkin'] = (el, arg) => { if (isCustomHotel()) cuMoveStayStatus(String(arg || ''), 'confirmed', el); };
  /* Le no-show passait par un enregistrement complet du dossier — donc par le
     risque d'effacer un champ non renvoyé. Il ne touche plus que le statut. */
  handlers['hx-stay-noshow'] = (el, arg) => { if (isCustomHotel()) cuMoveStayStatus(String(arg || ''), 'no_show', el); };
  /* Un dossier clos dont la matière de facturation a cassé n'était plus
     réparable : chambres listées, aucun chemin de facturation, aucune action.
     La réouverture rend le bloc commercial modifiable, puis on reclôture. */
  handlers['hx-stay-reopen'] = (el, arg) => { if (isCustomHotel()) cuMoveStayStatus(String(arg || ''), 'checked_in', el, true); };
  handlers['hx-daily-refresh'] = () => { if (isCustomHotel()) cuRefreshReception(); };
  handlers['hx-monthly-closing'] = () => { if (isCustomHotel()) cuMonthlyClosingModal(); };
  handlers['hx-tape-prev'] = async () => {
    cuTapeOffset -= 14;
    const today = new (globalThis.KiwiZoneLaw?.DateTimeFormat || Intl.DateTimeFormat)('en-CA', { timeZone: 'Africa/Casablanca', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const add = (ymd, n) => { const d = new Date(ymd + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
    const start = add(today, cuTapeOffset);
    const end = add(start, 14);
    if (cuTapeOffset < -3 || cuTapeOffset + 14 > 14) {
      await cuFetchStaysForWindow(start, end);
    }
    rerender();
  };
  handlers['hx-tape-next'] = async () => {
    cuTapeOffset += 14;
    const today = new (globalThis.KiwiZoneLaw?.DateTimeFormat || Intl.DateTimeFormat)('en-CA', { timeZone: 'Africa/Casablanca', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const add = (ymd, n) => { const d = new Date(ymd + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
    const start = add(today, cuTapeOffset);
    const end = add(start, 14);
    if (cuTapeOffset < -3 || cuTapeOffset + 14 > 14) {
      await cuFetchStaysForWindow(start, end);
    }
    rerender();
  };
  handlers['hx-tape-today'] = () => { cuTapeOffset = 0; rerender(); };
  /* Ticket #0008 · monthly free/occupied grid per category. */
  const cuDispoHost = (el) => el?.closest('.kiwi-modal')?.querySelector('[data-hx-dispo-body]') || document.querySelector('[data-hx-dispo-page-body]');
  const cuDispoRefreshPage = async () => {
    rerender();
    const days = cuDispoMonthDays(cuDispoMonth);
    await cuFetchStaysForWindow(days[0], cuDispoAddDays(days[days.length - 1], 1));
    if (cuStayView === 'availability') rerender();
  };
  handlers['hx-dispo'] = () => {
    if (!isCustomHotel()) return;
    cuStayView = 'availability';
    const today = new (globalThis.KiwiZoneLaw?.DateTimeFormat || Intl.DateTimeFormat)('en-CA', { timeZone: 'Africa/Casablanca', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    cuDispoMonth = today.slice(0, 7); cuDispoCat = 'all';
    cuDispoRefreshPage();
  };
  handlers['hx-dispo-back'] = () => { cuStayView = 'tape'; rerender(); };
  handlers['hx-dispo-prev'] = (el) => {
    const host = cuDispoHost(el); cuDispoMonth = cuDispoAddMonth(cuDispoMonth, -1);
    if (host?.closest('.kiwi-modal')) cuDispoPaint(host, true); else cuDispoRefreshPage();
  };
  handlers['hx-dispo-next'] = (el) => {
    const host = cuDispoHost(el); cuDispoMonth = cuDispoAddMonth(cuDispoMonth, 1);
    if (host?.closest('.kiwi-modal')) cuDispoPaint(host, true); else cuDispoRefreshPage();
  };
  handlers['hx-dispo-today'] = (el) => {
    const host = cuDispoHost(el); if (!host) return;
    cuDispoMonth = new (globalThis.KiwiZoneLaw?.DateTimeFormat || Intl.DateTimeFormat)('en-CA', { timeZone: 'Africa/Casablanca', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()).slice(0, 7);
    if (host.closest('.kiwi-modal')) cuDispoPaint(host, false); else rerender();
  };
  handlers['hx-dispo-refresh'] = (el) => { const host = cuDispoHost(el); if (host?.closest('.kiwi-modal')) cuDispoPaint(host, true); else cuDispoRefreshPage(); };
  handlers['hx-stay-new'] = () => { if (isCustomHotel()) cuStayEditor(null); };
  handlers['hx-group-new'] = () => { if (isCustomHotel()) cuGroupReservationModal({ resume: false }); };
  handlers['hx-group-resume'] = () => { if (isCustomHotel()) cuGroupReservationModal({ resume: true }); };
    /* "Configurer ce tarif" beside a missing-rate warning: open the room-type
     * editor stacked above the stay editor. The stay form DOM is untouched,
     * so the reservation draft survives; when the type editor closes, the
     * modal tracker is restored and the stay quote recomputes in place. */
    handlers['hx-configure-rate'] = (el, arg) => {
      if (!isCustomHotel()) return;
      // typeIds themselves contain colons (type:t1): split from the right.
      const parts = String(arg || '').split(':');
      const kind = parts.pop(), board = parts.pop(), typeId = parts.join(':');
      const form = el.closest('[data-hx-stay-form]');
      if (!form || !typeId) return;
      const prevModal = openModal;
      cuTypeEditor(typeId);
      const root = openModal?.el;
      const focusSel = kind === 'room' ? '[data-hx-type-rate]' : (board ? `[data-hx-type-board-${board}]` : '');
      const target = (focusSel && root?.querySelector(focusSel)) || root?.querySelector('[data-hx-type-name]');
      // After the modal's own focus trap settles, land on the missing field.
      setTimeout(() => { try { target?.focus?.(); } catch (_) {} }, 60);
      if (openModal && openModal !== prevModal) {
        const typeNode = openModal.el, stayForm = form;
        const obs = new MutationObserver(() => {
          if (typeNode.isConnected) return;
          obs.disconnect();
          openModal = prevModal;
          // Gate the refresh on the server acknowledgment: the pending state
          // appears only if the push takes longer than a beat, and the new
          // total is never shown as ready before the rooms document is out.
          cuTariffSyncCycle(stayForm, 400);
        });
        obs.observe(document.body, { childList: true });
      }
    };
    handlers['hx-tariff-retry'] = (el) => { const form = el.closest('[data-hx-stay-form]'); if (form) cuTariffRetry(form); };
    handlers['hx-dossier'] = (el,arg) => { const booking=cuAllStays().get(String(arg));if(booking?.hotel)cuOpenDossier(booking); };
  handlers['hx-stay-edit'] = (el, arg) => {
    if (!isCustomHotel() || String(arg).startsWith('folio:')) return;
    const booking = cuAllStays().get(String(arg));
    if (booking?.hotel) cuStayEditor(booking);
  };
  handlers['hx-stay-cancel'] = (el, arg) => {
    const booking = cuAllStays().get(String(arg));
    if (!booking) return;

      openModal?.close?.();
      const m = K().modal({ tag: tx('ANNULATION'), title: tx('Libérer cette chambre ?'), desc: esc(booking.customer.name) + ' · ' + esc(cuDay(booking.hotel.checkIn) + hxTo() + cuDay(booking.hotel.checkOut)), width: 460,
        body: `<p style="font-size:13px;line-height:1.6;color:var(--n-600);">${tx('Le séjour restera dans l’historique avec le statut annulé. La chambre redeviendra immédiatement réservable en direct et sur la saisie OTA.')}</p><div class="hx-room-form-actions"><button class="hx-btn ghost" data-action="hx-stay-cancel-close">${tx('Garder le séjour')}</button><button class="hx-btn warn" data-action="hx-stay-cancel-confirm" data-arg="${esc(booking.id)}">${tx('Annuler et libérer')}</button></div>` });
      openModal = { el: m.el, close: m.close };
    };
    handlers['hx-stay-cancel-close'] = () => { openModal?.close?.(); openModal = null; };
    handlers['hx-stay-cancel-confirm'] = (el, arg) => cuCancelStay(String(arg), el, openModal);
    handlers['hx-room-add'] = () => {
      if (!isCustomHotel()) return;
      cuRoomBatchEditor();
    };
    handlers['hx-room-add-floor'] = (el, arg) => {
      if (!isCustomHotel()) return;
      cuRoomBatchEditor(String(arg || ''));
    };
    handlers['hx-room-edit'] = (el, arg) => {
      if (!isCustomHotel()) return;
      cuRoomEditor(parseInt(arg, 10));
    };
    handlers['hx-room-batch-save'] = (el) => {
      if (!isCustomHotel()) return;
      const root = el.closest('.kiwi-modal');
      const raw = String(root?.querySelector('[data-hx-room-numbers]')?.value || '').trim();
      const numbers = cuParseRoomNumbers(raw);
      const typeId = String(root?.querySelector('[data-hx-room-type-id]')?.value || '');
      const floorId = String(root?.querySelector('[data-hx-room-floor-id]')?.value || '');
      const st = cuState();
      const floor = st.floors[floorId];
      if (!numbers.length) {
        toast(tx('Ajoutez les numéros de chambres'), { type: 'warn', desc: tx('Exemple : 101-108, 110, 112.') });
        root?.querySelector('[data-hx-room-numbers]')?.focus();
        return;
      }
      if (!st.roomTypes[typeId]) {
        toast(tx('Choisissez un type de chambre'), { type: 'warn', desc: tx('Vous pouvez créer vos propres types et tarifs.') });
        return;
      }
      if (!floor) {
        toast(tx('Choisissez une section'), { type: 'warn', desc: tx('Créez vos étages et ailes depuis le plan.') });
        return;
      }
      const duplicates = numbers.filter((n) => st.rooms[n]);
      if (duplicates.length) {
        toast(tx('Certaines chambres existent déjà'), { type: 'warn', desc: tx('Retirez : {list}', { list: duplicates.slice(0, 8).join(', ') + (duplicates.length > 8 ? '…' : '') }) });
        return;
      }
      const now = cuStamp();
      numbers.forEach((n, i) => {
        st.rooms[n] = {
          id: 'room:' + now.toString(36) + ':' + n, n, typeId,
          typeName: st.roomTypes[typeId].name, floorId, floor: floor.name, rate: null,
          status: 'libre', hk: 'clean', guest: null, meta: txk('Libre · propre'),
          view: null, characteristics: [], connectingRoomIds: [],
          updatedAt: now + i,
        };
      });
      cuSave(st);
      cuUpdateFloorsManagerModal();
      cuRefreshFloorSelectors();
      openModal?.close?.();
      toast(tx(numbers.length === 1 ? '{n} chambre ajoutée' : '{n} chambres ajoutées', { n: numbers.length, c: txn(numbers.length, 'chambre') }), {
        type: 'success', desc: st.roomTypes[typeId].name + ' · ' + floor.name + ' · ' + (numbers.length > 1 ? tx('{a} à {b}', { a: numbers[0], b: numbers[numbers.length - 1] }) : numbers[0]),
      });
      cuRackFilter.floor = floor.name;
      cuRackFilter.status = 'all';
      cuRackFilter.q = '';
      rerender();
    };
    handlers['hx-room-save'] = (el, arg) => {
      if (!isCustomHotel()) return;
      const root = el.closest('.kiwi-modal');
      const oldN = parseInt(arg, 10);
      const n = parseInt(root?.querySelector('[data-hx-room-number]')?.value || '', 10);
      const typeId = String(root?.querySelector('[data-hx-room-type-id]')?.value || '');
      const floorId = String(root?.querySelector('[data-hx-room-floor-id]')?.value || '');
      const statusEl = root?.querySelector('[data-hx-room-status]');
      const status = statusEl ? statusEl.value : 'libre';
      const st = cuState();
      const prior = st.rooms[oldN];
      if (!Number.isFinite(n) || n < 1 || n > 9999) {
        toast(tx('Numéro de chambre invalide'), { type: 'warn', desc: tx('Utilisez un numéro entre 1 et 9999.') });
        root?.querySelector('[data-hx-room-number]')?.focus();
        return;
      }
      if (oldN !== n && st.rooms[n]) {
        toast(tx('Ce numéro existe déjà'), { type: 'warn', desc: tx('Choisissez un numéro de chambre unique.') });
        root?.querySelector('[data-hx-room-number]')?.focus();
        return;
      }
      if (!st.roomTypes[typeId]) {
        toast(tx('Choisissez un type de chambre'), { type: 'warn' });
        return;
      }
      if (!st.floors[floorId]) {
        toast(tx('Choisissez une section'), { type: 'warn' });
        return;
      }
      if (!prior) return;
      const viewVal = root?.querySelector('[data-hx-room-view]')?.value;
      const view = viewVal !== undefined ? (String(viewVal).trim() || null) : (prior?.view || null);
      const characteristics = typeof root?.querySelectorAll === 'function'
        ? Array.from(root.querySelectorAll('[data-hx-room-char]:checked') || []).map((cb) => cb.getAttribute?.('data-hx-room-char') || cb.dataset?.hxRoomChar).filter(Boolean)
        : (prior?.characteristics || []);
      const connSelect = root?.querySelector('[data-hx-room-connecting]');
      const connectingRoomIds = connSelect
        ? Array.from(connSelect.selectedOptions || []).map((o) => o.value).filter(Boolean)
        : (prior?.connectingRoomIds || []);
      // Same-floor rule holds even when the floor itself was just changed:
      // prior liaisons are grandfathered, new cross-floor picks are refused.
      const keptLinked = new Set((prior?.connectingRoomIds || []).map(String));
      const newFloorKey = cuFloorKey({ floorId, floor: st.floors[floorId]?.name });
      const badNew = connectingRoomIds.filter((id) => {
        if (keptLinked.has(String(id))) return false;
        const o = Object.values(st.rooms).find((r) => String(r.id) === String(id));
        return !!o && cuFloorKey(o) !== newFloorKey;
      });
      if (badNew.length) {
        toast(tx('Liaison impossible entre étages'), { type: 'warn', desc: tx('Seules les chambres du même étage peuvent être reliées. Retirez la sélection hors étage.') });
        return;
      }
      const liveKey = cuRoomStatus(prior).key;
      const active = liveKey === 'occ' || liveKey === 'arrivee';
      const savedStatus = active ? prior.status : (['libre', 'sale', 'hs'].includes(status) ? status : 'libre');
      const now = cuStamp();
      const room = {
        ...prior, n, typeId, typeName: st.roomTypes[typeId].name,
        floorId, floor: st.floors[floorId].name, rate: null, status: savedStatus,
        view, characteristics,
        hk: savedStatus === 'sale' ? 'dirty' : savedStatus === 'libre' ? 'clean' : (prior?.hk || 'clean'),
        guest: prior?.guest || null,
        meta: active ? prior.meta : savedStatus === 'libre' ? txk('Libre · propre') : savedStatus === 'sale' ? txk('À remettre à blanc') : txk('Hors-service'),
        updatedAt: now,
      };
      if (oldN !== n) {
        delete st.rooms[oldN];
        if (st.folios[oldN]) {
          st.folios[n] = { ...st.folios[oldN], room: n, updatedAt: now };
          delete st.folios[oldN];
        }
      }
      st.rooms[n] = room;
      cuSetConnectingRooms(st, room, connectingRoomIds);
      cuSave(st);
      cuUpdateFloorsManagerModal();
      cuRefreshFloorSelectors();
      openModal?.close?.();
      toast(tx('Chambre {n} enregistrée', { n }), { type: 'success', desc: st.roomTypes[typeId].name + ' · ' + st.floors[floorId].name });
      rerender();
    };
    handlers['hx-room-types'] = () => { if (isCustomHotel()) cuTypesManager(); };
    handlers['hx-floors'] = () => { if (isCustomHotel()) cuFloorsManager(); };
    handlers['hx-floor-new'] = () => { if (isCustomHotel()) cuFloorEditor(null); };
    handlers['hx-floor-edit'] = (el, arg) => { if (isCustomHotel()) cuFloorEditor(String(arg || '')); };
    handlers['hx-floor-save'] = async (el, arg) => {
      if (!isCustomHotel() || cuFloorSaving) return;
      const root = el.closest('.kiwi-modal');
      const name = String(root?.querySelector('[data-hx-floor-name]')?.value || '').trim().slice(0, 60);
      const errEl = root?.querySelector('[data-hx-floor-error]');
      const fail = (message) => {
        if (errEl) { errEl.textContent = message; errEl.hidden = false; }
        toast(message, { type: 'error' });
      };
      if (!name) { fail(trL({fr:'Donnez un nom à cette section.',en:'Enter a section name.',ar:'أدخل اسم القسم.'})); return; }
      const scope = cuStateId();
      const st = cuHydrate(cuDocument(cuState()));
      const duplicate = Object.values(st.floors).find((f) => f.name.toLocaleLowerCase('fr') === name.toLocaleLowerCase('fr') && f.id !== arg);
      if (duplicate) { fail(trL({fr:'Cette section existe déjà.',en:'This section already exists.',ar:'هذا القسم موجود بالفعل.'})); return; }
      cuFloorSaving = true;
      el.disabled = true;
      try {
        const now = cuStamp();
        // Keep the same identity on retries, including an uncertain network reply.
        const id = arg === 'new' ? (el.__floorIntentId || (el.__floorIntentId = cuFloorId(name, now))) : String(arg);
        const order = arg === 'new' ? cuFloorRows().length : (st.floors[id]?.order || 0);
        st.floors[id] = { ...(st.floors[id] || {}), id, name, order, updatedAt: now };
        Object.values(st.rooms).filter((r) => r.floorId === id).forEach((r) => { r.floor = name; r.updatedAt = now; });
        await cuCommitDraft(st);
        if (scope !== cuStateId()) return;
        cuRackFilter.floor = 'all';
        cuUpdateFloorsManagerModal();
        cuRefreshFloorSelectors();
        openModal?.close?.();
        toast(tx('Section « {name} » enregistrée', { name }), {type:'success', desc:trL({fr:'Enregistrement serveur confirmé.',en:'Server save confirmed.',ar:'تم تأكيد الحفظ بالخادم.'})});
        rerender();
      } catch (error) { if (scope === cuStateId()) fail(error.message); }
      finally { el.disabled = false; cuFloorSaving = false; }
    };
    handlers['hx-floor-move'] = (el, arg) => {
      if (!isCustomHotel()) return;
      const value = String(arg || '');
      const cut = value.lastIndexOf(':');
      const id = value.slice(0, cut);
      const rawDelta = value.slice(cut + 1);
      const delta = parseInt(rawDelta, 10);
      const st = cuState();
      const list = cuFloorRows();
      const index = list.findIndex((f) => f.id === id);
      const target = index + delta;
      if (index < 0 || target < 0 || target >= list.length) return;
      const now = cuStamp();
      const a = list[index], b = list[target], old = a.order;
      a.order = b.order; b.order = old; a.updatedAt = now; b.updatedAt = now + 1;
      cuSave(st);
      cuUpdateFloorsManagerModal();
      cuRefreshFloorSelectors();
      rerender();
    };
    handlers['hx-floor-delete'] = (el, arg) => {
      if (!isCustomHotel()) return;
      const root = el.closest('.kiwi-modal');
      const st = cuState();
      const floor = st.floors[arg];
      if (!floor) return;
      const rooms = Object.values(st.rooms).filter((r) => r.floorId === arg);
      const targetId = String(root?.querySelector('[data-hx-floor-target]')?.value || '');
      if (rooms.length && !st.floors[targetId]) {
        toast(tx('Créez une autre section avant de supprimer celle-ci'), { type: 'warn', desc: tx('Aucune chambre ne sera supprimée automatiquement.') });
        return;
      }
      const now = cuStamp();
      if (rooms.length) rooms.forEach((r, index) => { r.floorId = targetId; r.floor = st.floors[targetId].name; r.updatedAt = now + index; });
      const tombstone = { ...floor, updatedAt: now, deletedAt: now };
      const records = st.floorRecords || (st.floorRecords = []);
      const i = records.findIndex((f) => f && f.id === arg);
      if (i >= 0) records[i] = tombstone; else records.push(tombstone);
      delete st.floors[arg];
      cuRackFilter.floor = 'all';
      cuSave(st);
      cuUpdateFloorsManagerModal();
      cuRefreshFloorSelectors();
      openModal?.close?.();
      toast(tx('Section supprimée'), { type: 'success', desc: rooms.length ? tx(rooms.length === 1 ? '{n} chambre déplacée vers « {name} ».' : '{n} chambres déplacées vers « {name} ».', { n: rooms.length, c: txn(rooms.length, 'chambre'), name: st.floors[targetId].name }) : tx('La section était vide.') });
      rerender();
    };
    handlers['hx-room-type-new'] = () => { if (isCustomHotel()) cuTypeEditor(null); };
    handlers['hx-room-type-edit'] = (el, arg) => { if (isCustomHotel()) cuTypeEditor(String(arg || '')); };
    handlers['hx-type-photo-pick'] = (el) => el.closest('.kiwi-modal')?.querySelector('[data-hx-type-photo-input]')?.click();
    handlers['hx-type-photo-remove'] = (el, arg) => {
      const root = el.closest('.kiwi-modal'), index = +arg;
      if (!root || !Number.isInteger(index) || !root.__hxPhotos?.[index]) return;
      root.__hxPhotos.splice(index, 1); cuRenderPhotoEditor(root);
    };
    handlers['hx-type-photo-move'] = (el, arg) => {
      const root = el.closest('.kiwi-modal'), [from, delta] = String(arg || '').split(':').map(Number), to = from + delta;
      if (!root || !root.__hxPhotos?.[from] || !root.__hxPhotos?.[to]) return;
      const photo = root.__hxPhotos.splice(from, 1)[0]; root.__hxPhotos.splice(to, 0, photo); cuRenderPhotoEditor(root);
    };
    handlers['hx-room-type-save'] = (el, arg) => {
      if (!isCustomHotel()) return;
      const root = el.closest('.kiwi-modal');
      const priorType = cuState().roomTypes[String(arg)] || {};
      const name = String(root?.querySelector('[data-hx-type-name]')?.value || '').trim();
      const rateRaw = String(root?.querySelector('[data-hx-type-rate]')?.value || '').trim();
      const descriptionEl = root?.querySelector('[data-hx-type-description]');
      const guestsEl = root?.querySelector('[data-hx-type-guests]');
      const bedsEl = root?.querySelector('[data-hx-type-beds]');
      const sizeEl = root?.querySelector('[data-hx-type-size]');
      const viewEl = root?.querySelector('[data-hx-type-view]');
      const amenitiesEl = root?.querySelector('[data-hx-type-amenities]');
      const publicEl = root?.querySelector('[data-hx-type-public]');
      const description = String(descriptionEl ? descriptionEl.value : (priorType.description || '')).trim();
      const guestsRaw = String(guestsEl ? guestsEl.value : (priorType.maxGuests || 2)).trim();
      const beds = String(bedsEl ? bedsEl.value : (priorType.beds || '')).trim();
      const sizeRaw = String(sizeEl ? sizeEl.value : (priorType.sizeM2 || '')).trim();
      const view = String(viewEl ? viewEl.value : (priorType.view || '')).trim();
      const amenities = String(amenitiesEl ? amenitiesEl.value : (priorType.amenities || []).join(',')).split(',')
        .map((v) => v.trim().slice(0, 40)).filter(Boolean).slice(0, 12);
      const isPublic = publicEl ? !!publicEl.checked : priorType.public !== false;
      const photos = (root?.__hxPhotos || priorType.photos || []).slice(0, 8).map((p, i) => cuSafePhoto(p, i, name || priorType.name || 'Chambre')).filter(Boolean);
      const st = cuState();
      if (!name) {
        toast(tx('Donnez un nom à ce type'), { type: 'warn', desc: 'Ex. Chambre Deluxe, Suite Atlas, Twin Patio.' });
        root?.querySelector('[data-hx-type-name]')?.focus();
        return;
      }
      if (rateRaw && (!Number.isFinite(+rateRaw) || +rateRaw < 0)) {
        toast(tx('Tarif invalide'), { type: 'warn' });
        root?.querySelector('[data-hx-type-rate]')?.focus();
        return;
      }
      const boardRates = {};
      let boardRateBad = null;
      for (const key of ['bb', 'hb_lunch', 'hb_dinner', 'full_board']) {
        const raw = String(root?.querySelector(`[data-hx-type-board-${key}]`)?.value ?? '').trim();
        if (!raw) { boardRates[key] = null; continue; }
        if (!Number.isFinite(+raw) || +raw < 0 || +raw > 100000) { boardRateBad = key; break; }
        boardRates[key] = Math.round(+raw * 100) / 100;
      }
      if (boardRateBad) {
        toast(tx('Supplément repas invalide'), { type: 'warn', desc: tx('Montant MAD par personne et par nuit, zéro ou plus.') });
        root?.querySelector(`[data-hx-type-board-${boardRateBad}]`)?.focus();
        return;
      }
      if (!Number.isFinite(+guestsRaw) || +guestsRaw < 1 || +guestsRaw > 12) {
        toast(tx('Capacité invalide'), { type: 'warn', desc: 'Indiquez entre 1 et 12 voyageurs.' });
        root?.querySelector('[data-hx-type-guests]')?.focus();
        return;
      }
      if (sizeRaw && (!Number.isFinite(+sizeRaw) || +sizeRaw < 1 || +sizeRaw > 999)) {
        toast('Surface invalide', { type: 'warn' });
        root?.querySelector('[data-hx-type-size]')?.focus();
        return;
      }
      const duplicate = Object.values(st.roomTypes).find((t) => t.name.toLocaleLowerCase('fr') === name.toLocaleLowerCase('fr') && t.id !== arg);
      if (duplicate) {
        toast(tx('Ce type existe déjà'), { type: 'warn', desc: tx('Modifiez « {name} » directement.', { name: duplicate.name }) });
        return;
      }
      const now = cuStamp();
      const id = arg === 'new' ? cuTypeId(name, now) : String(arg);
      st.roomTypes[id] = {
        ...(st.roomTypes[id] || {}), id, name: name.slice(0, 60),
        rate: rateRaw === '' ? null : Math.round(+rateRaw),
        boardRates: Object.values(boardRates).some((v) => v != null) ? boardRates : undefined,
        description: description.slice(0, 300), maxGuests: Math.round(+guestsRaw),
        beds: beds.slice(0, 80), sizeM2: sizeRaw === '' ? null : Math.round(+sizeRaw),
        view: view.slice(0, 80), amenities, photos, public: isPublic, updatedAt: now,
      };
      Object.values(st.rooms).filter((r) => r.typeId === id).forEach((r) => { r.typeName = name.slice(0, 60); r.updatedAt = now; });
      cuSave(st);
      openModal?.close?.();
      toast(tx('Type « {name} » enregistré', { name }), { type: 'success', desc: rateRaw === '' ? tx('Tarif général utilisé.') : tx('{amount} MAD par nuit.', { amount: fmt(+rateRaw) }) });
      rerender();
    };
    handlers['hx-room-type-delete'] = (el, arg) => {
      if (!isCustomHotel()) return;
      const st = cuState();
      const type = st.roomTypes[arg];
      if (!type) return;
      const used = Object.values(st.rooms).filter((r) => r.typeId === arg).length;
      if (used) {
        toast(tx(used === 1 ? 'Type utilisé par {n} chambre' : 'Type utilisé par {n} chambres', { n: used, c: txn(used, 'chambre') }), { type: 'warn', desc: tx('Changez d’abord le type de ces chambres.') });
        return;
      }
      const tombstone = { ...type, updatedAt: cuStamp(), deletedAt: cuStamp() };
      const records = st.typeRecords || (st.typeRecords = []);
      const i = records.findIndex((t) => t && t.id === arg);
      if (i >= 0) records[i] = tombstone; else records.push(tombstone);
      delete st.roomTypes[arg];
      cuSave(st);
      openModal?.close?.();
      toast(tx('Type supprimé'), { type: 'success' });
      rerender();
    };
    handlers['hx-room-filters-open'] = () => { if (isCustomHotel()) cuFiltersModal(); };
    handlers['hx-filter-modal-apply'] = (el) => {
      const root = el.closest('.kiwi-modal');
      if (!root) return;
      cuRackFilter.floors.clear();
      if (typeof root.querySelectorAll === 'function') {
        root.querySelectorAll('[data-hx-filter-floor]:checked').forEach((cb) => {
          cuRackFilter.floors.add(cb.getAttribute('data-hx-filter-floor'));
        });
      }
      if (cuRackFilter.floors.size > 0) cuRackFilter.floor = 'all';

      cuRackFilter.categories.clear();
      if (typeof root.querySelectorAll === 'function') {
        root.querySelectorAll('[data-hx-filter-cat]:checked').forEach((cb) => {
          cuRackFilter.categories.add(cb.getAttribute('data-hx-filter-cat'));
        });
      }

      const hasViewCb = root.querySelector('[data-hx-filter-hasview]');
      cuRackFilter.hasView = Boolean(hasViewCb && hasViewCb.checked);
      cuRackFilter.views.clear();
      if (typeof root.querySelectorAll === 'function') {
        root.querySelectorAll('[data-hx-filter-view]:checked').forEach((cb) => {
          cuRackFilter.views.add(cb.getAttribute('data-hx-filter-view'));
        });
      }

      cuRackFilter.characteristics.clear();
      if (typeof root.querySelectorAll === 'function') {
        root.querySelectorAll('[data-hx-filter-char]:checked').forEach((cb) => {
          cuRackFilter.characteristics.add(cb.getAttribute('data-hx-filter-char'));
        });
      }

      const connCb = root.querySelector('[data-hx-filter-connecting]');
      cuRackFilter.connectingOnly = Boolean(connCb && connCb.checked);
      cuRackFilter.minCapacity = Math.max(0, Math.min(12, parseInt(root.querySelector('[data-hx-filter-capacity]')?.value, 10) || 0));

      openModal?.close?.();
      rerender();
    };
    handlers['hx-filter-modal-reset'] = () => {
      cuResetRackFilter();
      openModal?.close?.();
      rerender();
    };
    handlers['hx-filter-remove'] = (el, arg) => {
      const parts = String(arg || '').split(':');
      const type = parts[0];
      const val = parts.slice(1).join(':');
      if (type === 'floor') cuRackFilter.floor = 'all';
      else if (type === 'floors') cuRackFilter.floors.delete(val);
      else if (type === 'categories') cuRackFilter.categories.delete(val);
      else if (type === 'status') cuRackFilter.status = 'all';
      else if (type === 'hasView') cuRackFilter.hasView = false;
      else if (type === 'views') cuRackFilter.views.delete(val);
      else if (type === 'characteristics') cuRackFilter.characteristics.delete(val);
      else if (type === 'connectingOnly') cuRackFilter.connectingOnly = false;
      else if (type === 'minCapacity') cuRackFilter.minCapacity = 0;
      else if (type === 'q') cuRackFilter.q = '';
      rerender();
    };
    handlers['hx-room-floor'] = (el, arg) => {
      const val = String(arg || 'all');
      cuRackFilter.floor = val;
      cuRackFilter.floors.clear();
      rerender();
    };
    handlers['hx-room-status'] = (el, arg) => {
      cuRackFilter.status = String(arg || 'all');
      rerender();
    };
    handlers['hx-room-search'] = (el) => {
      cuRackFilter.q = String(el.closest('.hx-room-search')?.querySelector('[data-hx-room-search]')?.value || '').trim();
      rerender();
    };
    handlers['hx-room-filter-reset'] = () => {
      cuResetRackFilter();
      rerender();
    };
    if (!window.__kiwiHotelRoomSearchWired) {
      window.__kiwiHotelRoomSearchWired = true;
      document.addEventListener('keydown', (event) => {
        if (!['Enter', ' ', 'Spacebar'].includes(event.key) || !event.target?.matches?.('[data-hx-room-card]')) return;
        // The shared shell has legacy keyboard routers. Handle this composite
        // card once, without routing a key from its nested native controls.
        event.preventDefault();
        event.stopImmediatePropagation();
        event.target.click();
      }, true);
      document.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' || !event.target?.matches?.('[data-hx-room-search]')) return;
        event.preventDefault();
        handlers['hx-room-search'](event.target);
      });
    }
    handlers['hx-room-select-toggle'] = () => {
      cuSelectionMode = !cuSelectionMode;
      if (!cuSelectionMode) cuSelectedRooms.clear();
      rerender();
    };
    handlers['hx-room-check'] = (el, arg) => {
      const n = parseInt(arg, 10);
      const id = R()[n]?.id;
      if (!id) return;
      if (el.checked) cuSelectedRooms.add(String(id));
      else cuSelectedRooms.delete(String(id));
      rerender();
    };
    handlers['hx-room-select-filtered'] = () => {
      Object.values(R()).forEach((r) => {
        if (cuRoomMatchesFilter(r)) cuSelectedRooms.add(String(r.id));
      });
      cuSelectionMode = true;
      rerender();
    };
    handlers['hx-room-select-none'] = () => {
      cuSelectedRooms.clear();
      rerender();
    };
    handlers['hx-room-select-cancel'] = () => {
      cuSelectedRooms.clear();
      cuSelectionMode = false;
      rerender();
    };
    handlers['hx-room-bulk-edit-open'] = () => {
      if (!isCustomHotel()) return;
      if (cuPendingBulk()) { handlers['hx-bulk-resume'](); return; }
      cuBulkEditModal();
    };
    handlers['hx-bulk-resume'] = () => {
      const plan = cuPendingBulk();
      if (!plan) return;
      cuBulkPlan = plan;
      cuBulkStaged = plan.changes;
      cuSelectionMode = true;
      cuSelectedRooms.clear();
      plan.targets.forEach((target) => cuSelectedRooms.add(String(target.id)));
      openModal?.close?.();
      cuBulkReviewModal(plan);
    };
    handlers['hx-bulk-cancel'] = () => {
      openModal?.close?.();
      cuBulkStaged = null;
    };
    handlers['hx-bulk-review'] = (el) => {
      const root = el.closest('.kiwi-modal');
      if (!root) return;
      const floorId = String(root.querySelector('[data-hx-bulk-floor-id]')?.value || '');
      const typeId = String(root.querySelector('[data-hx-bulk-type-id]')?.value || '');
      const viewVal = String(root.querySelector('[data-hx-bulk-view]')?.value || '');
      const charMode = String(root.querySelector('[data-hx-bulk-char-mode]')?.value || 'none');
      const checkedChars = typeof root.querySelectorAll === 'function'
        ? Array.from(root.querySelectorAll('[data-hx-bulk-char]:checked') || []).map((cb) => cb.getAttribute?.('data-hx-bulk-char') || cb.dataset?.hxBulkChar).filter(Boolean)
        : [];

      const hasChange = Boolean(floorId || typeId || viewVal || (charMode !== 'none'));
      if (!hasChange) {
        toast(trL({ fr: 'Aucune modification choisie', en: 'No changes selected', ar: 'لم يتم اختيار أي تعديل' }), {
          type: 'warn',
          desc: trL({ fr: 'Choisissez au moins un paramètre à modifier.', en: 'Select at least one parameter to change.', ar: 'اختر معياراً واحداً على الأقل للتعديل.' }),
        });
        return;
      }

      cuBulkStaged = {
        floorId: floorId || null,
        typeId: typeId || null,
        view: viewVal === '__CLEAR__' ? '' : (viewVal || null),
        charMode,
        characteristics: checkedChars,
      };

      const st = cuState();
      const venueId = cuVenueId();
      const merchant = cuMerchantSlug();
      const operationId = 'bulk_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
      const targets = [];
      for (const r of cuSelectedRows()) {
        if (r && !r.deletedAt) {
          targets.push({
            id: String(r.id),
            n: r.n,
            expectedUpdatedAt: +r.updatedAt || 0,
            before: {
              floorId: r.floorId,
              floor: r.floor,
              typeId: r.typeId,
              typeName: r.typeName,
              view: r.view || null,
              characteristics: Array.isArray(r.characteristics) ? [...r.characteristics] : [],
            },
          });
        }
      }
      if (!targets.length) {
        toast(trL({ fr: 'Aucune chambre valide sélectionnée', en: 'No valid rooms selected', ar: 'لم يتم تحديد أي غرف صالحة' }), { type: 'warn' });
        return;
      }
      targets.sort((a, b) => a.n - b.n);

      cuBulkPlan = {
        operationId,
        venueId,
        stateId: cuStateId(),
        merchant,
        baseRev: st.rev != null ? st.rev : 0,
        createdAt: cuStamp(),
        changes: { ...cuBulkStaged },
        targets,
      };

      openModal?.close?.();
      cuBulkReviewModal(cuBulkPlan);
    };
    handlers['hx-bulk-back'] = () => {
      if (cuBulkPlan?.submitted) return;
      openModal?.close?.();
      cuBulkEditModal(cuBulkStaged);
    };
    handlers['hx-bulk-confirm'] = async (el) => {
      const plan = cuBulkPlan;
      if (!isCustomHotel() || !plan || !plan.targets?.length || cuBulkSaving || plan.needsReview) return;
      if (plan.venueId !== cuVenueId() || plan.merchant !== cuMerchantSlug()) {
        toast(trL({fr:'Établissement changé · vérifiez à nouveau la sélection',en:'Property changed · review the selection again',ar:'تغيرت المنشأة · راجع التحديد مجدداً'}), { type: 'warn' });
        return;
      }
      cuBulkSaving = true;
      if (el) el.disabled = true;
      const stateId = plan.stateId || cuStateId();
      const draftKey = 'kiwi:hotel-bulk-draft:v1:' + stateId;
      try {
        // Preserve the intent, not an unconfirmed mutation of the room register.
        plan.submitted = true;
        localStorage.setItem(draftKey, JSON.stringify(plan));
        const back = openModal?.el?.querySelector('[data-action="hx-bulk-back"]');
        if (back) back.disabled = true;
        if (typeof fetch !== 'function') throw new Error('Connexion serveur indisponible');
        const controller = typeof AbortController === 'function' ? new AbortController() : null;
        const timer = controller ? setTimeout(() => controller.abort(), 20000) : null;
        let response, result;
        try {
          response = await fetch('/api/hotel/rooms-bulk', {
            method: 'POST', credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            ...(controller ? { signal: controller.signal } : {}),
            body: JSON.stringify({
              merchant: plan.merchant, operationId: plan.operationId,
              targets: plan.targets.map(({id,n,expectedUpdatedAt}) => ({id,n,expectedUpdatedAt})),
              changes: plan.changes,
            }),
          });
          result = await response.json();
        } finally { if (timer) clearTimeout(timer); }
        if (!response.ok || !result?.ok || !result.data) {
          const conflict = response.status === 409;
          // A rejected stale revision is safe to review afresh. Unknown outcomes
          // retain the original operation ID and can only be retried.
          if (conflict && result?.error !== 'operation-conflict') {
            plan.submitted = false;
            plan.needsReview = true;
            localStorage.setItem(draftKey, JSON.stringify(plan));
            const back = openModal?.el?.querySelector('[data-action="hx-bulk-back"]');
            if (back) back.disabled = false;
            if (hotelSection('receptionState').cloud()?.pull) Promise.resolve(hotelSection('receptionState').cloud().pull(true)).catch(() => {});
          }
          throw new Error(conflict
            ? trL({fr:'Conflit serveur · actualisez les chambres et vérifiez à nouveau les modifications.',en:'Server conflict · refresh rooms and review the changes again.',ar:'تعارض بالخادم · حدّث الغرف وراجع التعديلات.'})
            : response.status === 401 || response.status === 403
              ? trL({fr:'Session expirée ou droits insuffisants.',en:'Session expired or insufficient permissions.',ar:'انتهت الجلسة أو الصلاحيات غير كافية.'})
              : trL({fr:'Enregistrement non confirmé · réessayez sans recréer cette opération.',en:'Save not confirmed · retry this operation without recreating it.',ar:'لم يتم تأكيد الحفظ · أعد محاولة العملية نفسها.'}));
        }
        // The reply belongs to its original property even if navigation changed.
        const acknowledged = cuHydrate(result.data);
        hotelSection('receptionState').replaceState(stateId, acknowledged);
        const cached = cuWriteLocal(acknowledged, stateId);
        if (cached) localStorage.removeItem(draftKey);
        if (stateId !== cuStateId() || plan.merchant !== cuMerchantSlug()) return;
        if (hotelSection('receptionState').cloud()?.pull) hotelSection('receptionState').cloud().pull(true);
        cuSelectedRooms.clear();
        cuSelectionMode = false;
        cuBulkStaged = null;
        cuBulkPlan = null;
        openModal?.close?.();
        cuUpdateFloorsManagerModal();
        cuRefreshFloorSelectors();
        toast(plan.targets.length + ' ' + trL({fr:'chambres mises à jour',en:'rooms updated',ar:'غرف تم تحديثها'}), {
          type: cached ? 'success' : 'warn',
          desc: cached
            ? trL({fr:'Modification confirmée par le serveur.',en:'Change confirmed by the server.',ar:'تم تأكيد التغيير من الخادم.'})
            : trL({fr:'Confirmé sur le serveur · cache local indisponible, gardez cette page ouverte.',en:'Saved on server · local cache unavailable; keep this page open.',ar:'حُفظ بالخادم · التخزين المحلي غير متاح؛ أبقِ الصفحة مفتوحة.'}),
        });
        rerender();
      } catch (error) {
        if (plan.venueId === cuVenueId()) {
          const message = trL({fr:'Enregistrement non confirmé',en:'Save not confirmed',ar:'لم يتم تأكيد الحفظ'});
          const detail = error?.message || String(error);
          const node = openModal?.el?.querySelector('[data-hx-bulk-error]');
          if (node) { node.hidden = false; node.textContent = detail; }
          toast(message, { type: 'error', desc: detail });
        }
      } finally {
        if (el) el.disabled = !!plan.needsReview;
        cuBulkSaving = false;
      }
    };
    handlers['hx-views-manage-open'] = () => { if (isCustomHotel()) cuViewsAndCharsManager(); };
    handlers['hx-views-manage-close'] = () => { openModal?.close?.(); };
    const saveRoomConfig = async (el, mutate, message) => {
      if (!isCustomHotel() || el?.disabled) return;
      const scope = cuStateId();
      const st = cuHydrate(cuDocument(cuState()));
      if (el) el.disabled = true;
      try {
        mutate(st);
        st.configUpdatedAt = cuStamp();
        await cuCommitDraft(st);
        if (scope !== cuStateId()) return;
        toast(message, { type: 'success' });
        openModal?.close?.();
        cuViewsAndCharsManager();
        rerender();
      } catch (error) {
        if (scope === cuStateId()) toast(error.message, { type:'error' });
      } finally { if (el) el.disabled = false; }
    };
    handlers['hx-view-add'] = async (el) => {
      const raw = String(el.closest('.kiwi-modal')?.querySelector('[data-hx-view-input]')?.value || '').trim().slice(0, 40);
      return saveRoomConfig(el, (st) => {
        if (!raw) throw new Error(trL({fr:'Indiquez un nom de vue',en:'Enter a view name',ar:'أدخل اسم الإطلالة'}));
        st.views = Array.isArray(st.views) ? st.views.slice() : DEFAULT_VIEWS.slice();
        if (st.views.some((v) => v.toLocaleLowerCase('fr') === raw.toLocaleLowerCase('fr'))) throw new Error(trL({fr:'Cette vue existe déjà',en:'This view already exists',ar:'هذه الإطلالة موجودة بالفعل'}));
        if (st.views.length >= 50) throw new Error(trL({fr:'Limite de 50 vues atteinte.',en:'Maximum of 50 views reached.',ar:'تم بلوغ الحد الأقصى البالغ 50 إطلالة.'}));
        st.views.push(raw);
      }, trL({fr:'Vue ajoutée',en:'View added',ar:'تمت إضافة الإطلالة'}));
    };
    handlers['hx-view-remove'] = async (el, arg) => saveRoomConfig(el, (st) => {
      const value = String(arg || '');
      if (Object.values(st.rooms).some((r) => r.view === value)) throw new Error(trL({fr:'Vue utilisée par des chambres. Modifiez ces chambres avant de la retirer.',en:'This view is used by rooms. Update those rooms before removing it.',ar:'تستخدم غرف هذه الإطلالة. عدّل الغرف قبل حذفها.'}));
      st.views = (st.views || []).filter((v) => v !== value);
    }, trL({fr:'Vue retirée',en:'View removed',ar:'تم حذف الإطلالة'}));
    handlers['hx-char-add'] = async (el) => {
      const raw = String(el.closest('.kiwi-modal')?.querySelector('[data-hx-char-input]')?.value || '').trim().slice(0, 50);
      return saveRoomConfig(el, (st) => {
        if (!raw) throw new Error(trL({fr:'Indiquez un nom d’équipement',en:'Enter an amenity name',ar:'أدخل اسم الميزة'}));
        if (cuAllCharacteristics().some((c) => cuCharLabel(c).toLocaleLowerCase('fr') === raw.toLocaleLowerCase('fr'))) throw new Error(trL({fr:'Cet équipement existe déjà',en:'This amenity already exists',ar:'هذه الميزة موجودة بالفعل'}));
        if ((st.customCharacteristics || []).length >= 50) throw new Error(trL({fr:'Limite de 50 équipements personnalisés atteinte.',en:'Maximum of 50 custom amenities reached.',ar:'تم بلوغ الحد الأقصى البالغ 50 ميزة مخصصة.'}));
        const id = el.__charIntentId || (el.__charIntentId = 'custom_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6));
        st.customCharacteristics = [...(st.customCharacteristics || []), {id, label:raw, labels:{fr:raw,en:raw,ar:raw}}];
      }, trL({fr:'Équipement ajouté',en:'Amenity added',ar:'تمت إضافة الميزة'}));
    };
    handlers['hx-char-remove'] = async (el, arg) => saveRoomConfig(el, (st) => {
      const id = String(arg || '');
      if (Object.values(st.rooms).some((r) => (r.characteristics || []).includes(id))) throw new Error(trL({fr:'Équipement utilisé par des chambres. Modifiez ces chambres avant de le retirer.',en:'This amenity is used by rooms. Update those rooms before removing it.',ar:'تستخدم غرف هذه الميزة. عدّل الغرف قبل حذفها.'}));
      st.customCharacteristics = (st.customCharacteristics || []).filter((c) => c.id !== id);
    }, trL({fr:'Équipement retiré',en:'Amenity removed',ar:'تم حذف الميزة'}));
    handlers['hx-room-delete-open'] = (el, arg) => {
      if (!isCustomHotel()) return;
      const n = parseInt(arg, 10);
      const st = cuState();
      const room = st.rooms[n];
      if (!room) return;
      if (st.folios[n] || ['occ', 'depart', 'arrivee'].includes(room.status)) {
        toast(tx('Suppression impossible'), { type: 'warn', desc: tx('Clôturez d’abord le séjour et le folio de cette chambre.') });
        return;
      }
      openModal?.close?.();
      const m = K().modal({
        tag: tx('SUPPRIMER UNE CHAMBRE'), title: tx('Supprimer la chambre {n} ?', { n }),
        desc: tx('Elle disparaîtra du plan, des disponibilités et du ménage.'), width: 440,
        body: `<p style="font-size:13px;line-height:1.55;color:var(--n-600);margin:0;">${tx('Cette action supprime {room}. Les ventes historiques restent intactes.', { room: `<b>${tx('Ch. {n}', { n })} · ${esc(room.typeName)}</b>` })}</p>
          <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:20px;"><button data-activation=write class="hx-btn warn" data-action="hx-room-delete" data-arg="${n}">${tx('Confirmer la suppression')}</button></div>`,
      });
      openModal = { el: m.el, close: m.close };
    };
    handlers['hx-room-delete'] = (el, arg) => {
      if (!isCustomHotel()) return;
      const n = parseInt(arg, 10);
      const st = cuState();
      const room = st.rooms[n];
      if (!room || st.folios[n]) return;
      const roomId = room.id;
      const now = cuStamp();
      Object.values(st.rooms).forEach((r) => {
        if (Array.isArray(r.connectingRoomIds) && r.connectingRoomIds.includes(roomId)) {
          r.connectingRoomIds = r.connectingRoomIds.filter((id) => id !== roomId);
          r.connectingMeta = { ...(r.connectingMeta || {}) };
          r.connectingMeta[roomId] = { at: now, linked: false };
          r.updatedAt = now;
        }
      });
      const tombstone = { ...room, updatedAt: now, deletedAt: now };
      const records = st.roomRecords || (st.roomRecords = []);
      const i = records.findIndex((r) => r && r.id === room.id);
      if (i >= 0) records[i] = tombstone; else records.push(tombstone);
      delete st.rooms[n];
      cuSelectedRooms.delete(String(room.id));
      cuSave(st);
      cuUpdateFloorsManagerModal();
      cuRefreshFloorSelectors();
      openModal?.close?.();
      toast(tx('Chambre {n} supprimée', { n }), { type: 'success', desc: tx('Le plan et les disponibilités ont été mis à jour.') });
      rerender();
    };
    handlers['hx-cb-rate-step'] = (el, arg) => {
      if (!isCustomHotel()) return;
      const st = cuState();
      st.baseRate = Math.max(150, (st.baseRate || 0) + parseInt(arg, 10));
      st.rateUpdatedAt = cuStamp();
      cuSave(st);
      rerender();
    };
    handlers['hx-cb-connect'] = (el, arg) => {
      if (arg === 'booking' || arg === 'airbnb' || arg === 'expedia' || arg === 'agoda') cuChannelEditor(String(arg));
    };
    handlers['hx-channel-close'] = () => { openModal?.close?.(); openModal=null; };
    handlers['hx-channel-guide'] = () => { if (isCustomHotel()) cuChannelGuide(); };
    handlers['hx-channel-sync'] = () => cuLoadChannels(true);
    handlers['hx-channel-save'] = async (el,arg) => {
      const root=el.closest('.kiwi-modal'), status=root?.querySelector('[data-hx-channel-status]');
      const label=String(root?.querySelector('[data-hx-channel-label]')?.value||'').trim(), roomId=String(root?.querySelector('[data-hx-channel-room]')?.value||''), feedUrl=String(root?.querySelector('[data-hx-channel-url]')?.value||'').trim();
      if(!label||!roomId||!feedUrl){if(status)status.textContent=tx('Complétez les trois champs.');return;}
      el.disabled=true;if(status)status.textContent=tx('Connexion et première vérification…');
      try{const res=await fetch('/api/hotel/channels',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'save',merchant:cuChannelMerchant(),channel:String(arg),label,roomId,feedUrl})}),body=await res.json().catch(()=>({}));if(!res.ok)throw new Error(body.error||'unavailable');cuChannelState.rows=body.channels||[];cuChannelState.loaded=true;openModal?.close?.();openModal=null;toast(tx('Calendrier connecté'),{type:'success',desc:tx('Les dates OTA sont maintenant dans le tape chart.')});rerender();}catch(error){if(status)status.textContent=error.message==='invalid-feed-url'?tx('Utilisez le lien iCal officiel fourni par la plateforme (voir « Où trouver le lien ? »).'):tx('Connexion impossible : {reason}',{reason:error.message});}finally{el.disabled=false;}
    };
    handlers['hx-channel-status'] = async (el,arg) => { const cut=String(arg).lastIndexOf(':'),id=String(arg).slice(0,cut),status=String(arg).slice(cut+1);el.disabled=true;try{const res=await fetch('/api/hotel/channels',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'status',merchant:cuChannelMerchant(),id,status})}),body=await res.json();if(res.ok){cuChannelState.rows=body.channels||[];rerender();}}finally{el.disabled=false;} };
    handlers['hx-channel-delete'] = async (el,id) => { if(!confirm(tx('Retirer ce calendrier ? Les séjours déjà importés restent dans l’historique.')))return;el.disabled=true;try{const res=await fetch('/api/hotel/channels',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({merchant:cuChannelMerchant(),id:String(id)})}),body=await res.json();if(res.ok){cuChannelState.rows=body.channels||[];rerender();}}finally{el.disabled=false;} };

    /* — folio — */
    handlers['hx-folio'] = (el, arg) => openFolio(parseInt(arg, 10));
    handlers['hx-room'] = (el, arg) => {
      const n = parseInt(arg, 10);
      if (cuSelectionMode) {
        const id = R()[n]?.id;
        if (!id) return;
        if (cuSelectedRooms.has(String(id))) {
          cuSelectedRooms.delete(String(id));
        } else {
          cuSelectedRooms.add(String(id));
        }
        rerender();
        return;
      }
      roomModal(n);
    };
    handlers['hx-add-charge'] = (el, arg) => {
      const body = el.closest('.kiwi-modal')?.querySelector('.kiwi-modal-body');
      if (body) body.innerHTML = addChargeHtml(parseInt(arg, 10));
    };
    handlers['hx-folio-back'] = (el, arg) => {
      const body = el.closest('.kiwi-modal')?.querySelector('.kiwi-modal-body');
      if (body) body.innerHTML = folioModalHtml(parseInt(arg, 10), true);
    };
    handlers['hx-post-charge'] = (el, arg) => {
      const [room, idx] = arg.split('|');
      const q = quickItems()[+idx];
      if (!q) return;
      postCharge(+room, q.label, q.amt, q.src);
      const body = el.closest('.kiwi-modal')?.querySelector('.kiwi-modal-body');
      if (body) body.innerHTML = folioModalHtml(+room, true);
    };
    handlers['hx-checkout-pay'] = (el, arg) => {
      const [roomArg, method] = String(arg || '').split('|');
      const room = parseInt(roomArg, 10);
      const f = F()[room];
      if (!f) return;
      const due = folioTotal(f) - folioPaid(f);
      if (isCustomHotel()) {
        if (!Number.isFinite(due) || due < 0 || (due > 0 && !recordSale(due, 'checkout-' + room + '-' + String(f.updatedAt || cuStamp()), 'Départ · Ch. ' + room, method))) {
          toast(tx('Clôture non enregistrée'), { type: 'warn', desc: tx('Le folio et la chambre sont conservés. Vérifiez la connexion et l’enregistrement du règlement avant de réessayer.') });
          return;
        }
        const closedAt = Math.max(cuStamp(), (+f.updatedAt || 0) + 1);
        const st = cuState();
        st.closedFolios = (st.closedFolios || []).filter((x) => +x.room !== room);
        st.closedFolios.push({ ...f, closedAt, updatedAt: closedAt, settlementAmount: due, settlementMethod: due > 0 ? method : null, settlementState: due > 0 ? 'queued' : 'previously-recorded' });
        /* le walk-in inscrit au registre y termine son séjour, comme une réservation.
           Le solde vient d'être encaissé ici même : le départ est confirmé (force),
           le serveur ne connaît pas encore le folio réglé et demanderait sinon
           confirmation d'un impayé qui n'existe plus. */
        if (f.stayId) cuStayStatus(f.stayId, 'completed', true);
        const r = R()[room];
        r.status = 'sale'; r.hk = 'dirty'; r.guest = null;
        r.meta = txk('Départ soldé · à remettre à blanc'); r.updatedAt = cuStamp();
        delete F()[room];
        cuSave();
        openModal?.close?.();
        toast(tx('Départ enregistré · Ch. {n}', { n: room }), { type: 'info', desc: due > 0 ? tx('Règlement ajouté à la file de synchronisation. Vérifiez sa confirmation dans les transactions.') : tx('Solde nul. Le dernier folio clôturé est conservé dans les données de la chambre.') });
        setTimeout(() => toast(tx('Ch. {n} → à remettre à blanc', { n: room }), { type: 'info', desc: tx('Marquez-la propre depuis Ménage pour la revendre ce soir.') }), 1400);
        rerender();
        return;
      }
      openModal?.close?.();
      toast('Folio Ch. ' + room + ' encaissé · ' + MAD(due), { type: 'success' });
      const dep = DEPARTURES.find((d) => d.room === room && !d.settled);
      if (dep) { dep.settled = true; dep.folio = folioTotal(f); }
      ROOMS[room].status = 'sale'; ROOMS[room].hk = 'dirty';
      ROOMS[room].meta = 'Départ soldé · ménage à assigner';
      if (!HK_QUEUE.find((q) => q.room === room)) HK_QUEUE.push({ room, st: 'attente', who: null, note: 'Départ soldé à l\'instant · arrivée 19h00', prio: false });
      delete FOLIOS[room];
      setTimeout(() => toast('Ch. ' + room + ' → file ménage', { type: 'info', desc: 'Arrivée Famille Lemoine prévue 19h00, remise à blanc prioritaire.' }), 1400);
      rerender();
    };

    /* — réception — */
    handlers['hx-checkin'] = (el, arg) => {
      const a = ARRIVALS.find((x) => x.id === arg);
      if (!a || a.done) return;
      a.done = true;
      const r = ROOMS[a.room];
      r.status = 'occ'; r.guest = a.guest; r.meta = SRC[a.src].label + ' · ' + a.nights + ' nuits · j1';
      if (!FOLIOS[a.room]) folio(a.room, a.guest, a.src, a.pax, a.nights, [
        { t: nowLabel(), label: 'Nuit 1 · ' + TYPES[r.type].name, qty: '×1', amt: TYPES[r.type].base, src: 'room' },
        { t: 'auto', label: `Taxe de séjour · ${a.pax} pers × 1 nuit`, qty: '', amt: TAX_PP_NIGHT * Math.min(a.pax, 2) , src: 'taxe' },
      ]);
      toast(a.guest + ' · Ch. ' + a.room + ', enregistrés', { type: 'success', desc: 'Folio ouvert · nuit 1 + taxe de séjour postées automatiquement.' });
      if (a.repeat) setTimeout(() => toast('Client fidèle reconnu', { type: 'info', desc: 'Marta & Diego Gómez · 2ᵉ séjour · préférences : suite étage haut, thé sans sucre.' }), 1300);
      rerender();
    };
    handlers['hx-checkout'] = (el, arg) => openFolio(parseInt(arg, 10));
    handlers['hx-walkin'] = () => {
      const custom = isCustomHotel();
      const free = Object.values(R()).filter((r) => r.status === 'libre');
      if (custom && free.length && !free.some((r) => roomTypeOf(r.n).base != null)) {
        toast(tx('Tarif non configuré'), { type: 'info', desc: tx('Définissez d’abord votre tarif de base dans Tarifs.') });
        return;
      }
      const m = K().modal({
        tag: 'WALK-IN', title: tx('Vendre une chambre ce soir'), desc: tx(free.length === 1 ? '{n} chambre libre et propre' : '{n} chambres libres et propres', { n: free.length, c: txn(free.length, 'chambre') }), width: 460,
        body: free.map((r) => `<div class="hx-fol-line" style="cursor:pointer;" data-action="hx-walkin-room" data-arg="${r.n}">
            <span><b style="font-family:var(--mono);">${tx('Ch. {n}', { n: r.n })}</b> · ${esc(roomTypeOf(r.n).name)}</span><span class="qt">${txn(1, 'nuit')}</span><span class="am">${roomTypeOf(r.n).base == null ? tx('Tarif à définir') : MAD(roomTypeOf(r.n).base)}</span>
          </div>`).join('') || `<div style="padding:14px;font-size:13px;color:var(--n-500);">${isCustomHotel() && totalRooms() === 0 ? tx('Aucune chambre configurée.') : tx('Complet ce soir, aucune chambre libre.')}</div>`,
      });
      openModal = { el: m.el, close: m.close };
    };
    handlers['hx-walkin-room'] = async (el, arg) => {
      const [roomArg, method] = String(arg || '').split('|');
      const n = parseInt(roomArg, 10);
      const r = R()[n];
      const cu = isCustomHotel();
      if (!r || r.status !== 'libre' || F()[n]) return;
      if (cu && roomTypeOf(n).base == null) {
        toast(tx('Tarif non configuré'), { type: 'info', desc: tx('Ajoutez un tarif à cette chambre ou définissez le tarif général dans Tarifs.') });
        return;
      }
      /* Le règlement d'avance se fait en espèces ou en carte : on le demande. */
      if (cu && method !== 'cash' && method !== 'card') {
        const body = el && el.closest ? el.closest('.kiwi-modal')?.querySelector('.kiwi-modal-body') : null;
        if (!body) return;
        const amount = MAD(roomTypeOf(n).base);
        body.innerHTML = `<div style="font-size:13px;color:var(--n-500);margin-bottom:10px;">${tx('Ch. {n} · {type} · 1 nuit', { n, type: esc(roomTypeOf(n).name) })}</div>
          <div style="font-weight:600;font-size:14px;margin-bottom:12px;">${tx('Comment le client règle-t-il ?')}</div>
          <div style="display:flex;gap:10px;flex-wrap:wrap;">
            <button class="hx-btn atlas" data-action="hx-walkin-room" data-arg="${n}|cash">${tx('Espèces · {amount}', { amount })}</button>
            <button class="hx-btn atlas" data-action="hx-walkin-room" data-arg="${n}|card">${tx('Carte · {amount}', { amount })}</button>
          </div>`;
        return;
      }
      if (cu && el && el.closest) { el.closest('.kiwi-modal-body')?.querySelectorAll('button').forEach((b) => { b.disabled = true; }); }
      const guest = cu ? tx('Client sans nom') : 'Walk-in · M. Idrissi';
      const rate = roomTypeOf(n).base;
      const stamp = cuStamp();
      /* Le séjour entre au registre AVANT que la chambre passe occupée : le
         serveur refuserait une chambre que le plan poussé dit déjà prise. */
      const stay = cu ? await cuRegisterWalkin(n, guest, 'walkin-' + n + '-' + stamp) : null;
      if (cu && (R()[n] !== r || r.status !== 'libre' || F()[n])) return;
      if (cu && !recordSale(rate, 'walkin-' + n + '-' + stamp, 'Walk-in · Ch. ' + n, method)) {
        if (stay) cuStayCancel(stay.id);
        toast(tx('Walk-in non enregistré'), { type: 'warn', desc: tx('La chambre reste libre. L’enregistrement du règlement est indisponible.') });
        return;
      }
      r.status = 'occ'; r.guest = guest; r.meta = txk('Walk-in · 1 nuit · réglé d\'avance');
      F()[n] = { room: n, guest, src: 'walkin', pax: 1, nights: 1, stayId: stay ? stay.id : null, lines: [
        { t: nowLabel(), label: tx('Nuit 1 · {type}', { type: roomTypeOf(n).name }), qty: '×1', amt: rate, src: 'room', paid: true },
        { t: 'auto', label: tx('Taxe de séjour · 1 pers × 1 nuit'), qty: '', amt: TAX_PP_NIGHT, src: 'taxe' },
      ], updatedAt: stamp };
      if (cu) { r.updatedAt = stamp; cuState().sold += 1; cuSave(); }
      openModal?.close?.();
      if (cu && !stay) setTimeout(() => toast(tx('Séjour non inscrit au registre'), { type: 'warn', desc: tx('La vente est enregistrée. L’occupation de l’Accueil comptera cette chambre une fois la connexion revenue et le séjour saisi dans Séjours.') }), 1400);
      toast(tx('Ch. {n} vendue · {amount}', { n, amount: MAD(rate) }), { type: 'success', desc: tx('Walk-in enregistré · occupation ce soir {a} / {b}', { a: counts().occToNight, b: totalRooms() }) + (cu ? ' · ' + tx('vente réelle au compteur.') : '.') });
      rerender();
    };

    /* — ménage — */
    handlers['hx-hk-assign'] = (el, arg) => {
      const room = parseInt(arg, 10);
      const m = K().modal({
        tag: 'MÉNAGE', title: 'Assigner la chambre ' + room, desc: 'La remise passe « en file » pour la personne choisie.', width: 440,
        body: HK_STAFF.filter((s) => s.id !== 'khadija').map((s) => `<div class="hx-hk" style="cursor:pointer;" data-action="hx-hk-assign-to" data-arg="${room}|${s.name.split(' ')[0]} ${s.name.split(' ')[1][0]}.">
            <span class="hx-av ${s.cls}">${s.av}</span>
            <div><div style="font-weight:600;font-size:13px;">${s.name}</div><div style="font-size:11.5px;color:var(--n-500);">${s.today}</div></div>
            <span class="hx-pill neutral">ASSIGNER</span>
          </div>`).join(''),
      });
      openModal = { el: m.el, close: m.close };
    };
    handlers['hx-hk-assign-to'] = (el, arg) => {
      const [room, who] = arg.split('|');
      const q = HK_QUEUE.find((x) => x.room === +room);
      if (q) { q.who = who; q.st = 'file'; }
      openModal?.close?.();
      toast('Ch. ' + room + ' assignée à ' + who, { type: 'success', desc: 'Notifiée sur son téléphone · la file ménage est à jour.' });
      rerender();
    };
    handlers['hx-hk-done'] = (el, arg) => {
      const room = parseInt(arg, 10);
      if (isCustomHotel()) {
        const r = R()[room];
        if (r) { r.status = 'libre'; r.hk = 'clean'; r.guest = null; r.meta = txk('Libre · propre'); r.updatedAt = cuStamp(); cuSave(); }
        openModal?.close?.();
        toast(tx('Ch. {n} remise à blanc', { n: room }), { type: 'success', desc: tx('Propre et relouable, visible « libre » sur le plan des chambres.') });
        rerender();
        return;
      }
      const i = HK_QUEUE.findIndex((x) => x.room === room);
      if (i >= 0) {
        const it = HK_QUEUE.splice(i, 1)[0];
        HK_DONE.unshift({ room, at: nowLabel(), by: it.who || '·', inspected: false, note: 'En attente d\'inspection · Khadija notifiée' });
        const r = ROOMS[room];
        const arrival = ARRIVALS.find((a) => a.room === room && !a.done);
        r.status = arrival ? 'arrivee' : 'libre';
        r.hk = 'inspect';
        r.meta = arrival ? SRC[arrival.src].label + ' · ETA ' + arrival.t : 'Libre ce soir';
        if (arrival) r.guest = arrival.guest;
      }
      toast('Ch. ' + room + ' remise à blanc', { type: 'success', desc: 'Inspection gouvernante demandée · tourné 38 min (cible 35).' });
      rerender();
    };
    handlers['hx-hk-open'] = () => { openModal?.close?.(); handlers['nav-menage'](); };
    handlers['hx-hs-fix'] = (el, arg) => {
      const n = parseInt(arg, 10);
      ROOMS[n].status = 'sale'; ROOMS[n].meta = 'Réparée · remise à blanc avant relouage'; ROOMS[n].hk = 'dirty';
      HK_QUEUE.push({ room: n, st: 'attente', who: null, note: 'Sortie de hors-service · grand ménage', prio: false });
      openModal?.close?.();
      toast('Ch. ' + n + ' réparée', { type: 'success', desc: 'Ajoutée à la file ménage pour remise à blanc complète.' });
      rerender();
    };

    /* — tarifs — */
    handlers['hx-apply-ai'] = () => {
      aiApplied = true;
      Object.values(RATES).forEach((r) => r.ai.forEach((v, i) => { if (v) r.base[i] = v; }));
      toast('Suggestions IA appliquées', { type: 'success', desc: '+4 280 MAD de revenu projeté sur 7 jours · weekend 13-14 revalorisé.' });
      rerender();
    };
    handlers['hx-rate-cell'] = (el, arg) => {
      const [ty, di] = arg.split('|');
      const r = RATES[ty];
      const m = K().modal({
        tag: 'TARIF', title: TYPES[ty].name + ' · ' + RATE_DAYS[+di], desc: 'Le tarif s\'applique aux nouvelles réservations.', width: 400,
        body: `<div style="display:flex;align-items:center;justify-content:center;gap:18px;padding:8px 0 4px;">
            <button class="hx-btn ghost" data-action="hx-rate-step" data-arg="${ty}|${di}|-50">−50</button>
            <div style="font-family:var(--mono);font-size:28px;font-weight:600;" data-hx-rate>${fmt(r.base[+di])}</div>
            <button class="hx-btn ghost" data-action="hx-rate-step" data-arg="${ty}|${di}|50">+50</button>
          </div>
          <div style="text-align:center;font-size:11.5px;color:var(--n-500);">${r.ai[+di] ? 'Suggestion IA : ' + fmt(r.ai[+di]) + ' MAD' : 'Pas de suggestion IA ce jour'}</div>
          <div style="display:flex;justify-content:flex-end;margin-top:16px;"><button data-activation=write class="hx-btn atlas" data-action="hx-rate-save" data-arg="${ty}|${di}">Enregistrer</button></div>`,
      });
      openModal = { el: m.el, close: m.close };
    };
    handlers['hx-rate-step'] = (el, arg) => {
      const [ty, di, step] = arg.split('|');
      RATES[ty].base[+di] = Math.max(300, RATES[ty].base[+di] + +step);
      const v = el.closest('.kiwi-modal')?.querySelector('[data-hx-rate]');
      if (v) v.textContent = fmt(RATES[ty].base[+di]);
    };
    handlers['hx-rate-save'] = (el, arg) => {
      const [ty, di] = arg.split('|');
      openModal?.close?.();
      toast('Tarif mis à jour', { type: 'success', desc: TYPES[ty].name + ' · ' + RATE_DAYS[+di] + ' → ' + MAD(RATES[ty].base[+di]) + ' / nuit.' });
      rerender();
    };

    /* — divers — */
    handlers['hx-stay'] = (el, arg) => {
      const [r, g, n, src] = arg.split('|');
      const fee = SRC[src].fee;
      const rev = TYPES[typeOf(+r)].base * +n;
      K().toast(g + ' · Ch. ' + r, { type: 'info', desc: `${n} nuit${+n > 1 ? 's' : ''} · ${SRC[src].label} · ~${MAD(rev)}${fee ? ' · commission −' + MAD(rev * fee) : ' · 0 commission'}` });
    };
    handlers['hx-guest'] = (el, arg) => guestModal(arg);
    handlers['hx-guest-direct'] = () => { openModal?.close?.(); toast('Offre directe envoyée', { type: 'success', desc: 'Lien de réservation direct −10 % envoyé par WhatsApp · 0 % commission.' }); };
    handlers['hx-guest-msg'] = () => { openModal?.close?.(); toast('Conversation WhatsApp ouverte', { type: 'info', desc: 'Modèle « préparation de séjour » prérempli.' }); };
    handlers['hx-direct-push'] = () => toast('Relance directe activée', { type: 'success', desc: '22 clients fidèles ciblés · jusqu\'à 4 100 MAD de commission économisée / mois.' });
    handlers['hx-noshow-secure'] = (el, arg) => toast('Prépaiement demandé · ' + arg, { type: 'success', desc: 'Lien de paiement Kiwi envoyé · la réservation passe « garantie » au règlement.' });
    handlers['hx-taxe-export'] = () => toast('Registre taxe de séjour exporté', { type: 'success', desc: 'CSV juin 2026 · 14 350 MAD · prêt pour la déclaration communale.' });

    /* — LE MOMENT DÉMO · thé + hammam → folio — */
    handlers['hx-demo-folio'] = () => {
      openModal?.close?.();
      toast('Restaurant · table terrasse', { type: 'info', desc: 'Thé à la menthe ×2, le serveur encaisse sur la chambre 7.' });
      setTimeout(() => postCharge(7, 'Thé à la menthe', 60, 'resto', true), 900);
      setTimeout(() => K().toast('Thé à la menthe ×2 → folio Ch. 7', { type: 'success', desc: 'Restaurant · POS · 60 MAD postés sur la note de chambre.' }), 950);
      setTimeout(() => postCharge(7, 'Rituel hammam + massage duo · demain 17h', 980, 'spa', true), 2100);
      setTimeout(() => K().toast('Hammam réservé → folio Ch. 7', { type: 'success', desc: 'Rituel duo demain 17h · 980 MAD postés sur la même note.' }), 2150);
      setTimeout(() => {
        openFolio(7, true);
        setTimeout(() => K().toast('Une seule note. Un seul système.', { type: 'info', desc: 'Chambres + restaurant + hammam + taxe de séjour, encaissés en un geste au départ.' }), 800);
      }, 3300);
    };
  }
