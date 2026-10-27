/* Pressing pickup UI. Exports: create. Reads: the declared owner methods/context
 * below and live presentation bindings; no sibling module or private window state.
 * Browser reads: BarcodeDetector, KiwiCaissePairing, KiwiPressingOps, KiwiStaff.
 */
import { ITEMS, root } from './custody.js?v=4';
export function create(owner) {
  'use strict';
  const { $, $$, COLOR, ORDERS, boardBucket, catalogLabel, closeVeil, custOf, dataText, deliverOrder, esc, findOrder, findScannedOrder, fmtDT, fmtDay, fmtMAD, icons, isLiveOrder, matchesQuery, moveCaretEnd, openDetail, openPay, openVeil, openWa, orderStatus, orderTotals, publicOrderNo, publicPieceNo, queueIfOffline, refreshOps, renderBoard, state, svcCodes, toast } = owner.pickupContext();
function renderRetrait() {
    const panel = $('[data-px-panel="retrait"]', root);
    const q = state.rtQuery;
    const active = ORDERS.filter(isLiveOrder);
    /* Retrait is an operational queue, not an empty search page. With no query
       it shows every ready order; typing or scanning narrows the same truth. */
    const hits = q ? active.filter((o) => matchesQuery(o, q)) : active.filter((o) => orderStatus(o) === 'pret');
    const prets = hits.filter((o) => orderStatus(o) === 'pret');
    const others = q ? hits.filter((o) => orderStatus(o) !== 'pret') : [];
    panel.innerHTML = `
      <div class="px-retrait">
        <div class="px-rt-inner">
          <header class="px-head" style="padding:22px 0 0;">
            <div><h1>Retrait</h1><div class="px-head-sub">${prets.length} commande${prets.length > 1 ? 's' : ''} prête${prets.length > 1 ? 's' : ''} · recherchez, scannez, encaissez si nécessaire, puis confirmez la remise</div></div>
          </header>
          <div class="px-rt-search">
            <div class="px-phone-in"><i data-lucide="phone"></i>
              <input id="px-rt-q" inputmode="tel" placeholder="Téléphone, nom ou n° de ticket" value="${esc(q)}" autocomplete="off" /></div>
          </div>
          <div class="px-rt-or">ou</div>
          <button class="px-rt-scan" id="px-rt-scan"><i data-lucide="scan-line"></i>Scanner ticket ou étiquette</button>
          <div class="px-rt-results">
            ${prets.map(rtCard).join('')}
            ${others.map(rtCard).join('')}
            ${q && !hits.length ? `<div class="px-bempty" style="display:flex; flex-direction:column; align-items:center; padding:36px 16px;"><div style="width:40px; height:40px; border-radius:12px; background:rgba(11,110,79,0.10); color:var(--atlas); display:grid; place-items:center; margin-bottom:10px;"><svg width="20" height="20" viewBox="0 -960 960 960" fill="currentColor"><path d="M200-80q-33 0-56.5-23.5T120-160v-451q-18-11-29-28.5T80-680v-120q0-33 23.5-56.5T160-880h640q33 0 56.5 23.5T880-800v120q0 23-11 40.5T840-611v451q0 33-23.5 56.5T760-80H200Zm0-520v440h560v-440H200Zm-40-80h640v-120H160v120Zm200 280h240v-80H360v80Zm120 20Z"/></svg></div><div style="font-weight:600; color:var(--ink);">Rien pour « ${esc(q)} »</div><div style="font-size:12.5px; color:var(--n-500); margin-top:4px;">Vérifiez le numéro ou cherchez au tableau.</div></div>` : ''}
            ${!q && !prets.length ? `<div class="px-bempty" style="display:flex; flex-direction:column; align-items:center; padding:36px 16px;"><div style="width:40px; height:40px; border-radius:12px; background:rgba(11,110,79,0.10); color:var(--atlas); display:grid; place-items:center; margin-bottom:10px;"><svg width="20" height="20" viewBox="0 -960 960 960" fill="currentColor"><path d="M200-80q-33 0-56.5-23.5T120-160v-451q-18-11-29-28.5T80-680v-120q0-33 23.5-56.5T160-880h640q33 0 56.5 23.5T880-800v120q0 23-11 40.5T840-611v451q0 33-23.5 56.5T760-80H200Zm0-520v440h560v-440H200Zm-40-80h640v-120H160v120Zm200 280h240v-80H360v80Zm120 20Z"/></svg></div><div style="font-weight:600; color:var(--ink);">Aucune commande prête à remettre pour le moment.</div><div style="font-size:12.5px; color:var(--n-500); margin-top:4px;">Toutes les pièces traitées apparaîtront ici pour remise.</div></div>` : ''}
          </div>
        </div>
      </div>`;
    $('#px-rt-q', panel).oninput = (e) => {
      state.rtQuery = e.target.value;
      renderRetrait(); icons();
      const i = $('#px-rt-q', panel); i.focus(); moveCaretEnd(i);
    };
    $('#px-rt-scan', panel).onclick = () => openScan('pickup');
    $$('[data-px-rt-pay]', panel).forEach((b) => {
      b.onclick = () => {
        const o = findOrder(b.dataset.pxRtPay);
        openPay(o, { settle: true, onSettled: refreshOps });
      };
    });
    $$('[data-px-rt-give]', panel).forEach((b) => {
      b.onclick = () => deliverOrder(b.dataset.pxRtGive);
    });
    $$('[data-px-rt-wa]', panel).forEach((b) => {
      b.onclick = () => openWa(findOrder(b.dataset.pxRtWa));
    });
    $$('[data-px-rt-wa-confirm]', panel).forEach((b) => {
      b.onclick = () => {
        const o = findOrder(b.dataset.pxRtWaConfirm);
        if (!o) return;
        if (!window.KiwiPressingOps.markNotified(o, window.KiwiCaissePairing?.staff?.() || window.KiwiStaff, 'whatsapp')) return;
        queueIfOffline('Notification client confirmée');
        renderRetrait(); toast(`${publicOrderNo(o)}, marqué prévenu`);
      };
    });
    icons();
  }
function rtCard(o) {
    const c = custOf(o);
    const { total } = orderTotals(o);
    const due = o.pay.mode === 'compte' ? 0 : Math.max(0, total - o.pay.paid);
    const st = orderStatus(o);
    const early = st !== 'pret';
    return `<div class="px-rt-card">
      <div class="px-rt-top">
        <div class="px-rt-who"><b>${publicOrderNo(o)} · ${dataText(c.name)}</b><span>${c.phone ? esc(c.phone) + ' · ' : ''}déposé ${fmtDay(o.droppedAt)}${o.notified ? ' · notifié' : ''}</span></div>
        ${early ? `<span class="px-pill warn">Pas encore prêt, promis ${fmtDT(o.readyAt)}</span>` : `<div class="px-rt-slot ${o.rack ? '' : 'none'}">${o.rack ? `<b>${o.rack}</b><span>cintre</span>` : '<b>·</b><span>non rangé</span>'}</div>`}
      </div>
      <div class="px-rt-pieces">
        ${o.pieces.map((p) => {
          const care = [...(p.notes || []), p.freeNote].filter(Boolean);
          return `<div class="px-rt-piece"><i data-lucide="${early ? 'clock' : 'check-circle-2'}"></i><span>${catalogLabel({ ...ITEMS[p.itemId], label: p.label })} · ${esc((COLOR[p.color] || {}).label || 'Couleur non précisée')} · ${svcCodes(p.svcs)}${care.length ? `<small>Attention · ${care.map(esc).join(' · ')}</small>` : ''}</span><span class="pid">${publicPieceNo(o, p)}</span></div>`;
        }).join('')}
      </div>
      <div class="px-rt-balance ${due > 0 ? '' : 'paid'}">
        <span>${due > 0 ? 'Solde à encaisser' : o.pay.mode === 'compte' ? 'Sur compte B2B, facture fin de mois' : 'Déjà réglé'}</span>
        <span class="amt">${due > 0 ? fmtMAD(due) : '✓'}</span>
      </div>
      <div class="px-rt-actions">
        ${due > 0 ? `<button class="px-btn secondary" style="flex:1;" data-px-rt-pay="${o.id}"><i data-lucide="banknote"></i>Encaisser ${fmtMAD(due)}</button>` : ''}
        <button class="px-btn primary" style="flex:1;" data-px-rt-give="${o.id}" ${due > 0 ? 'disabled title="Encaissez le solde d’abord"' : ''}><i data-lucide="check"></i>Remettre au client</button>
        ${!early && !o.notified ? `<button class="px-btn ghost" data-px-rt-wa="${o.id}" title="Ouvrir le brouillon WhatsApp"><i data-lucide="message-circle"></i></button>` : ''}
        ${!early && o.draftOpenedAt && !o.notified ? `<button class="px-btn secondary" data-px-rt-wa-confirm="${o.id}"><i data-lucide="check-check"></i>Marquer prévenu</button>` : ''}
      </div>
    </div>`;
  }
let scannerStop = null;
function stopScanner() {
    if (!scannerStop) return;
    const stop = scannerStop; scannerStop = null;
    try { stop(); } catch (_) {}
  }
function acceptScan(raw) {
    const target = findScannedOrder(raw);
    if (!target) { toast('Code inconnu · vérifiez le ticket ou l’étiquette'); return false; }
    if (orderStatus(target) === 'annule') { toast(`${publicOrderNo(target)} a été annulée`); return false; }
    if (orderStatus(target) === 'livre' && state.scanMode !== 'workflow') { toast(`${publicOrderNo(target)} a déjà été remis au client`); return false; }
    stopScanner();
    closeVeil('#px-scan-veil');
    if (state.scanMode === 'workflow') {
      state.boardFilter = boardBucket(target);
      state.boardQuery = target.id;
      renderBoard(); icons();
      openDetail(target.id);
      toast(`${publicOrderNo(target)} · Kiwi propose la prochaine action utile`);
      return true;
    }
    state.rtQuery = publicOrderNo(target);
    renderRetrait(); icons();
    toast(`Étiquette lue, ${publicOrderNo(target)}${target.rack ? ' · cintre ' + target.rack : ''}`);
    return true;
  }
async function startCameraScan(el) {
    if (!navigator.mediaDevices?.getUserMedia || !window.BarcodeDetector) {
      toast('Caméra-scanner indisponible · utilisez la douchette ou saisissez le code');
      return;
    }
    stopScanner();
    try {
      const supported = window.BarcodeDetector.getSupportedFormats
        ? await window.BarcodeDetector.getSupportedFormats() : ['code_39', 'code_128', 'qr_code'];
      const formats = ['code_39', 'code_128', 'qr_code'].filter((f) => supported.includes(f));
      if (!formats.length) throw new Error('format');
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      if (!$('#px-scan-veil', root).classList.contains('is-open')) { stream.getTracks().forEach((t) => t.stop()); return; }
      const stage = $('#px-scan-stage', el);
      stage.innerHTML = '<video id="px-scan-video" playsinline muted style="width:100%;height:100%;object-fit:cover"></video><div class="px-scan-laser"></div>';
      const video = $('#px-scan-video', el);
      video.srcObject = stream;
      await video.play();
      const detector = new window.BarcodeDetector({ formats });
      let live = true;
      scannerStop = () => { live = false; stream.getTracks().forEach((t) => t.stop()); };
      const frame = async () => {
        if (!live) return;
        try {
          const hits = await detector.detect(video);
          if (hits && hits[0] && acceptScan(hits[0].rawValue)) return;
        } catch (_) {}
        if (live) requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    } catch (_) {
      stopScanner();
      toast('Caméra non ouverte · autorisez-la ou utilisez la douchette');
    }
  }
function openScan(mode = 'pickup') {
    stopScanner();
    state.scanMode = mode === 'workflow' ? 'workflow' : 'pickup';
    const el = $('#px-scanm', root);
    const workflow = state.scanMode === 'workflow';
    el.innerHTML = `
      <button class="px-modal-x" id="px-scan-close" aria-label="Fermer"><i data-lucide="x"></i></button>
      <h3 class="modal-title">${workflow ? 'Avancer une commande' : 'Scanner ticket ou étiquette'}</h3>
      <p class="modal-subtle">${workflow ? 'Scannez depuis l’atelier : Kiwi ouvre la commande et propose l’action utile. Rien ne change sans votre validation.' : 'La douchette saisit le code automatiquement. Sur téléphone, utilisez la caméra si elle est disponible.'}</p>
      <div class="px-scan-stage" id="px-scan-stage"><i data-lucide="scan-line" style="width:58px;height:58px;color:var(--mint)"></i></div>
      <div class="cash-input-row"><label class="cash-input-label" for="px-scan-input">N° commande ou étiquette</label>
        <input class="cash-input mono" id="px-scan-input" autocomplete="off" inputmode="numeric" placeholder="1054 ou 1054-1" />
      </div>
      <div class="px-sheet-foot" style="margin-top:12px">
        <button class="px-btn secondary" id="px-scan-camera"><i data-lucide="camera"></i>Caméra</button>
        <button class="px-btn primary" id="px-scan-accept"><i data-lucide="scan-line"></i>Lire le code</button>
      </div>`;
    openVeil('#px-scan-veil');
    icons();
    const input = $('#px-scan-input', el);
    $('#px-scan-close', el).onclick = () => { stopScanner(); closeVeil('#px-scan-veil'); };
    $('#px-scan-accept', el).onclick = () => acceptScan(input.value);
    $('#px-scan-camera', el).onclick = () => startCameraScan(el);
    input.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); acceptScan(input.value); } };
    setTimeout(() => input.focus(), 50);
  }
  return Object.freeze({ renderRetrait, rtCard, stopScanner, acceptScan, startCameraScan, openScan });
}
