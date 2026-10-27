/* Pressing workshop UI. Exports: create. Reads: the declared owner methods/context
 * below and live presentation bindings; no sibling module or private window state.
 * Browser reads: KiwiApiBase, KiwiCaisseLang, KiwiCaissePairing, KiwiPressingOps, KiwiStaff, open.
 */
import { ITEMS, root } from './custody.js?v=4';
export function create(owner) {
  'use strict';
  const { $, $$, COLOR, ORDERS, STATUS, afterStatusChange, catalogLabel, closeVeil, custOf, dataText, effectiveStatus, esc, findOrder, fmtDT, fmtDay, fmtMAD, garmentIcon, icons, isLate, isLiveOrder, moveCaretEnd, openPay, openScan, openTags, openVeil, orderStatus, orderTotals, pad2, pressingScope, publicOrderNo, publicPieceNo, pvName, queueIfOffline, refreshOps, releaseSlot, searchDigits, setSelectedReady, setWholeOrderStatus, state, svcCodes, switchView, syncOwnerOps, toast, whatsappPhone } = owner.workshopContext();
function payPill(o) {
    const { total } = orderTotals(o);
    if (o.pay.mode === 'compte') return '<span class="px-pill ok">Compte B2B</span>';
    const due = Math.max(0, total - o.pay.paid);
    if (due <= 0) return '<span class="px-pill ok">Payé</span>';
    if (o.pay.paid > 0) return `<span class="px-pill warn">Acompte · solde ${fmtMAD(due)}</span>`;
    return `<span class="px-pill due">Au retrait · ${fmtMAD(due)}</span>`;
  }
function matchesQuery(o, q) {
    if (!q) return true;
    const c = custOf(o);
    /* Le client dicte son numéro comme il l'a en tête : « zéro six… » ou
       « plus deux cent douze six… ». Les deux doivent trouver la même commande,
       donc on ramène la RECHERCHE au même format local que la fiche avant de
       comparer — sinon +212 6… ne retrouvait jamais un 06… enregistré. */
    const digits = searchDigits(q);
    const numeric = String(q).replace(/\D/g, '');
    return (numeric && publicOrderNo(o).includes(numeric)) ||
      o.id.toLowerCase().includes(q.toLowerCase()) ||
      c.name.toLowerCase().includes(q.toLowerCase()) ||
      (digits.length >= 2 && searchDigits(c.phone || '').includes(digits));
  }
function boardBucket(o) {
    const st = orderStatus(o);
    if (st === 'livre' || st === 'annule') return 'history';
    if (st === 'pret') return 'ready';
    return 'todo';
  }
function boardPriority(o) {
    const st = orderStatus(o);
    const lateWeight = isLate(o) ? -100000000000000 : 0;
    const stageWeight = st === 'trait' ? -1000000000000 : st === 'recu' ? 0 : 1000000000000;
    const readyTs = new Date(o.readyAt).getTime();
    return lateWeight + stageWeight + (Number.isFinite(readyTs) ? readyTs : Number.MAX_SAFE_INTEGER);
  }
function orderCard(o) {
    const c = custOf(o);
    const late = isLate(o);
    const st = orderStatus(o);
    const selected = state.boardSelected.includes(o.id);
    const when = st === 'annule'
      ? `annulée ${fmtDay(o.cancelledAt || o.updatedAt || o.readyAt)}`
      : st === 'livre'
        ? `remis ${fmtDay(o.collectedAt || o.readyAt)}`
      : `prêt ${fmtDT(o.readyAt)}`;
    const mainAction = st === 'recu' || st === 'trait'
      ? `<button class="px-work-primary" data-px-ready="${o.id}"><i data-lucide="check-check"></i>Prête</button>`
      : st === 'pret' && !o.rack
        ? `<button class="px-work-primary" data-px-rack="${o.id}"><i data-lucide="archive"></i>Ranger</button>`
        : st === 'pret'
          ? `<button class="px-work-primary" data-px-pickup="${o.id}"><i data-lucide="package-check"></i>Retrait</button>`
          : '';
    return `<article class="px-ocard ${late ? 'is-late' : ''} ${selected ? 'is-selected' : ''}" data-px-order="${o.id}">
      <div class="px-ocard-select">
        ${boardBucket(o) === 'todo' ? `<button class="px-work-check" data-px-select="${o.id}" aria-label="${selected ? 'Retirer' : 'Ajouter'} ${o.id} de la sélection"><i data-lucide="${selected ? 'check' : 'circle'}"></i></button>` : '<span></span>'}
        <button class="px-work-detail" data-px-detail="${o.id}">Détails <i data-lucide="chevron-right"></i></button>
      </div>
      <div class="px-ocard-top"><span class="px-ocard-num">${publicOrderNo(o)}</span>
        <span class="px-ocard-when ${late ? 'late' : ''}">${late ? 'EN ATTENTE DE RETRAIT · ' : ''}${esc(when)}</span></div>
      <div class="px-ocard-client" data-nolang><i data-lucide="${o.b2b ? 'building-2' : 'user'}"></i>${dataText(c.name)}</div>
      <div class="px-ocard-meta">
        <span class="px-pill"><i data-lucide="tag"></i>${o.pieces.length} pièce${o.pieces.length > 1 ? 's' : ''}</span>
        <span class="px-pill ${st === 'trait' ? 'warn' : st === 'pret' ? 'ok' : ''}">${STATUS[st].label}</span>
        ${payPill(o)}
        ${o.rack ? `<span class="px-pill rack">${o.rack}</span>` : ''}
        ${o.notified && st === 'pret' ? '<span class="px-pill wa">Notifié</span>' : ''}
      </div>
      <div class="px-piece-dots">${o.pieces.map((p) => `<i class="px-pdot ${effectiveStatus(o, p)}"></i>`).join('')}</div>
      <div class="px-work-actions">
        ${st === 'recu' ? `<button class="px-work-secondary" data-px-start="${o.id}">En cours <span>facultatif</span></button>` : ''}
        ${st === 'pret' && !o.notified ? `<button class="px-work-secondary" data-px-notify="${o.id}"><i data-lucide="message-circle"></i>Prévenir</button>` : ''}
        ${mainAction}
      </div>
    </article>`;
  }
function renderBoard() {
    const panel = $('[data-px-panel="commandes"]', root);
    const q = state.boardQuery;
    const counts = { todo: 0, ready: 0, history: 0 };
    ORDERS.forEach((o) => { counts[boardBucket(o)]++; });
    const list = ORDERS
      .filter((o) => boardBucket(o) === state.boardFilter && matchesQuery(o, q))
      .sort((a, b) => boardPriority(a) - boardPriority(b));
    state.boardSelected = state.boardSelected.filter((id) => list.some((o) => o.id === id));
    panel.innerHTML = `
      <div class="px-board">
        <header class="px-head">
          <div><h1>File de travail</h1><div class="px-head-sub">Reçu automatiquement · « En cours » facultatif · une touche quand c’est prêt</div></div>
          <div class="px-work-head-actions">
            <button class="px-btn secondary" id="px-board-scan"><i data-lucide="scan-line"></i>Scanner</button>
            <div class="px-search"><i data-lucide="search"></i>
              <input id="px-board-q" placeholder="Téléphone, nom ou n° de commande…" value="${esc(q)}" /></div>
          </div>
        </header>
        <div class="px-work-toolbar">
          <div class="px-work-tabs" role="tablist">
            ${[['todo', 'À faire'], ['ready', 'Prêtes'], ['history', 'Historique']].map(([key, label]) => `<button class="${state.boardFilter === key ? 'on' : ''}" data-px-board-filter="${key}">${label}<span>${counts[key]}</span></button>`).join('')}
          </div>
          <div class="px-work-legend"><i data-lucide="sparkles"></i>${state.boardFilter === 'todo' ? 'Les urgences et retards remontent en premier' : state.boardFilter === 'ready' ? 'À ranger, notifier ou remettre' : 'Les commandes remises restent consultables'}</div>
        </div>
        ${state.boardSelected.length ? `<div class="px-work-batch"><span><b>${state.boardSelected.length}</b> sélectionnée${state.boardSelected.length > 1 ? 's' : ''}</span><button data-px-clear-selection>Annuler</button><button class="px-work-primary" data-px-batch-ready><i data-lucide="check-check"></i>Marquer prête${state.boardSelected.length > 1 ? 's' : ''}</button></div>` : ''}
        <div class="px-work-list">
          ${list.map(orderCard).join('') || `<div class="px-work-empty"><i data-lucide="${q ? 'search-x' : state.boardFilter === 'todo' ? 'check-circle-2' : 'archive'}"></i><b>${q ? 'Aucune commande trouvée' : state.boardFilter === 'todo' ? 'Le travail en attente apparaîtra ici' : state.boardFilter === 'ready' ? 'Aucune commande prête' : 'Aucune commande remise'}</b><span>${q ? 'Essayez un nom, un téléphone ou un numéro de commande.' : state.boardFilter === 'todo' ? 'Vous pouvez quitter cet écran : le compteur du menu vous prévient.' : ''}</span></div>`}
        </div>
      </div>`;
    $('#px-board-q', panel).oninput = (e) => {
      state.boardQuery = e.target.value;
      renderBoard(); icons();
      const i = $('#px-board-q', panel); i.focus(); moveCaretEnd(i);
    };
    $('#px-board-scan', panel).onclick = () => openScan('workflow');
    panel.onclick = (e) => {
      const filter = e.target.closest('[data-px-board-filter]');
      if (filter) { state.boardFilter = filter.dataset.pxBoardFilter; state.boardSelected = []; renderBoard(); return; }
      const select = e.target.closest('[data-px-select]');
      if (select) {
        const id = select.dataset.pxSelect;
        state.boardSelected = state.boardSelected.includes(id) ? state.boardSelected.filter((x) => x !== id) : [...state.boardSelected, id];
        renderBoard(); return;
      }
      if (e.target.closest('[data-px-clear-selection]')) { state.boardSelected = []; renderBoard(); return; }
      if (e.target.closest('[data-px-batch-ready]')) { setSelectedReady(); return; }
      const ready = e.target.closest('[data-px-ready]');
      if (ready) { setWholeOrderStatus(findOrder(ready.dataset.pxReady), 'pret', 'Commande prête'); return; }
      const start = e.target.closest('[data-px-start]');
      if (start) { setWholeOrderStatus(findOrder(start.dataset.pxStart), 'trait', 'Commande en traitement'); return; }
      const notify = e.target.closest('[data-px-notify]');
      if (notify) { openWa(findOrder(notify.dataset.pxNotify)); return; }
      const rack = e.target.closest('[data-px-rack]');
      if (rack) { state.rackSelect = rack.dataset.pxRack; switchView('rangement'); return; }
      const pickup = e.target.closest('[data-px-pickup]');
      if (pickup) { state.rtQuery = pickup.dataset.pxPickup; switchView('retrait'); return; }
      const detail = e.target.closest('[data-px-detail]');
      if (detail) { openDetail(detail.dataset.pxDetail); return; }
      const card = e.target.closest('[data-px-order]');
      if (card) openDetail(card.dataset.pxOrder);
    };
    icons();
  }
function openDetail(orderId) {
    const o = findOrder(orderId);
    if (!o) return;
    /* On retient la commande affichée pour que refreshOps() puisse la
       repeindre : sans ça, une remise au client ou une libération de cintre
       déclenchée ailleurs laissait la fiche ouverte sur un état périmé. */
    state.detailId = o.id;
    const el = $('#px-detailm', root);
    const c = custOf(o);
    const { total } = orderTotals(o);
    const due = o.pay.mode === 'compte' ? 0 : Math.max(0, total - o.pay.paid);
    const st = orderStatus(o);
    const delivered = st === 'livre';
    const notification = window.KiwiPressingOps.notification(o);
    const notifyTr = s => window.KiwiCaisseLang ? window.KiwiCaisseLang.tr(s) : s;
    const notificationDetail = notification ? [notifyTr('Marqué prévenu'), notification.by && notification.by.name, notification.at && new Date(notification.at).toLocaleString(document.documentElement.lang === 'ar' ? 'ar-MA-u-nu-latn' : document.documentElement.lang === 'en' ? 'en-GB' : 'fr-FR'), notifyTr(({call:'Appel',sms:'Par SMS',whatsapp:'Par WhatsApp','in-person':'En personne'})[notification.channel] || '')].filter(Boolean).map(esc).join(' · ') : '';
    const carePieces = o.pieces.map((p) => ({ p, care: [...(p.notes || []), p.freeNote].filter(Boolean) })).filter((x) => x.care.length);

    el.innerHTML = `
      <button class="px-modal-x" data-px-close aria-label="Fermer"><i data-lucide="x"></i></button>
      <div class="px-dt-head">
        <div>
          <h3>${publicOrderNo(o)}</h3>
          <div class="px-dt-sub">${dataText(c.name)} ${c.phone ? `<span class="tel">${esc(c.phone)}</span>` : ''}
            ${o.b2b ? '<span class="px-b2b-chip">B2B</span>' : ''}
            <span class="px-pill ${st === 'pret' ? 'ok' : st === 'trait' ? 'warn' : ''}">${STATUS[st].label}</span>
            ${isLate(o) ? '<span class="px-pill due">En attente de retrait</span>' : ''}
            ${payPill(o)}
            ${o.rack ? `<span class="px-pill rack">${o.rack}</span>` : ''}
          </div>
          <div class="px-dt-sub" style="margin-top:5px;"><span>Déposé ${fmtDT(o.droppedAt)}</span> · <span>promis ${fmtDT(o.readyAt)}</span>${o.collectedAt ? ` · <span>retiré ${fmtDT(o.collectedAt)}</span>` : ''}</div>
        </div>
      </div>
      ${notificationDetail ? `<p class="px-dt-notification">${notificationDetail}</p>` : ''}
      ${carePieces.length ? `<div class="px-dt-care-summary"><i data-lucide="triangle-alert"></i><div><b>${carePieces.length} pièce${carePieces.length > 1 ? 's' : ''} avec instruction${carePieces.length > 1 ? 's' : ''} à respecter</b><span>${carePieces.map((x) => `${esc(x.p.label)} : ${x.care.map(esc).join(' · ')}`).join(' · ')}</span></div></div>` : ''}
      ${st === 'recu' || st === 'trait' ? `<div class="px-next-step"><div><b>Action habituelle</b><span>Quand tout est fini, marquez directement la commande prête. « En cours » reste facultatif.</span></div><button class="px-btn primary" id="px-dt-ready"><i data-lucide="check-check"></i>Commande prête</button></div>` : ''}
      <details class="px-piece-exceptions" ${carePieces.length ? 'open' : ''}>
        <summary><span>Pièces et exceptions</span><span>${o.pieces.length} pièce${o.pieces.length > 1 ? 's' : ''} · suivi détaillé facultatif</span></summary>
      <div class="px-dt-grid">
        ${o.pieces.map((p, i) => {
          const care = [...(p.notes || []), p.freeNote].filter(Boolean);
          return `
          <div class="px-piece">
            <span class="px-piece-art">${garmentIcon({ ...(ITEMS[p.itemId] || {}), variantId: p.variantId })}</span>
            <span class="px-piece-mid">
              <span class="px-piece-name"><i class="dot" style="background:${COLOR[p.color] ? COLOR[p.color].hex : '#ccc'}"></i>${catalogLabel({ ...ITEMS[p.itemId], label: p.label })} · ${esc((COLOR[p.color] || {}).label || 'Couleur non précisée')} · <span style="font-family:var(--mono);font-size:11px;">${svcCodes(p.svcs)}</span></span>
              <span class="px-piece-id">${publicPieceNo(o, p)}${p.photos ? `<span class="ph"><i data-lucide="camera"></i>${p.photos} photo${p.photos > 1 ? 's' : ''}</span>` : ''}</span>
              ${care.length ? `<span class="px-piece-care"><i data-lucide="triangle-alert"></i>${care.map(esc).join(' · ')}</span>` : ''}
            </span>
            ${delivered || p.status === 'livre'
              ? '<span class="px-pill">Livré</span>'
              : `<span class="px-pstatus">
                  ${['recu', 'trait', 'pret'].map((s) => `<button class="px-pstep ${p.status === s ? 'on ' + s : ''}" data-px-piece="${i}" data-px-st="${s}">${s === 'recu' ? 'Reçu' : s === 'trait' ? 'Trait.' : 'Prêt'}</button>`).join('')}
                </span>`}
          </div>`;
        }).join('')}
      </div></details>
      <div class="px-dt-actions">
        ${delivered ? '' : `
          ${st === 'recu' ? '<button class="px-btn ghost" data-px-all="trait"><i data-lucide="loader"></i>Noter en cours</button>' : ''}`}
        <button class="px-btn secondary" id="px-dt-tags"><i data-lucide="printer"></i>Étiquettes</button>
        ${due > 0 && !delivered ? `<button class="px-btn secondary" id="px-dt-pay"><i data-lucide="banknote"></i>Solde · ${fmtMAD(due)}</button>` : ''}
        ${st === 'pret' ? `<button class="px-btn ${o.notified ? 'secondary' : 'primary'}" id="px-dt-wa"><i data-lucide="message-circle"></i>${o.notified ? 'Marqué prévenu' : 'Marquer prévenu'}</button>` : ''}
        ${st === 'pret' && o.draftOpenedAt && !o.notified ? '<button class="px-btn primary" id="px-dt-wa-confirm"><i data-lucide="check-check"></i>Marquer prévenu</button>' : ''}
        ${st === 'pret' && !o.rack ? '<button class="px-btn primary" id="px-dt-rack"><i data-lucide="archive"></i>Ranger</button>' : ''}
        ${st === 'pret' ? `<button class="px-btn primary" id="px-dt-handover"><i data-lucide="check"></i>${due > 0 ? `Encaisser puis remettre · ${fmtMAD(due)}` : 'Passer au retrait'}</button>` : ''}
        ${o.rack && !delivered ? '<button class="px-btn ghost" id="px-dt-unrack">Libérer le cintre</button>' : ''}
        ${!delivered ? '<button class="px-btn ghost danger" id="px-dt-cancel" style="color:var(--danger,#b53b31);border-color:rgba(181,59,49,0.3);"><i data-lucide="ban"></i>Annuler</button>' : ''}
      </div>`;
    openVeil('#px-detail-veil');
    icons();

    $$('[data-px-close]', el).forEach((b) => { b.onclick = () => closeVeil('#px-detail-veil'); });
    $$('[data-px-piece]', el).forEach((b) => {
      b.onclick = () => {
        const p = o.pieces[+b.dataset.pxPiece];
        const wasPret = orderStatus(o) === 'pret';
        p.status = b.dataset.pxSt;
        queueIfOffline('Statut pièce');
        afterStatusChange(o, wasPret);
      };
    });
    $$('[data-px-all]', el).forEach((b) => {
      b.onclick = () => {
        const wasPret = orderStatus(o) === 'pret';
        o.pieces.forEach((p) => { if (p.status !== 'livre') p.status = b.dataset.pxAll; });
        queueIfOffline('Statut commande');
        afterStatusChange(o, wasPret);
      };
    });
    const readyB = $('#px-dt-ready', el);
    if (readyB) readyB.onclick = () => setWholeOrderStatus(o, 'pret', 'Commande prête');
    /* tags/pay veils precede the detail veil in the DOM — close detail first
       so they don't paint underneath it */
    $('#px-dt-tags', el).onclick = () => { closeVeil('#px-detail-veil'); openTags(o, { fresh: false }); };
    const payB = $('#px-dt-pay', el);
    if (payB) payB.onclick = () => {
      closeVeil('#px-detail-veil');
      openPay(o, { settle: true, onSettled: () => { openDetail(o.id); refreshOps(); } });
    };
    const waB = $('#px-dt-wa', el);
    if (waB) waB.onclick = () => window.KiwiPressingOps.openNotification(o, $('#px-wam', root), window.KiwiCaissePairing?.staff?.() || window.KiwiStaff, () => { syncOwnerOps(); queueIfOffline('Client marqué prévenu'); closeVeil('#px-wa-veil'); openDetail(o.id); refreshOps(); });
    const waConfirm = $('#px-dt-wa-confirm', el);
    if (waConfirm) waConfirm.onclick = () => {
      if (!window.KiwiPressingOps.markNotified(o, window.KiwiCaissePairing?.staff?.() || window.KiwiStaff, 'whatsapp')) return;
      queueIfOffline('Notification client confirmée');
      toast(`${publicOrderNo(o)}, marqué prévenu`);
      openDetail(o.id); refreshOps();
    };
    const rackB = $('#px-dt-rack', el);
    if (rackB) rackB.onclick = () => {
      closeVeil('#px-detail-veil');
      state.rackSelect = o.id;
      switchView('rangement');
    };
    const handoverB = $('#px-dt-handover', el);
    if (handoverB) handoverB.onclick = () => {
      closeVeil('#px-detail-veil');
      state.rtQuery = o.id;
      switchView('retrait');
    };
    const unrackB = $('#px-dt-unrack', el);
    if (unrackB) unrackB.onclick = () => {
      releaseSlot(o);
      toast(`${publicOrderNo(o)}, cintre libéré`);
      openDetail(o.id); refreshOps();
    };
    const cancelB = $('#px-dt-cancel', el);
    if (cancelB) cancelB.onclick = async () => {
      const pin = prompt('Entrez le code manager pour annuler cette commande :');
      if (pin === null) return;
      if (!/^\d{4}$/.test(pin)) {
        toast('Code manager à 4 chiffres requis.');
        return;
      }
      let actor = null;
      let cancellation = null;
      try {
        const merchant = pressingScope();
        const response = merchant ? await (await import('./request-deadline.mjs').catch(function () { return { deadlineFetch: function (u, o) { return fetch(u, o); } }; })).deadlineFetch('/api/pressing/cancel', {
          method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ merchant, orderId: String(o.id), pin }),
        }) : null;
        const result = response && response.ok ? await response.json() : null;
        cancellation = result && result.ok ? result : null;
        actor = cancellation && cancellation.actor;
      } catch (_) { actor = null; }
      if (!actor || !(actor.id || actor.name)) {
        toast('Code manager refusé ou vérification indisponible.');
        return;
      }
      const cancelledAt = new Date(cancellation && cancellation.cancelledAt);
      if (!Number.isFinite(cancelledAt.getTime())) {
        toast('Annulation confirmée sans horodatage serveur. Réessayez.');
        return;
      }
      const idx = ORDERS.findIndex((x) => x.id === o.id);
      if (idx !== -1 && isLiveOrder(o)) {
        releaseSlot(o);
        o.cancelledAt = cancelledAt;
        o.cancelledBy = { id: String(actor.id || '').slice(0, 80), name: String(actor.name || '').slice(0, 100), role: String(actor.role || '').slice(0, 40) };
        o.updatedAt = cancelledAt.getTime();
        syncOwnerOps();
        queueIfOffline('Annulation commande');
        if (window.KiwiPressingOps && KiwiPressingOps.cancelOrder) KiwiPressingOps.cancelOrder(o.id, o.cancelledBy, cancelledAt.toISOString());
        closeVeil('#px-detail-veil');
        toast(`Commande ${publicOrderNo(o)} annulée`);
        refreshOps();
      }
    };
  }
