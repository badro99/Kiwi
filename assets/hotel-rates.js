/* Hotel · tarifs et performance. Corps recopiés sans modification. */
window.__kiwiHotelInternal.define('rates', (scope) => {
  'use strict';
  const { HX_TARIFF_SYNC_COPY, MAD, cuAwaitTariffAck, cuBoards, cuCommercialError, cuCommercialState, cuDraftMoney, cuKinds, cuLoadCommercial, cuLoadPerformance, cuMerchantSlug, cuPerfByScope, cuState, cuStayScope, cuStrip, cuTypes, esc, fmt, hxLocale, ltr, tx, txn } = scope;
  function cuPerfState() {
    const scope = cuStayScope();
    if (!cuPerfByScope.has(scope)) cuPerfByScope.set(scope, { past: null, ahead: null, error: '', loading: false, at: 0 });
    return cuPerfByScope.get(scope);
  }

  function cuPerformanceBlock() {
    cuLoadPerformance();
    const st = cuPerfState(), p = st.past, a = st.ahead;
    const pct = (v) => (v == null ? '·' : ltr((window.KiwiNumber?.number(v, 1) ?? String(v).replace('.', ',')) + ' <small>%</small>'));
    const money = (v) => (v == null ? '·' : ltr(fmt(v) + ' <small>MAD</small>'));
    const head = `<div class="hx-h"><span class="t">${tx('Performance réelle')}</span><span class="s">${tx('calculée sur vos séjours')}</span></div>`;
    if (!p || !a) {
      return `${head}
        <div class="block" style="padding:16px 18px;"><p style="margin:0;font-size:13px;color:var(--n-500);">${st.error ? tx('Calcul indisponible pour le moment. Aucun chiffre n’est estimé : le registre des séjours est nécessaire.') : tx('Lecture des séjours…')}</p></div>`;
    }
    if (!p.rooms || !p.rooms.total) {
      return `${head}
        <div class="block" style="padding:16px 18px;"><p style="margin:0;font-size:13px;color:var(--n-500);">${tx('Déclarez vos chambres dans le plan : l’occupation se calcule sur le nombre de chambres que vous vendez.')}</p></div>`;
    }
    const maxNights = Math.max(p.rooms.total, ...a.perDay.map((d) => d.nights));
    const bars = a.perDay.map((d) => {
      const h = Math.max(2, Math.round(d.nights / maxNights * 64));
      const [, mm, dd] = d.date.split('-');
      return `<div title="${esc(tx(d.nights === 1 ? '{date} · {n} chambre vendue sur {total}' : '{date} · {n} chambres vendues sur {total}', { date: dd + '/' + mm, n: d.nights, c: txn(d.nights, 'chambre'), total: p.rooms.total }))}" style="flex:1;min-width:6px;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;gap:3px;">
        <div style="width:100%;height:${h}px;border-radius:3px;background:${d.nights ? 'var(--atlas)' : 'var(--n-200)'};"></div>
        <span style="font-size:9px;color:var(--n-500);font-family:var(--mono);">${dd}</span></div>`;
    }).join('');
    const unpriced = p.unpricedNights + a.unpricedNights;
    const oos = p.rooms.outOfService;
    return `<div class="hx-h"><span class="t">${tx('Performance réelle')}</span><span class="s">${tx('30 dernières nuits · séjours confirmés, en maison et terminés · TTC')}</span></div>
      <div class="hx-strip">
        <div class="hx-kpi"><div class="l">${tx('Occupation')}</div><div class="v">${pct(p.occupancyPct)}</div><div class="d">${tx(p.nights === 1 ? '{n} nuitée vendue sur {total}' : '{n} nuitées vendues sur {total}', { n: p.nights, total: fmt(p.availableNights) })}</div></div>
        <div class="hx-kpi"><div class="l">${tx('ADR · prix moyen / nuit')}</div><div class="v">${money(p.adr)}</div><div class="d">${p.adr == null ? tx('aucune nuit chiffrée') : tx('revenu ÷ nuitées vendues')}</div></div>
        <div class="hx-kpi"><div class="l">RevPAR</div><div class="v">${money(p.revpar)}</div><div class="d">${tx('revenu ÷ nuitées disponibles')}</div></div>
        <div class="hx-kpi"><div class="l">${tx('Revenu hébergement')}</div><div class="v">${money(p.revenue)}</div><div class="d">${tx('logement + formule repas')}</div></div>
      </div>
      <div class="hx-h" style="margin-top:18px;"><span class="t">${tx('Occupation à venir')}</span><span class="s">${tx('30 prochaines nuits · {pct} réservées sur {rooms}', { pct: pct(a.occupancyPct), rooms: txn(p.rooms.total, 'chambre') })}</span></div>
      <div class="block" style="padding:14px 16px 10px;">
        <div style="display:flex;gap:3px;align-items:flex-end;height:84px;">${bars}</div>
        <p style="margin:10px 0 0;font-size:11.5px;color:var(--n-500);line-height:1.5;">${tx('Une barre = les chambres déjà vendues cette nuit-là, jour d’arrivée compris, jour de départ exclu. Ce n’est pas une prévision : ce sont vos réservations.')}${oos ? ' ' + tx(oos === 1 ? '{n} chambre hors-service reste dans l’inventaire.' : '{n} chambres hors-service restent dans l’inventaire.', { n: oos, c: txn(oos, 'chambre') }) : ''}${unpriced ? ' ' + tx(unpriced === 1 ? '{n} nuitée sans prix est exclue de l’ADR et du revenu.' : '{n} nuitées sans prix sont exclues de l’ADR et du revenu.', { n: unpriced }) : ''}</p>
      </div>`;
  }

  function cuTarifsBody() {
    const st = cuState();
    const typeCards = cuTypes().map((t) => {
      const roomCount = Object.values(st.rooms).filter((r) => r.typeId === t.id).length;
      return `<button class="hx-type-card" data-action="hx-room-type-edit" data-arg="${esc(t.id)}">
        <span class="hx-type-icon">${esc(t.name.slice(0, 1).toUpperCase())}</span>
        <span class="hx-type-copy"><b>${esc(t.name)}</b><small>${txn(roomCount, 'chambre')}</small></span>
        <span class="hx-type-rate">${t.rate == null ? (st.baseRate == null ? tx('À définir') : MAD(st.baseRate)) : MAD(t.rate)}<small>${t.rate == null ? tx('tarif général') : tx('par nuit')}</small></span>
        <span class="hx-type-arrow">›</span>
      </button>`;
    }).join('');
    return `<div class="hx-page">
      ${cuStrip()}
      <div class="hx-h"><span class="t">${tx('Tarif général')}</span><span class="s">${tx('utilisé uniquement par les types sans tarif propre')}</span><button class="hx-btn ghost" data-action="hx-commercial">${tx('Contrats agences & sociétés')}</button></div>
      <div class="block" style="padding:22px 14px;display:flex;align-items:center;justify-content:center;gap:20px;" dir="ltr">
        <button class="hx-btn ghost" data-action="hx-cb-rate-step" data-arg="-50">−50</button>
        <div style="font-family:var(--mono);font-size:30px;font-weight:600;">${st.baseRate == null ? '·' : fmt(st.baseRate)} <span style="font-size:13px;color:var(--n-500);">${tx('MAD / nuit')}</span></div>
        <button class="hx-btn ghost" data-action="hx-cb-rate-step" data-arg="50">+50</button>
      </div>
      <div class="hx-h" style="margin-top:18px;"><span class="t">${tx('Tarifs par type')}</span><span class="s">${tx('un changement met à jour toutes les chambres concernées')}</span><button class="hx-btn atlas" data-action="hx-room-type-new">+ ${tx('Nouveau type')}</button></div>
      <div class="hx-type-list">${typeCards}</div>
      <div style="margin-top:18px;">${cuPerformanceBlock()}</div>
    </div>`;
  }

  function cuStayQuoteSignature(form) {
    return JSON.stringify(['accountId', 'roomTypeId', 'checkIn', 'checkOut', 'partySize', 'board', 'priceMode'].map(k => form.elements[k]?.value || ''));
  }

  function cuSetTariffSync(form, state, render = true) {
    if (!form) return;
    const blocked = state === 'pending' || state === 'failed' || state === 'offline';
    form.__hxTariffSyncState = state || 'ready';
    const submit = form.querySelector('[type="submit"]');
    if (submit && blocked) {
      submit.setAttribute('data-hx-tariff-disabled', '');
      submit.disabled = true;
    } else if (submit && submit.hasAttribute('data-hx-tariff-disabled')) {
      submit.removeAttribute('data-hx-tariff-disabled');
      if (!form.__hxSubmitting) submit.disabled = false;
    }
    if (!render) return;
    const host = form.querySelector('[data-hx-tariff-sync]');
    if (!host) return;
    if (state === 'ready' || !state) { host.innerHTML = ''; return; }
    if (state === 'pending') { host.innerHTML = `<p class="hx-tariff-pending">${HX_TARIFF_SYNC_COPY.pending}</p>`; return; }
    const text = state === 'offline' ? HX_TARIFF_SYNC_COPY.offline : HX_TARIFF_SYNC_COPY.failed;
    host.innerHTML = `<div class="hx-tariff-sync-fail"><p class="hx-warn-note" style="color:var(--warn-ink);background:var(--warn-soft);padding:8px 12px;border-radius:8px;font-size:12px;">${text}</p><button type="button" class="hx-btn ghost" data-action="hx-tariff-retry">${HX_TARIFF_SYNC_COPY.retry}</button></div>`;
  }

  async function cuTariffSyncCycle(form, pendingDelayMs) {
    if (!form || !form.isConnected) return;
    const run = (form.__hxTariffSyncRun || 0) + 1;
    form.__hxTariffSyncRun = run;
    if (form.__hxTariffRetryTimer) clearTimeout(form.__hxTariffRetryTimer);
    form.__hxTariffRetryTimer = 0;
    if (form.__hxTariffOnlineHandler) {
      window.removeEventListener('online', form.__hxTariffOnlineHandler);
      form.__hxTariffOnlineHandler = null;
    }
    let done = false, timer = 0;
    // Block immediately. Only the cosmetic pending line may wait briefly, so
    // the stacked type editor can close without a flash on very fast saves.
    cuSetTariffSync(form, 'pending', !pendingDelayMs);
    if (pendingDelayMs) timer = setTimeout(() => {
      if (!done && form.isConnected && form.__hxTariffSyncRun === run) cuSetTariffSync(form, 'pending');
    }, pendingDelayMs);
    const res = await cuAwaitTariffAck(form);
    done = true;
    if (timer) clearTimeout(timer);
    if (!form.isConnected || form.__hxTariffSyncRun !== run || res.cancelled) return;
    if (res.ok) {
      cuSetTariffSync(form, 'ready');
      form.dispatchEvent(new Event('hx-refresh-direct'));
    } else if (res.pending) {
      cuSetTariffSync(form, 'pending');
      form.__hxTariffRetryTimer = setTimeout(() => {
        if (form.isConnected && form.__hxTariffSyncState === 'pending') cuTariffSyncCycle(form, 0);
      }, 800);
    } else {
      cuSetTariffSync(form, res.offline ? 'offline' : 'failed');
      if (res.offline) {
        form.__hxTariffOnlineHandler = () => {
          form.__hxTariffOnlineHandler = null;
          cuTariffRetry(form);
        };
        window.addEventListener('online', form.__hxTariffOnlineHandler, { once: true });
      }
    }
  }

  async function cuTariffRetry(form) {
    cuTariffSyncCycle(form, 0);
  }

  function cuDirectQuote(input) {
    const { typeRate = null, baseRate = null, boardRates = null, board = 'room_only', checkIn = '', checkOut = '', occupancy = 1 } = input || {};
    const roomRate = typeRate == null ? baseRate : typeRate;
    if (roomRate == null || !Number.isFinite(+roomRate) || +roomRate < 0) return { ok: false, missing: ['room'] };
    const start = Date.parse(checkIn + 'T12:00:00Z'), end = Date.parse(checkOut + 'T12:00:00Z');
    const nights = Math.round((end - start) / 86400000);
    if (!Number.isFinite(nights) || nights < 1 || nights > 365) return { ok: false, missing: ['dates'] };
    let meal = 0;
    if (board !== 'room_only') {
      const sup = boardRates && typeof boardRates === 'object' ? boardRates[board] : null;
      if (sup == null || sup === '' || !Number.isFinite(+sup) || +sup < 0) return { ok: false, missing: ['meal'] };
      meal = +sup;
    }
    const roomCents = Math.round(+roomRate * 100);
    const mealCents = Math.round(meal * 100);
    const qty = Math.max(1, Math.round(Number(occupancy) || 1));
    const rows = [];
    for (let i = 0; i < nights; i++) {
      const d = new Date(start + i * 86400000).toISOString().slice(0, 10);
      rows.push({ date: d, roomCents, mealCents, quantity: qty, amountCents: roomCents + mealCents * qty });
    }
    return { ok: true, rows, totalCents: rows.reduce((s, r) => s + r.amountCents, 0), nights, roomCents, mealCents };
  }

  function cuQuoteRows(q) {
    const period = q.contract?.from && q.contract?.to ? `${esc(q.contract.from)} → ${esc(q.contract.to)}` : '';
    const occupancyLabel = ['', tx('Single · 1 personne'), tx('Double · 2 personnes'), tx('Triple · 3 personnes')][q.contract?.occupancy] || (q.contract?.occupancy ? tx('{n} pers.', { n: q.contract.occupancy }) : '');
    const accountName = q.account?.name || '';
    const boardLabel = cuBoards[q.contract?.board] || q.contract?.board || '';
    return `<div class="hx-simulation-notice"><strong>${tx('Simulation contractuelle informative')}</strong> · ${tx('Aucune réservation ni blocage créé à cette étape.')}${accountName ? `<div>${tx('Compte :')} <b>${esc(accountName)}</b>${q.account?.paymentDays ? ` · ${tx('Échéance {n} j', { n: q.account.paymentDays })}` : ''}</div>` : ''}${occupancyLabel ? `<div>${tx('Formule :')} ${esc(occupancyLabel)} · ${esc(boardLabel)}${period ? ` (${ltr(period)})` : ''}</div>` : ''}</div><div class="hx-quote-lines">${q.rows.map(r => `<div><span>${ltr(esc(r.date))} · ${esc(r.label)}</span><span>${ltr(`${r.quantity} × ${cuDraftMoney(r.unitCents)} = <b>${cuDraftMoney(r.amountCents)} MAD</b>`)}</span></div>`).join('')}</div><p class="hx-total-band"><span>${tx('Total formule :')} </span><b>${ltr(cuDraftMoney(q.totalCents) + ' MAD')} ${q.taxBasis === 'exclusive' ? tx('HT') : tx('TTC')}</b></p><small>${tx('Simulation de séjour, pas une facture. Taxes locales, extras et réductions enfants non calculés ici.')}</small>`;
  }

  async function cuWireStayCommercial(form, booking) {
    const box = form.querySelector('[data-hx-commercial-stay]');
    if (!box) return;
    const scope = cuStayScope();
    await cuLoadCommercial();
    if (scope !== cuStayScope() || form.isConnected === false) return;
    const st = cuCommercialState();
    if (!st.loaded || st.error) { box.innerHTML = `<legend>${tx('Compte & formule')}</legend><p>${esc(st.error || tx('Répertoire indisponible. Les informations existantes sont conservées.'))}</p>`; form.__commercialFailed = true; return; }
    // A direct-priced booking without a commercial block (empty booker at
    // save time nulls it) still owns its formula via the pricing snapshot:
    // reopening must show it, never silently fall back to room-only.
    const c = { ...(booking?.commercial || {}) };
    if (!c.board && booking?.pricing?.board) c.board = booking.pricing.board;
    const hasAccount = !!c.accountId;
    box.innerHTML = `<legend>${tx('Compte & formule de réservation')}</legend><div class="hx-room-form hx-type-form"><label><span>${tx('Compte à facturer')}</span><select name="accountId"><option value="">${tx('Voyageur · sans compte commercial')}</option>${st.accounts.filter(a => !a.archived || a.id === c.accountId).map(a => `<option value="${esc(a.id)}" ${a.id === c.accountId ? 'selected' : ''}>${esc(cuKinds[a.kind] + ' · ' + a.name)}${a.archived ? ' ' + tx('(archivé)') : ''}</option>`).join('')}</select></label><label><span>${tx('Mode tarifaire')}</span><select name="priceMode"><option value="catalogue" ${c.quoted ? 'disabled' : ''}>${tx('Tarif maison · sans compte')}</option><option value="contract" ${c.quoted ? 'selected' : ''} ${!hasAccount ? 'disabled' : ''}>${tx('Contrat du compte')}</option></select></label><label><span>${tx('Réservant / interlocuteur')}</span><input name="booker" maxlength="160" value="${esc(c.booker || '')}"></label><label><span>${tx('Voucher / bon de commande')}</span><input name="voucher" dir="ltr" maxlength="100" value="${esc(c.voucher || '')}"></label><label><span>${tx('Formule')}</span><select name="board">${Object.entries(cuBoards).map(([v,l]) => `<option value="${v}" ${v === c.board ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div><p data-hx-commercial-help></p><button type="button" class="hx-btn ghost" data-hx-quote>${tx('Simuler le contrat')}</button><div data-hx-quote-result role="status">${c.quote ? `<p>${tx('Tarif précédemment accepté et conservé :')}</p>` + cuQuoteRows(c.quote) : ''}</div>
    <div data-hx-direct-panel hidden><div data-hx-direct-breakdown role="status"></div>
      <div data-hx-agreed-box hidden style="margin-top:8px;padding:10px;border:1px dashed var(--n-200);border-radius:8px;">
        <b style="font-size:12px;">${tx('Prix convenu avec le client')}</b>
        <p style="font-size:11.5px;color:var(--n-600);margin:4px 0;">${tx('Uniquement parce qu’aucun tarif configuré ne couvre cette demande. Le montant, le motif et votre identité seront enregistrés sur la réservation.')}</p>
        <div data-hx-agreed-by style="font-size:11.5px;color:var(--n-600);"></div>
        <label><span>${tx('Montant total TTC convenu · MAD')}</span><input data-hx-agreed-amount dir="ltr" inputmode="decimal" placeholder="${tx('Ex. 950')}"></label>
        <label><span>${tx('Motif')}</span><input data-hx-agreed-reason maxlength="280" placeholder="${tx('Ex. geste commercial, dernière chambre')}"></label>
        <label class="hx-check-row"><input type="checkbox" data-hx-agreed-confirm> <span>${tx('Je confirme ce prix convenu pour ce séjour.')}</span></label>
      </div>
        <label class="hx-check-row" data-hx-reprice-wrap hidden><input type="checkbox" data-hx-reprice-confirm> <span data-hx-reprice-label></span></label>
        <div data-hx-tariff-sync role="status"></div>
    </div>`;
    if (booking && ['completed', 'cancelled', 'no_show'].includes(booking.status)) { box.disabled = true; return; }
    form.__commercialReady = true;
    const previewButton = box.querySelector('[data-hx-quote]'), result = box.querySelector('[data-hx-quote-result]');
    // Mode switch (defect: ordinary travelers need no account). Contract UI
    // only makes sense with an account; without one the stay is priced from
    // the hotel's own type configuration, shown live below.
    const syncCommercialMode = () => {
      const noAccount = !form.elements.accountId?.value;
      const priceModeEl = form.elements.priceMode;
      const contractOpt = (priceModeEl && typeof priceModeEl.querySelector === 'function')
        ? priceModeEl.querySelector('option[value="contract"]')
        : null;
      if (contractOpt) contractOpt.disabled = noAccount;
      if (noAccount && form.elements.priceMode) form.elements.priceMode.value = 'catalogue';
      if (previewButton) previewButton.hidden = noAccount;
      const help = box.querySelector('[data-hx-commercial-help]');
      if (help) {
        help.textContent = noAccount
          ? tx('Sans compte : séjour chiffré au tarif maison (logement + formule, configurés dans Types de chambres). Aucun contrat requis.')
          : tx('Avec compte : simulez le contrat et acceptez le prix avant confirmation. Occupation totale de 1 à 3 personnes, sans calcul enfant automatique.');
      }
      updateDirectQuote();
    };
    // Pricing inputs captured at open (defects 1+3): guest, contact, note,
    // status and traveler-detail edits must preserve the accepted snapshot
    // without renegotiation. Only these seven can move money.
    const PRICE_INPUTS = ['roomTypeId', 'checkIn', 'checkOut', 'partySize', 'board', 'accountId', 'priceMode'];
    const readPriceInputs = () => {
      const o = {};
      PRICE_INPUTS.forEach(k => { o[k] = String(form.elements[k]?.value ?? ''); });
      return o;
    };
    const pricingBaseline = booking ? readPriceInputs() : null;
    const storedDirect = (booking && booking.pricing && booking.pricing.kind === 'direct') ? booking.pricing : null;
    const storedQuoted = !!(booking && booking.commercial && booking.commercial.quoted);
    const hasStoredPricing = !!(storedDirect || storedQuoted);
    const pricingInputsChanged = () => {
      if (!booking || !pricingBaseline) return true;
      return PRICE_INPUTS.some(k => String(form.elements[k]?.value ?? '') !== String(pricingBaseline[k] ?? ''));
    };
    const storedAgreed = (storedDirect && storedDirect.agreed) ? storedDirect : null;
    const agreedInputsNow = () => ({
      amount: String(box.querySelector('[data-hx-agreed-amount]')?.value || '').trim().replace(',', '.'),
      reason: String(box.querySelector('[data-hx-agreed-reason]')?.value || '').trim(),
      checked: !!box.querySelector('[data-hx-agreed-confirm]')?.checked,
    });
    const agreedFieldsDiffer = () => {
      if (!storedAgreed) return false;
      const cur = agreedInputsNow();
      const sameAmount = Math.round(Number(cur.amount) * 100) === Number(storedAgreed.totalCents || 0);
      return !(cur.amount !== '' && sameAmount && cur.reason === String(storedAgreed.reason || ''));
    };
    const updateDirectQuote = () => {
      const panel = box.querySelector('[data-hx-direct-panel]');
      if (!panel) return;
      const noAccount = !form.elements.accountId?.value;
      const day = form.elements.stayMode?.value === 'day_use';
      if (!noAccount || day) { panel.hidden = true; form.__directQuote = null; return; }
      panel.hidden = false;
      const changed = pricingInputsChanged();
      // Pristine edit on accepted direct pricing: show the SAVED snapshot,
      // never a live recompute that a catalogue change could have moved.
      if (booking && storedDirect && !changed && !agreedFieldsDiffer()) {
        const sp = storedDirect;
        form.__directQuote = null;
        const area = box.querySelector('[data-hx-direct-breakdown]');
        if (area) {
          const when = Number(sp.acceptedAt) > 0 ? new Date(sp.acceptedAt).toLocaleDateString(hxLocale()) : '';
          const rows = (sp.rows || []).map(r => `<div><span>${ltr(esc(r.date))} · ${tx('Logement {amount}', { amount: ltr(cuDraftMoney(Number(r.roomCents || 0))) })}${Number(r.mealCents || 0) ? ` + ${tx('repas {amount} ({n} pers.)', { amount: ltr(cuDraftMoney((Number(r.mealCents || 0) * Number(r.quantity || 1)))), n: Number(r.quantity || 1) })}` : ''}</span><span><b>${ltr(cuDraftMoney(Number(r.amountCents || 0)) + ' MAD')}</b></span></div>`).join('');
          area.innerHTML = `<div class="hx-quote-lines">${rows}</div><p class="hx-total-band"><span>${tx('Total séjour :')} </span><b>${ltr(cuDraftMoney(Number(sp.totalCents || 0)) + ' MAD')} ${tx('TTC')}</b></p>`
            + (sp.agreed
              ? `<small>${tx('Prix convenu accepté')}${when ? ' ' + tx('le {date}', { date: esc(when) }) : ''} · ${tx('motif :')} ${esc(sp.reason || '·')}${sp.agreedBy ? ` · ${tx('par {who}', { who: esc(((sp.agreedBy.role || '') + ' ' + (sp.agreedBy.id || '')).trim()) })}` : ''} · ${tx('conservé tant que le séjour ne change pas.')}</small>`
              : `<small>${tx('Tarif accepté')}${when ? ' ' + tx('le {date}', { date: esc(when) }) : ''} · ${tx('conservé tant que les dates, la chambre, la formule ou le compte ne changent pas.')}</small>`);
        }
        const rw = box.querySelector('[data-hx-reprice-wrap]');
        if (rw) rw.hidden = true;
        return;
      }
      const type = cuTypes().find(t => t.id === form.elements.roomTypeId?.value);
      const q = cuDirectQuote({
        typeRate: type ? type.rate : null, baseRate: cuState().baseRate, boardRates: type ? type.boardRates : null,
        board: form.elements.board?.value || 'room_only',
        checkIn: form.elements.checkIn?.value || '', checkOut: form.elements.checkOut?.value || '',
        occupancy: Number(form.elements.partySize?.value) || 1,
      });
      const area = box.querySelector('[data-hx-direct-breakdown]');
      const agreedBox = box.querySelector('[data-hx-agreed-box]');
      if (q.ok) {
        form.__directQuote = { rows: q.rows, totalCents: q.totalCents, nights: q.nights };
        if (area) {
          area.innerHTML = `<div class="hx-quote-lines">${q.rows.map(r => `<div><span>${ltr(esc(r.date))} · ${tx('Logement {amount}', { amount: ltr(cuDraftMoney(r.roomCents)) })}${r.mealCents ? ` + ${tx('repas {amount} ({n} pers.)', { amount: ltr(esc(cuDraftMoney(r.mealCents * r.quantity))), n: r.quantity })}` : ''}</span><span><b>${ltr(cuDraftMoney(r.amountCents) + ' MAD')}</b></span></div>`).join('')}</div><p class="hx-total-band"><span>${tx('Total séjour :')} </span><b>${ltr(cuDraftMoney(q.totalCents) + ' MAD')} ${tx('TTC')}</b></p><small>${tx('Tarifs maison · TVA incluse. Vérifié à nouveau côté serveur avant enregistrement.')}</small>`;
        }
        if (agreedBox) { agreedBox.hidden = true; const cb = agreedBox.querySelector('[data-hx-agreed-confirm]'); if (cb) cb.checked = false; }
        // Explicit reviewed repricing (defect 1): on an edit whose inputs
        // moved money, the new total needs its own confirmation click.
        const rw = box.querySelector('[data-hx-reprice-wrap]');
        if (rw) {
          const needReprice = !!(booking && storedDirect && pricingInputsChanged());
          rw.hidden = !needReprice;
          if (needReprice) {
            const label = rw.querySelector('[data-hx-reprice-label]');
            if (label) label.textContent = tx('Le nouveau total est de {amount} MAD TTC, je l’ai vérifié.', { amount: cuDraftMoney(q.totalCents) });
          } else {
            const cb = rw.querySelector('[data-hx-reprice-confirm]');
            if (cb) cb.checked = false;
          }
        }
      } else {
        form.__directQuote = null;
        if (area) {
          const typeName = type ? type.name : tx('cette catégorie');
          const what = q.missing.includes('room')
            ? tx('Aucun tarif logement configuré pour « {type} ».', { type: esc(typeName) })
            : (q.missing.includes('dates') ? tx('Dates du séjour invalides.') : tx('Aucun tarif « {board} » configuré pour « {type} ».', { board: esc(cuBoards[form.elements.board?.value] || form.elements.board?.value || ''), type: esc(typeName) }));
          const cfgArg = (type && type.id && !q.missing.includes('dates'))
            ? `${type.id}:${form.elements.board?.value || 'room_only'}:${q.missing.includes('room') ? 'room' : 'meal'}` : '';
          area.innerHTML = `<p class="hx-warn-note" style="color:var(--warn-ink);background:var(--warn-soft);padding:8px 12px;border-radius:8px;font-size:12px;">${what} ${cfgArg ? `<button type="button" class="hx-link-btn" data-action="hx-configure-rate" data-arg="${esc(cfgArg)}">${tx('Configurer ce tarif dans Types de chambres')}</button>${tx(', ou convenez un prix ci-dessous.')}` : tx('Renseignez-le dans Types de chambres, ou convenez un prix ci-dessous.')}</p>`;
        }
        if (agreedBox) {
          agreedBox.hidden = false;
          // Prefill once from the stored agreement so a deliberate change
          // starts from the authorized values; never overwrite typing.
          if (storedAgreed) {
            const amt = agreedBox.querySelector('[data-hx-agreed-amount]');
            const rsn = agreedBox.querySelector('[data-hx-agreed-reason]');
            const by = agreedBox.querySelector('[data-hx-agreed-by]');
            if (amt && !amt.value) amt.value = (Number(storedAgreed.totalCents || 0) / 100).toFixed(2);
            if (rsn && !rsn.value) rsn.value = storedAgreed.reason || '';
            if (by && !by.textContent) {
              const who = storedAgreed.agreedBy;
              by.textContent = tx('Précédent prix convenu') + (who ? ' ' + tx('par {who}', { who: `${who.role || ''} ${who.id || ''}`.trim() }) : '') + '. ' + tx('Le modifier exige une nouvelle confirmation ci-dessous.');
            }
          }
        }
        const rw2 = box.querySelector('[data-hx-reprice-wrap]');
        if (rw2) rw2.hidden = true;
      }
    };
    const reset = e => {
      if (!['accountId', 'roomTypeId', 'checkIn', 'checkOut', 'partySize', 'board', 'priceMode'].includes(e.target?.name)) return;
      if (e.target?.name === 'accountId') syncCommercialMode();
      form.__commercialQuote = null;
      if (form.elements.accountId?.value) {
        result.textContent = tx('Paramètres modifiés. Simulez le contrat avant confirmation.');
      } else {
        result.textContent = '';
      }
      updateDirectQuote();
    };
    form.addEventListener('input', reset); form.addEventListener('change', reset);
    form.elements.stayMode?.addEventListener('change', () => updateDirectQuote());
    form.addEventListener('hx-refresh-direct', () => updateDirectQuote());
    // Pricing-change detector for the submit gate (defects 1+3 live in
    // cuSubmitStay, a sibling scope): true on creates, or when any of the
    // seven money-moving inputs drifted since the editor opened.
    form.__pricingChanged = () => pricingInputsChanged();
    syncCommercialMode();
    previewButton.addEventListener('click', async () => {
      if (scope !== cuStayScope()) return;
      const signature = cuStayQuoteSignature(form), fd = new FormData(form);
      const accountId = fd.get('accountId');
      if (!accountId || !String(accountId).trim()) {
        result.innerHTML = `<p class="hx-warn-note" style="color:var(--warn-ink);background:var(--warn-soft);padding:8px 12px;border-radius:8px;font-size:12px;">${tx('Sélectionnez un compte commercial avant de simuler un contrat.')}</p>`;
        return;
      }
      previewButton.disabled = true; form.__commercialQuote = null; result.textContent = tx('Calcul des nuitées…');
      try {
        const res = await fetch('/api/hotel/commercial', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'quote', merchant: cuMerchantSlug(), accountId, roomTypeId: fd.get('roomTypeId'), checkIn: fd.get('checkIn'), checkOut: fd.get('checkOut'), occupancy: Number(fd.get('partySize')), board: fd.get('board') }) });
        const b = await res.json();
        if (scope !== cuStayScope() || signature !== cuStayQuoteSignature(form)) return;
        if (!res.ok) { result.textContent = cuCommercialError(b.error); return; }
        form.elements.priceMode.value = 'contract';
        form.__commercialQuote = { rev: b.rev, signature: cuStayQuoteSignature(form) };
        result.innerHTML = cuQuoteRows(b.quote) + (b.quote.taxBasis === 'inclusive' ? `<div class="hx-quote-accept-wrap"><label class="hx-check-row hx-quote-accept"><input type="checkbox" data-hx-accept-quote> <span>${tx('J’accepte ce prix pour la formule et les dates affichées.')}</span></label></div>` : `<p class="hx-warn-note" style="color:var(--warn-ink);margin-top:6px;">${tx('HT : configuration fiscale nécessaire avant confirmation du séjour.')}</p>`);
      } catch (_) { result.textContent = tx('Simulation indisponible. Aucun nouveau tarif accepté.'); }
      finally { previewButton.disabled = false; }
    });
  }


  return Object.freeze({ cuPerfState, cuPerformanceBlock, cuTarifsBody, cuStayQuoteSignature, cuSetTariffSync, cuTariffSyncCycle, cuTariffRetry, cuDirectQuote, cuQuoteRows, cuWireStayCommercial });
});
