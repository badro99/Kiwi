/* Hotel · notes de chambre et consommations. Corps recopiés sans modification. */
window.__kiwiHotelInternal.define('folio', (scope) => {
  'use strict';
  const { F, FOLIOS, K, MAD, QUICK_ITEMS, ROOMS, SRC, SRC_DOT, SRC_LBL, cuBoards, cuDay, cuDraftMoney, cuDraftStatus, cuSave, cuStamp, cuState, esc, fmt, folioBySrc, folioPaid, folioTotal, hxLang, hxLocale, hxTo, isCustomHotel, ltr, roomTypeOf, srcPill, tx, txn } = scope;
  function folioModalHtml(room, highlightNew) {
    const f = F()[room];
    if (!f) return `<div style="padding:20px;color:var(--n-500);font-size:13px;">${tx('Aucun folio ouvert pour cette chambre.')}</div>`;
    const total = folioTotal(f);
    const paid = folioPaid(f);
    const groups = ['room', 'resto', 'spa', 'fee', 'taxe'];
    const gHtml = groups.map((g) => {
      const lines = f.lines.filter((l) => l.src === g);
      if (!lines.length) return '';
      return `<div class="hx-fol-grp">
        <div class="gh"><span class="hx-srcdot ${SRC_DOT[g]}"></span>${SRC_LBL[g]}<span style="margin-left:auto;font-weight:600;color:var(--ink);">${MAD(folioBySrc(f, g))}</span></div>
        ${lines.map((l) => `<div class="hx-fol-line${l.isNew && highlightNew ? ' new' : ''}">
          <span><span class="tm">${l.t}</span>${l.label}${l.paid ? ` <span class="hx-pill ok" style="margin-inline-start:6px;">${tx('RÉGLÉ')}</span>` : ''}</span>
          <span class="qt">${l.qty || ''}</span>
          <span class="am">${MAD(l.amt)}</span>
        </div>`).join('')}
      </div>`;
    }).join('');
    const commission = SRC[f.src].fee > 0
      ? `<div class="hx-fol-meta warn"><span>${isCustomHotel() ? tx('Commission {src} ({p} %) · facturée par la plateforme', { src: SRC[f.src].label, p: Math.round(SRC[f.src].fee * 100) }) : `Commission ${SRC[f.src].label} (${Math.round(SRC[f.src].fee * 100)} %) · facturée au riad en fin de mois`}</span><span style="font-family:var(--mono);">${ltr('−' + MAD(folioBySrc(f, 'room') * SRC[f.src].fee))}</span></div>`
      : `<div class="hx-fol-meta"><span>${tx('Réservation directe, aucune commission OTA')}</span><span class="hx-pill ok">${MAD(0)}</span></div>`;
    return `
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:4px;">
        ${srcPill(f.src)}
        <span style="font-size:12px;color:var(--n-500);">${tx('{n} pers', { n: f.pax })} · ${tx('séjour {c}', { c: txn(f.nights, 'nuit') })} · ${roomTypeOf(room).name}</span>
      </div>
      ${gHtml}
      <div class="hx-fol-tot"><span>${tx('Total folio')}</span><span class="am">${MAD(total)}</span></div>
      ${paid > 0 ? `<div class="hx-fol-meta"><span>${tx('Dont déjà réglé')}</span><span style="font-family:var(--mono);">${MAD(paid)}</span></div>` : ''}
      ${commission}
      <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:18px;flex-wrap:wrap;">
        <button class="hx-btn ghost" data-action="hx-add-charge" data-arg="${room}">${tx('+ Ajouter une charge')}</button>
        ${isCustomHotel() && total - paid > 0
          ? `<button class="hx-btn atlas" data-action="hx-checkout-pay" data-arg="${room}|cash">${tx('Espèces · {amount}', { amount: MAD(total - paid) })}</button>
             <button class="hx-btn atlas" data-action="hx-checkout-pay" data-arg="${room}|card">${tx('Carte · {amount}', { amount: MAD(total - paid) })}</button>`
          : `<button class="hx-btn atlas" data-action="hx-checkout-pay" data-arg="${room}">${tx('Encaisser au check-out · {amount}', { amount: MAD(total - paid) })}</button>`}
      </div>`;
  }

  function quickItems() {
    if (!isCustomHotel()) return QUICK_ITEMS;
    const p = ((window.KiwiVenue.getCurrentVenueData() || {}).profileInfo) || {};
    const items = [];
    if (p.resto || p.resto === undefined) items.push(
      { label: tx('Petit-déjeuner'), amt: 80, src: 'resto' },
      { label: tx('Dîner · couvert'), amt: 240, src: 'resto' },
    );
    if (p.spa) items.push({ label: tx('Soin spa / hammam'), amt: 300, src: 'spa' });
    items.push({ label: tx('Minibar'), amt: 45, src: 'resto' }, { label: tx('Late check-out'), amt: 150, src: 'fee' });
    return items;
  }

  function addChargeHtml(room) {
    const intro = isCustomHotel()
      ? tx('Votre caisse, la charge se poste directement sur la note de la chambre {n}.', { n: room })
      : `Caisse restaurant et hammam du riad, la charge se poste directement sur la note de la chambre ${room}.`;
    return `
      <div style="font-size:12px;color:var(--n-500);margin-bottom:10px;">${intro}</div>
      ${quickItems().map((q, i) => `<div class="hx-fol-line" style="cursor:pointer;" data-action="hx-post-charge" data-arg="${room}|${i}">
        <span><span class="hx-srcdot ${SRC_DOT[q.src]}" style="margin-right:7px;"></span>${q.label}</span>
        <span class="qt">${q.src === 'resto' ? 'POS' : q.src === 'spa' ? 'SPA' : tx('FRAIS')}</span>
        <span class="am">${MAD(q.amt)}</span>
      </div>`).join('')}
      <div style="display:flex;justify-content:flex-end;margin-top:16px;">
        <button class="hx-btn ghost" data-action="hx-folio-back" data-arg="${room}">${hxLang() === 'ar' ? '→' : '←'} ${tx('Retour au folio')}</button>
      </div>`;
  }

  function nowLabel() {
    const sim = window.KiwiDemoClock?.getSimState?.();
    if (!isCustomHotel() && sim) return sim.simHourLabel.replace('h', 'h') + String(sim.simMinute).padStart(2, '0');
    return new (globalThis.KiwiZoneLaw?.DateTimeFormat || Intl.DateTimeFormat)('fr-FR', { timeZone: 'Africa/Casablanca', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date());
  }

  function postCharge(room, label, amt, src, silent) {
    const f = F()[room];
    if (!f) return;
    f.lines.push({ t: nowLabel(), serviceAt: Date.now(), label, qty: '', amt, src, isNew: true });
    f.updatedAt = cuStamp();
    if (isCustomHotel()) cuSave();
    if (!silent) K().toast(tx('{label} → folio Ch. {n}', { label, n: room }), { type: 'success', desc: (src === 'resto' ? tx('Restaurant · POS') : tx('Hammam & spa')) + ' · ' + tx('{amount} postés sur la note de chambre.', { amount: MAD(amt) }) });
  }

  function foliosBody() {
    const open = Object.values(FOLIOS).filter((f) => ROOMS[f.room].guest);
    const totalOpen = open.reduce((a, f) => a + folioTotal(f), 0);
    const rows = open.sort((a, b) => folioTotal(b) - folioTotal(a)).map((f) => {
      const r = ROOMS[f.room];
      const resto = folioBySrc(f, 'resto'), spa = folioBySrc(f, 'spa');
      return `<div class="hx-folio-row" data-action="hx-folio" data-arg="${f.room}">
        <div>
          <div style="font-weight:600;color:var(--ink);font-size:13.5px;">Ch. ${f.room} · ${f.guest} ${r.status === 'depart' ? '<span class="hx-pill late">DÉPART EN RETARD</span>' : ''}</div>
          <div style="font-size:11.5px;color:var(--n-500);margin-top:3px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
            ${srcPill(f.src)} ${f.nights} nuit${f.nights > 1 ? 's' : ''} · ${f.pax} pers
            ${resto ? `<span><span class="hx-srcdot resto"></span> resto ${MAD(resto)}</span>` : ''}
            ${spa ? `<span><span class="hx-srcdot spa"></span> hammam ${MAD(spa)}</span>` : ''}
            <span><span class="hx-srcdot taxe"></span> taxe incluse</span>
          </div>
        </div>
        <div class="amt">${MAD(folioTotal(f))}</div>
      </div>`;
    }).join('');
    return `<div class="hx-page">
      <div class="hx-strip">
        <div class="hx-kpi"><div class="l">Folios ouverts</div><div class="v">${open.length}</div><div class="d">chambres + resto + hammam unifiés</div></div>
        <div class="hx-kpi"><div class="l">En-cours total</div><div class="v">${fmt(totalOpen)} <small>MAD</small></div><div class="d up">encaissé au check-out · T+1</div></div>
        <div class="hx-kpi"><div class="l">Taxe de séjour · juin</div><div class="v">14 350 <small>MAD</small></div><div class="d">25 MAD / adulte / nuit</div></div>
        <div class="hx-kpi"><div class="l">Déclaration</div><div class="v" style="font-size:15px;">avant le 10 juil.</div><div class="d up">mai : 24 600 MAD déclarés ✓</div></div>
      </div>
      <div class="hx-h"><span class="t">Notes clients en cours</span><span class="s">un séjour = une note · le restaurant et le hammam postent dessus en direct</span>
        <button class="hx-btn ghost" data-action="hx-taxe-export">Exporter le registre taxe (CSV)</button>
      </div>
      <div class="block" style="padding:6px 14px;">${rows}</div>
      <div class="block" style="padding:16px;background:var(--mint-soft);border-color:var(--atlas);">
        <div style="font-size:13px;color:var(--riad);line-height:1.65;">
          <b>C'est ça, le pitch Kiwi.</b> Un thé commandé en terrasse, un hammam réservé à l'accueil, trois nuits en Suite Yasmina,
          tout atterrit sur la même note, taxe de séjour calculée, encaissée en un geste au départ. Aucun PMS étranger ne fait
          caisse + spa + chambres nativement pour un riad marocain.
        </div>
      </div>
    </div>`;
  }

  function cuDraftRoom(id) { const room=Object.values(cuState().rooms||{}).find(r=>r.id===id);return room?tx('Ch. {n}',{n:room.n}):/^room:\d+$/.test(id)?tx('Ch. {n}',{n:id.slice(5)}):id?tx('Chambre attribuée'):tx('Supplément proposé'); }

  function cuBillingLine(l, payers) {
    const parts=l.parts || [{payer:l.payer,amountCents:l.amountCents}];
    const options = selected => payers.map(p=>`<option value="${esc(p.id)}" ${p.id===selected?'selected':''}>${esc(p.name)}</option>`).join('');
    return `<article class="hx-billing-line" data-hx-billing-line="${esc(l.id)}" data-amount="${l.amountCents}"><header><div><b>${esc(l.label)}</b><span>${esc(l.date)} · ${esc(cuDraftRoom(l.roomId))} · ${tx('{n} unité(s)', { n: l.quantity })}${l.board ? ' · '+esc(cuBoards[l.board] || l.board) : ''}</span></div><strong>${ltr(cuDraftMoney(l.amountCents) + ' MAD')}</strong></header><div class="hx-room-form hx-type-form"><label><span>${tx('Payeur principal')}</span><select data-hx-payer>${options(parts[0]?.payer || l.payer)}</select></label><label><span>${tx('Part du second payeur · MAD')}</span><input data-hx-part inputmode="decimal" dir="ltr" value="${((parts[1]?.amountCents || 0)/100).toFixed(2)}"></label><label><span>${tx('Second payeur · si partage')}</span><select data-hx-second><option value="">${tx('Aucun')}</option>${options(parts[1]?.payer)}</select></label></div>${l.kind==='extra'?`<button class="hx-btn ghost" type="button" data-hx-remove-extra>${tx('Retirer ce supplément proposé')}</button>`:''}</article>`;
  }

  function cuDossierRooms(data) {
    return `<div class="hx-dossier-rooms">${(data.source.rooms || []).map(r=>`<article><b>${esc(r.name || tx('Séjour'))}</b><span>${esc(cuDraftRoom(r.roomId))} · ${esc(r.code)} · ${esc(cuDraftStatus(r.status))}</span><span>${esc(cuDay(r.checkIn))}${hxTo()}${esc(cuDay(r.checkOut))}${r.dayUse?' · '+tx('Day-use')+' '+esc(r.arrivalTime)+'–'+esc(r.departureTime):''}</span><button type="button" class="hx-btn ghost" data-hx-open-stay="${esc(r.id)}">${tx('Modifier cette chambre')}</button></article>`).join('')}</div>`;
  }

  function cuBillingBlocked(code) {
    if (code==='billing-quote-mismatch') return tx('Le prix accepté ne correspond plus au séjour : dates, chambre ou tarif modifiés depuis l’acceptation. Rouvrez « Modifier cette chambre », vérifiez le prix et acceptez le nouveau devis, puis revenez. Aucune donnée comptable n’a été modifiée.');
    if (code==='billing-bad-status') return tx('Le statut d’un séjour du dossier bloque la préfacture. Rouvrez « Modifier cette chambre », vérifiez son statut et enregistrez, puis revenez. Aucune donnée comptable n’a été modifiée.');
    if (code==='billing-bad-stay' || code==='billing-bad-dates') return tx('Une donnée d’un séjour (dates, chambre ou montant) bloque la préfacture. Rouvrez « Modifier cette chambre », vérifiez puis enregistrez, puis revenez. Aucune donnée comptable n’a été modifiée.');
    if (code==='directory-unreadable') return tx('Le répertoire des comptes est illisible : la préfacture est suspendue le temps de le réparer. Les chambres restent modifiables séparément.');
    return tx('Préfacturation indisponible. Aucune donnée comptable n’a été modifiée.');
  }

  function cuBillingBody(data) {
    const roomsHtml=cuDossierRooms(data);
    const savedWarn=data.savedWarning?`<div class="hx-billing-notice" role="alert"><b>${tx('Ancien brouillon illisible.')}</b><p>${tx('Il sera remplacé proprement au prochain enregistrement. Aucune donnée comptable n’a été modifiée.')}</p></div>`:'';
    if (data.billingError || !data.preview) {
      const count=(data.source.rooms || []).length;
      return `<section class="hx-billing"><header class="hx-commercial-hero"><div><span class="hx-commercial-eyebrow">${tx('DOSSIER HÔTEL · PRÉFACTURATION')}</span><h2>${tx('Un séjour, plusieurs chambres.')}</h2><p>${tx('Les chambres restent modifiables et annulables séparément.')}</p></div><div><small>${tx('Chambres au dossier')}</small><strong>${count}</strong></div></header>
      ${roomsHtml}
      <div class="hx-billing-notice" role="alert"><b>${tx('Préfacture suspendue.')}</b><p>${cuBillingBlocked(data.billingError)}</p></div>
      ${savedWarn}
      <p role="status" data-hx-dossier-error></p></section>`;
    }
    const saved=data.saved?.draft, draft=data.stale ? data.preview : (saved || data.preview);
    return `<section class="hx-billing"><header class="hx-commercial-hero"><div><span class="hx-commercial-eyebrow">${tx('DOSSIER HÔTEL · PRÉFACTURATION')}</span><h2>${tx('Un séjour, plusieurs chambres.')}</h2><p>${tx('Répartissez les prestations entre voyageurs, agence et société.')}</p></div><div><small>${tx('Total proposé')}</small><strong data-hx-draft-total dir="ltr">${cuDraftMoney(draft.totalCents)} MAD</strong></div></header>
      <p class="hx-billing-notice">${tx('Préfacture non fiscale. Taxes non validées et encaissements non rapprochés. Les suppléments saisis ici ne sont pas envoyés à la caisse. Aucune facture définitive ni paiement n’est créé.')}</p>
      ${roomsHtml}
      ${data.stale?`<div class="hx-billing-notice" role="alert"><b>${tx('Le dossier a changé depuis la dernière préfacture.')}</b><p>${tx('Le nouveau prix est affiché. Les répartitions et suppléments de l’ancien brouillon ne seront pas repris automatiquement.')}</p><button type="button" class="hx-btn ghost" data-hx-reset-draft>${tx('Repartir des séjours actuels et remplacer le brouillon')}</button></div>`:''}
      ${savedWarn}
      <form data-hx-billing-form><fieldset ${data.stale?'disabled':''}><legend>${tx('Prestations et répartition')}</legend><div data-hx-billing-lines>${draft.lines.map(l=>cuBillingLine(l,data.source.payers)).join('')}</div>
        <details class="hx-commercial-stay"><summary>${tx('Ajouter un supplément proposé')}</summary><div class="hx-room-form hx-type-form"><label><span>${tx('Date de prestation')}</span><input type="date" name="extraDate" value="${esc(data.source.rooms[0]?.checkIn || '')}"></label><label><span>${tx('Libellé')}</span><input name="extraLabel" maxlength="160" placeholder="${tx('Repas, parking, service…')}"></label><label><span>${tx('Quantité')}</span><input name="extraQuantity" type="number" min="1" max="10000" value="1"></label><label><span>${tx('Prix unitaire proposé · MAD')}</span><input name="extraPrice" inputmode="decimal" dir="ltr" placeholder="0,00"></label></div><button class="hx-btn ghost" type="button" data-hx-add-extra>${tx('Ajouter au brouillon')}</button></details>
        <label class="hx-billing-note"><span>${tx('Observations de préfacturation')}</span><textarea name="billingNote" maxlength="1000" rows="2">${esc(draft.note || '')}</textarea></label>
        <div class="hx-billing-summary" data-hx-billing-summary>${draft.payers.map(p=>`<span>${esc(p.name)} <b>${ltr(cuDraftMoney(p.amountCents) + ' MAD')}</b></span>`).join('')}</div>
        <p role="status" data-hx-billing-error></p><div class="hx-room-form-actions"><button type="button" class="hx-btn ghost" data-hx-print-draft ${!saved || data.stale?'disabled':''}>${tx('Imprimer la version enregistrée')}</button><button type="submit" class="hx-btn atlas">${tx('Enregistrer la préfacture')}</button></div></fieldset></form></section>`;
  }

  function cuDraftInput(form, extras) {
    const allocations=[...form.querySelectorAll('[data-hx-billing-line]')].map(row=>{
      const total=Number(row.dataset.amount),first=row.querySelector('[data-hx-payer]').value,second=row.querySelector('[data-hx-second]').value;
      const raw=row.querySelector('[data-hx-part]').value.trim().replace(',','.');
      if(!/^\d{1,9}(\.\d{1,2})?$/.test(raw))throw new Error(tx('Partage invalide. Utilisez deux décimales maximum.'));
      const amount=Math.round(Number(raw)*100);
      if(amount>total || (amount>0 && (!second || second===first)))throw new Error(tx('Le partage doit respecter le montant de la ligne et utiliser deux payeurs distincts.'));
      return {lineId:row.dataset.hxBillingLine,parts:[{payer:first,amountCents:total-amount},...(amount?[{payer:second,amountCents:amount}]:[])]};
    });
    return {extras,allocations,note:form.elements.billingNote.value};
  }

  function cuPrintDraft(saved) {
    const d=saved.draft, frame=document.createElement('iframe');
    const lang=hxLang(), rtl=lang==='ar', amount=(c)=>'<bdi dir="ltr">'+cuDraftMoney(c)+'</bdi>';
    frame.title=tx('Préfacture à imprimer'); frame.style.cssText='position:fixed;left:-10000px;width:800px;height:1000px;border:0';
    frame.srcdoc=`<!doctype html><html lang="${lang}"${rtl?' dir="rtl"':''}><meta charset="utf-8"><title>${tx('Préfacture non fiscale')}</title><style>@page{size:A4;margin:16mm}body{font:12px system-ui;color:#17221d}h1{font-size:28px}table{border-collapse:collapse;width:100%;margin:24px 0}th,td{padding:8px;text-align:start;border-bottom:1px solid #ccd5cf}thead{display:table-header-group}tr{break-inside:avoid}.notice{padding:12px;border:1px solid #9caea2}small{display:block;margin-top:6px}</style><h1>${tx('Préfacture non fiscale')}</h1><p>${tx('Version enregistrée le {date}', { date: esc(new Date(saved.updatedAt).toLocaleString(hxLocale())) })}</p><p class="notice">${tx('Taxes non validées. Encaissements non rapprochés. Ce document n’est ni une facture définitive, ni un reçu de paiement.')}</p><table><thead><tr><th>${tx('Date / chambre')}</th><th>${tx('Prestation')}</th><th>${tx('Quantité')}</th><th>${tx('Montant proposé MAD')}</th></tr></thead><tbody>${d.lines.map(l=>`<tr><td>${esc(l.date)}<small>${esc(l.roomId||'')}</small></td><td>${esc(l.label)}<small>${l.parts.map(p=>esc(d.payers.find(x=>x.id===p.payer)?.name||tx('Payeur'))+': '+amount(p.amountCents)).join(' · ')}</small></td><td>${l.quantity}</td><td>${amount(l.amountCents)}</td></tr>`).join('')}</tbody></table><h2>${tx('Total proposé : {amount} MAD', { amount: amount(d.totalCents) })}</h2>${d.payers.map(p=>`<p><b>${esc(p.name)} : <bdi dir="ltr">${cuDraftMoney(p.amountCents)} MAD</bdi></b><small>${esc(p.address||'')} ${p.ice?' · ICE '+esc(p.ice):''}</small></p>`).join('')}<p>${esc(d.note||'')}</p></html>`;
    frame.onload=()=>{frame.contentWindow.addEventListener('afterprint',()=>frame.remove(),{once:true});frame.contentWindow.focus();frame.contentWindow.print();};
    document.body.appendChild(frame);
  }


  return Object.freeze({ folioModalHtml, quickItems, addChargeHtml, nowLabel, postCharge, foliosBody, cuDraftRoom, cuBillingLine, cuDossierRooms, cuBillingBlocked, cuBillingBody, cuDraftInput, cuPrintDraft });
});