function waMessage(o) {
    const c = custOf(o);
    const first = c.b2b ? c.name : c.name.split(' ')[0];
    const { total } = orderTotals(o);
    const due = o.pay.mode === 'compte' ? 0 : Math.max(0, total - o.pay.paid);
    // Sent to the customer, so it does not follow the cashier's screen language.
    return `Bonjour ${first}, votre commande ${publicOrderNo(o)} (${o.pieces.length} pièce${o.pieces.length > 1 ? 's' : ''}) est prête chez ${pvName('Pressing Marshan')}.`
      + `\nRetrait dès maintenant.`
      + (due > 0 ? `\nSolde à régler au retrait : ${fmtMAD(due)}.` : '')
      + `\n·envoyé via Kiwi`;
  }
function openWa(o) {
    const el = $('#px-wam', root);
    const c = custOf(o);
    const photoPiece = o.pieces.find((p) => p.photos > 0) || o.pieces[0];
    let withPhoto = false;
    el.innerHTML = `
      <button class="px-modal-x" data-px-close aria-label="Fermer"><i data-lucide="x"></i></button>
      <h3 class="modal-title">WhatsApp, c'est prêt</h3>
      <p class="modal-subtle">${dataText(c.name)} ${c.phone ? `· ${esc(c.phone)}` : '· numéro manquant (passage)'}</p>
      <div class="px-wa-bubblewrap">
        <div class="px-wa-bubble">
          <textarea id="px-wa-text">${esc(waMessage(o))}</textarea>
          <div class="px-wa-meta">${pad2(new Date().getHours())}:${pad2(new Date().getMinutes())} ✓✓</div>
        </div>
      </div>
      <button class="px-wa-photo" id="px-wa-photo">
        <span class="th">${garmentIcon({ ...(ITEMS[photoPiece.itemId] || {}), variantId: photoPiece.variantId })}</span>
        <span class="l">Joindre une photo du vêtement fini, le client voit son linge avant de se déplacer</span>
        <span class="tick"><i data-lucide="check"></i></span>
      </button>
      <div class="px-sheet-foot">
        <button class="px-btn ghost" data-px-close>Plus tard</button>
        <button class="px-btn primary" id="px-wa-send" ${c.phone ? '' : 'disabled'}><i data-lucide="external-link"></i>Ouvrir WhatsApp</button>
      </div>`;
    openVeil('#px-wa-veil');
    icons();
    $$('[data-px-close]', el).forEach((b) => { b.onclick = () => closeVeil('#px-wa-veil'); });
    $('#px-wa-photo', el).onclick = () => {
      withPhoto = !withPhoto;
      $('#px-wa-photo', el).classList.toggle('on', withPhoto);
    };
    /* Ce bouton annonçait « WhatsApp envoyé » et marquait la commande notifiée
       alors qu'aucun message ne partait : le client attendait chez lui un
       message qui n'existait pas. Une page web ne peut pas envoyer un WhatsApp
       toute seule, on ouvre donc le brouillon pré-rempli (texte tel qu'édité) et
       c'est le pressing qui appuie sur envoyer. Le lien ne transporte pas la
       photo, on le dit au lieu de le prétendre. */
    $('#px-wa-send', el).onclick = () => {
      const txt = $('#px-wa-text', el);
      const body = txt ? txt.value : waMessage(o);
      const num = whatsappPhone(c.phone);
      if (!num) { toast(`Pas de numéro pour ${c.name}, ajoutez-le à sa fiche`); return; }
      o.draftOpenedAt = new Date();
      closeVeil('#px-wa-veil');
      queueIfOffline('Brouillon WhatsApp');
      let opened = null;
      const waUrl = 'https://wa.me/' + num + '?text=' + encodeURIComponent(body);
      try {
        if (window.KiwiApiBase && window.KiwiApiBase.native) {
          /* The app has no browser windows: the link goes straight to
             WhatsApp (window.open returns null there even on success). */
          window.open(waUrl, '_blank');
          opened = true;
        } else {
          opened = window.open('', '_blank');
          if (opened) {
            opened.opener = null;
            opened.location.href = waUrl;
          }
        }
      } catch (_) { toast('Impossible d\'ouvrir WhatsApp'); }
      if (!opened) { toast('WhatsApp n’a pas pu s’ouvrir, autorisez les fenêtres puis réessayez'); return; }
      toast(`Brouillon WhatsApp ouvert pour ${c.name}${withPhoto ? ' · joignez la photo dans WhatsApp' : ''}`);
      const foot = $('.px-sheet-foot', el);
      foot.innerHTML = `
        <button class="px-btn ghost" data-px-close>Pas encore envoyé</button>
        <button class="px-btn primary" id="px-wa-confirm"><i data-lucide="check"></i>Marquer prévenu</button>`;
      icons();
      $('[data-px-close]', foot).onclick = () => closeVeil('#px-wa-veil');
      $('#px-wa-confirm', foot).onclick = () => {
        if (!window.KiwiPressingOps.markNotified(o, window.KiwiCaissePairing?.staff?.() || window.KiwiStaff, 'whatsapp')) return;
        queueIfOffline('Notification WhatsApp confirmée');
        closeVeil('#px-wa-veil');
        toast(`${c.name} marqué comme prévenu`);
        refreshOps();
      };
    };
  }
  return Object.freeze({ payPill, matchesQuery, boardBucket, boardPriority, orderCard, renderBoard, openDetail, waMessage, openWa });
}
