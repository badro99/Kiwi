/* Hotel · calendriers OTA. Corps recopiés sans modification. */
window.__kiwiHotelInternal.define('channels', (scope) => {
  'use strict';
  const { CHANNELS, DIRECT_TREND, MAD, cuChannelState, cuMerchantSlug, cuStarter, cuState, donutCss, esc, hxLocale, rerender, toast, tx, txk } = scope;
  function canauxBody() {
    const totFee = CHANNELS.reduce((a, c) => a + c.fee, 0);
    const donutParts = CHANNELS.map((c) => ({ pct: c.pct, color: c.color }));
    const rows = CHANNELS.map((c) => `<div class="r">
      <span class="sw" style="background:${c.color};"></span>
      <span>${c.label}<div style="font-size:11px;color:var(--n-500);">${c.nights} nuitées · ${MAD(c.rev)}</div></span>
      <span class="pc">${c.pct} %</span>
      <span class="am">${c.fee ? '−' + MAD(c.fee) : '0 MAD'}</span>
    </div>`).join('');
    const trend = DIRECT_TREND.map((v, i) => `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;">
      <div style="width:100%;max-width:34px;height:${v * 2.6}px;background:${i === DIRECT_TREND.length - 1 ? 'var(--atlas)' : 'var(--n-200)'};border-radius:6px 6px 0 0;align-self:center;"></div>
      <span style="font-size:11px;font-family:var(--mono);color:var(--n-500);">${['J', 'F', 'M', 'A', 'M', 'J'][i]}</span>
    </div>`).join('');
    return `<div class="hx-page">
      <div class="hx-row r-21">
        <div class="block" style="padding:16px;">
          <div class="hx-h" style="margin:0 0 12px;"><span class="t">Mix canaux · nuitées 30 jours</span><span class="s">547 nuitées vendues</span></div>
          <div class="hx-donut-wrap">
            <div class="hx-donut" style="${donutCss(donutParts)}"><div class="ctr"><b>54 %</b><span>BOOKING</span></div></div>
            <div class="hx-dlg">${rows}
              <div class="r" style="border-top:1px solid var(--n-200);padding-top:8px;margin-top:2px;">
                <span></span><span style="font-weight:600;color:var(--ink);">Commissions payées · 30 j</span><span></span>
                <span class="am" style="color:var(--danger);">−${MAD(totFee)}</span>
              </div>
            </div>
          </div>
        </div>
        <div class="hx-bleed">
          <div class="lbl">LA MORSURE BOOKING · 30 JOURS</div>
          <div class="big">−${MAD(56180)}</div>
          <div class="sub">17 % de commission sur 295 nuitées. La même Confort Médina à 950 MAD vous laisse
            <b style="color:var(--paper);">788,50 MAD via Booking</b>, et <b style="color:var(--mint);">950 MAD en direct</b>.</div>
          <div style="margin-top:14px;">
            <div class="hx-bleed-row"><div>1 séjour direct de 3 nuits<div class="nt">au lieu de Booking</div></div><span class="am" style="color:var(--mint);">+484 MAD</span></div>
            <div class="hx-bleed-row"><div>22 clients fidèles encore sur OTA<div class="nt">relance « revenez en direct −10 % »</div></div><span class="am" style="color:var(--mint);">+4 100 MAD / mois</span></div>
          </div>
          <button data-activation=write class="hx-btn" style="margin-top:14px;background:var(--mint);color:var(--riad);width:100%;" data-action="hx-direct-push">Activer la relance directe WhatsApp</button>
        </div>
      </div>
      <div class="hx-row r-2">
        <div class="block" style="padding:16px;">
          <div class="hx-h" style="margin:0 0 10px;"><span class="t">Part du direct · 6 mois</span><span class="s">18 % → 25 % depuis la relance Kiwi</span></div>
          <div style="display:flex;align-items:flex-end;gap:8px;height:80px;">${trend}</div>
        </div>
        <div class="block" style="padding:16px;">
          <div class="hx-h" style="margin:0 0 10px;"><span class="t">Règles par canal</span></div>
          <div style="font-size:12.5px;color:var(--n-500);line-height:1.9;">
            <div style="display:flex;justify-content:space-between;"><span>Booking.com, annulation flexible</span><b style="color:var(--ink);">no-show : 1ʳᵉ nuit retenue</b></div>
            <div style="display:flex;justify-content:space-between;"><span>Expedia, prépaiement virtuel (VCC)</span><b style="color:var(--ink);">encaissé à l'arrivée</b></div>
            <div style="display:flex;justify-content:space-between;"><span>Airbnb, versement J+1 après arrivée</span><b style="color:var(--ink);">frais hôte 3 %</b></div>
            <div style="display:flex;justify-content:space-between;"><span>Direct, acompte 30 % WhatsApp Pay</span><b style="color:var(--atlas);">0 % commission</b></div>
          </div>
        </div>
      </div>
    </div>`;
  }

  function cuChannelMerchant() { return cuMerchantSlug(); }

  async function cuLoadChannels(sync) {
    const merchant = cuChannelMerchant(); if (!merchant || cuChannelState.loading) return;
    cuChannelState.loading = true; cuChannelState.error = ''; rerender();
    try {
      const res = sync
        ? await fetch('/api/hotel/channels', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ action:'sync', merchant }) })
        : await fetch('/api/hotel/channels?merchant=' + encodeURIComponent(merchant), { headers:{Accept:'application/json'} });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'unavailable');
      cuChannelState.rows = Array.isArray(body.channels) ? body.channels : [];
      cuChannelState.loaded = true;
      if (sync) toast(tx('Calendriers actualisés'), { type:'success', desc: tx((body.processed || 0) === 1 ? '{n} connexion vérifiée.' : '{n} connexions vérifiées.', { n: body.processed || 0 }) });
    } catch (_) { cuChannelState.error = txk('Synchronisation indisponible. Vos réservations existantes restent intactes.'); }
    finally { cuChannelState.loading = false; rerender(); }
  }

  function cuChannelRoomLabel(id) {
    const room = Object.values(cuState().rooms || {}).find((x) => x.id === id);
    return room ? tx('Chambre {n}', { n: room.n }) : tx('Chambre supprimée');
  }

  function cuDirectOpen() {
    try { return window.KiwiReservations?.get?.()?.settings?.published === true; } catch (_) { return false; }
  }

  function cuCanauxBody() {
    const connected = cuChannelState.rows.map((c) => `<div class="hx-arr">
      <span class="tm ${c.lastError ? 'red' : ''}">${({ airbnb: 'AIRBNB', expedia: 'EXPEDIA', agoda: 'AGODA' })[c.channel] || 'BOOKING'}</span>
      <div class="who"><b>${esc(c.label)}</b><div class="sub">${esc(cuChannelRoomLabel(c.roomId))} · ${c.lastError ? tx('erreur : {reason}', { reason: esc(c.lastError) }) : c.lastSyncAt ? tx('actualisé {when}', { when: new Date(c.lastSyncAt).toLocaleString(hxLocale()) }) : tx('première synchronisation en attente')}</div></div>
      <button data-activation=write class="hx-btn ghost" data-action="hx-channel-status" data-arg="${esc(c.id)}:${c.status === 'paused' ? 'active' : 'paused'}">${c.status === 'paused' ? tx('Réactiver') : tx('Pause')}</button>
      <button data-activation=write class="hx-btn ghost" data-action="hx-channel-delete" data-arg="${esc(c.id)}">${tx('Retirer')}</button>
    </div>`).join('');
    const choices = [{id:'booking',name:'Booking.com'},{id:'airbnb',name:'Airbnb'},{id:'expedia',name:'Expedia'},{id:'agoda',name:'Agoda'}].map((c)=>`<div class="hx-arr"><span class="tm">ICAL</span><div class="who"><b>${c.name}</b><div class="sub">${tx('Import des dates bloquées, chambre par chambre, si le fournisseur propose un lien iCal')}</div></div><button data-activation=write class="hx-btn ghost" data-action="hx-cb-connect" data-arg="${c.id}">${tx('Importer un calendrier')}</button></div>`).join('');
    return `<div class="hx-page">
      <div class="hx-strip">
        <div class="hx-kpi"><div class="l">${tx('Réservation directe')}</div><div class="v">${cuDirectOpen() ? tx('En ligne') : '·'}</div><div class="d">${cuDirectOpen() ? tx('lien de réservation ouvert · les arrivées apparaissent dans la Réception') : tx('lien de réservation fermé · à ouvrir dans Réservations &amp; RDV')}</div></div>
        <div class="hx-kpi"><div class="l">${tx('Canaux connectés')}</div><div class="v">${cuChannelState.loaded ? cuChannelState.rows.filter((x)=>x.status==='active').length : '·'}</div><div class="d">${tx('calendriers actifs')}</div></div>
      </div>
      <div class="hx-h"><span class="t">${tx('Calendriers connectés')}</span><span class="s">${tx('les liens privés ne sont jamais renvoyés au navigateur')}</span><button class="hx-btn ghost" data-action="hx-channel-sync" ${cuChannelState.loading?'disabled':''}>${cuChannelState.loading ? tx('Actualisation…') : tx('Actualiser maintenant')}</button></div>
      <div class="block" style="padding:8px 14px;"><div class="hx-list">${cuChannelState.error?`<div class="hx-empty">${esc(tx(cuChannelState.error))}</div>`:connected||`<div class="hx-empty">${tx('Aucun calendrier connecté.')}</div>`}</div></div>
      <div class="hx-h"><span class="t">${tx('Connecter un canal')}</span><span class="s">${tx('Kiwi bloque les dates OTA dans la disponibilité directe')}</span><button class="hx-btn ghost" data-action="hx-channel-guide">${tx('Où trouver le lien ?')}</button></div>
      <div class="block" style="padding:8px 14px;"><div class="hx-list">${choices}</div></div>
      <div class="block" style="padding:8px 14px;margin-top:14px;">
        ${cuStarter(
          tx('Import iCal, pas de synchronisation bidirectionnelle.'),
          tx('Les calendriers importent des périodes bloquées. Ils ne transmettent pas vos prix, vos stocks ou vos annulations de Kiwi vers les plateformes.'),
          [tx('Les détails clients, prestations et montants sont à vérifier sur la réservation d’origine'), tx('JumboTours et centrales B2B sans iCal : saisie manuelle via + Réservation'), tx('Les commissions réelles ne sont pas fournies par ces calendriers')]
        )}
      </div>
    </div>`;
  }


  return Object.freeze({ canauxBody, cuChannelMerchant, cuLoadChannels, cuChannelRoomLabel, cuDirectOpen, cuCanauxBody });
});
