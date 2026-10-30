import { saleClient, root, state, businessDateKey, shiftDateKey, RETAIN_DAYS, SALES, activeAvoirs, AVOIRS, findSale, toast, whenLabel, P, ensureOriginalSale, stableRefundId, IS_DEMO, merchantSlug, recordReturn, refreshOps, switchView, issueAvoir, stableCreditIssueId, creditErrorDetail, persistStock, persistDay, openVeil, closeVeil, lineDeal, pieceUnitPrice, queueIfOffline, renderBadges, nextStandaloneTicketNumber, firstName, newSaleId, STAFF, bqSaveProvisional, bqPaymentMethod, bqPost, bqPaymentParts, headSubVente, pvPaired, payExistingBalance, creditIntent, creditRequest, creditFromServer, persistAvoirs, avoirExpired, refreshRemoteAvoirs, BY_EAN , originalSalePayload } from '../pos-maison.js?v=142';
import { $, esc, fmtMAD, icons, moveCaretEnd, artOf, colorDot, useKiwiCl, releaseStock, fmtDayY, fmtValidUntil, barcode, $$, colorLabel, holdStock, renderExchNote, renderGrid, canHoldStock, rayonOf, fmtDT, clById, clientList, printDeliveryNoteNow, lookupScan, commitEan } from './sales.js?v=59';
import { invSetModal, openInvProduct, intake, intakeReset, intakeTake } from './inventory.js?v=59';
import '../refund-split.js?v=2';
import '../money-cents.js?v=4';
import { mzDeliveryCard } from './delivery.js?v=14';


  /* ═══════════════════════ ÉCHANGES & AVOIRS (signature) ═══════════════════ */
  function saleMatches(s, q) {
    if (!q) return true;
    const ql = q.toLowerCase();
    const digits = q.replace(/\D/g, '');
    const c = saleClient(s);
    return s.id.toLowerCase().includes(ql) ||
      (c && c.name.toLowerCase().includes(ql)) ||
      (c && digits.length >= 2 && c.phone.replace(/\D/g, '').includes(digits));
  }

  function renderEchanges() {
    const panel = $('[data-mz-panel="echanges"]', root);
    const q = state.retQuery;
    /* Une vente sortie des livres ne se retourne pas : elle n'a plus eu lieu, sa
       marchandise est déjà revenue en stock, et l'échanger créerait un avoir
       adossé à un encaissement que le serveur ne connaît plus. */
    const dateKey = businessDateKey;
    const todayKey = dateKey(Date.now());
    const yesterdayKey = shiftDateKey(todayKey, -1), oldestKey = shiftDateKey(todayKey, -(RETAIN_DAYS - 1));
    if (state.retDate < oldestKey || state.retDate > todayKey) state.retDate = todayKey;
    const hits = SALES.filter((s) => !s.voided && dateKey(s.at) === state.retDate && saleMatches(s, q));
    const ret = state.ret;
    panel.innerHTML = `
      <div class="mz-ret mz-page">
        <header class="mz-head">
          <div><h1>Retours, remboursements &amp; avoirs</h1><div class="mz-head-sub">Avoir boutique ou remboursement sur le moyen d’origine · remboursement protégé par un responsable</div></div>
          <div class="mz-search"><i data-lucide="search"></i>
            <input id="mz-ret-q" placeholder="N° de ticket ou téléphone…" value="${esc(q)}" /></div>
        </header>
        <div class="mz-ret-bar mz-page-toolbar">
          <button class="mz-pill ${state.retDate === todayKey ? 'ok' : ''}" type="button" data-mz-ret-day="${todayKey}">Aujourd'hui</button>
          <button class="mz-pill ${state.retDate === yesterdayKey ? 'ok' : ''}" type="button" data-mz-ret-day="${yesterdayKey}">Hier</button>
          <label class="mz-ret-bar-lbl">Date
            <input id="mz-ret-date" type="date" min="${oldestKey}" max="${todayKey}" value="${state.retDate}" />
          </label>
        </div>
        <div class="mz-ret-scroll"><div class="mz-ret-inner">
          ${activeAvoirs().length ? `
            <div class="mz-ret-bar" style="margin-top:14px;">
              <div class="mz-ret-bar-lbl">Avoirs actifs · ${activeAvoirs().length}</div>
              ${activeAvoirs().map((a) => `
                <button class="mz-favoir" data-mz-av="${a.code}" style="margin-bottom:6px;">
                  <i data-lucide="ticket"></i><b>${a.code}</b> · ${fmtMAD(a.balance)}, ${esc(a.holderName)}<span class="see">Voir</span>
                </button>`).join('')}
            </div>` : ''}
          ${hits.map((s) => saleCard(s, ret)).join('') || (String(q).trim()
            ? `<div class="mz-empty">Rien pour « ${esc(q)} », vérifiez le n° de ticket ou le téléphone.</div>`
            /* Rien tapé encore : une boutique sans vente du jour ouvrait cette page
               sur « Rien pour «  » », un échec de recherche que personne n'a lancée. */
            : `<div class="mz-empty">Scannez le ticket de la cliente, ou tapez son numéro de téléphone.</div>`)}
        </div></div>
      </div>`;
    $('#mz-ret-q', panel).oninput = (e) => {
      state.retQuery = e.target.value;
      renderEchanges(); icons();
      const i = $('#mz-ret-q', panel); i.focus(); moveCaretEnd(i);
    };
    $('#mz-ret-date', panel).onchange = (e) => {
      state.retDate = String(e.target.value || todayKey);
      state.ret = null;
      renderEchanges(); icons();
    };
    panel.onclick = (e) => {
      const dayB = e.target.closest('[data-mz-ret-day]');
      if (dayB) { state.retDate = dayB.dataset.mzRetDay; state.ret = null; renderEchanges(); icons(); return; }
      const avB = e.target.closest('[data-mz-av]');
      if (avB) { openVoucher(AVOIRS.find((a) => a.code === avB.dataset.mzAv), { mode: 'view' }); return; }
      const qtyB = e.target.closest('[data-mz-ret-qty]');
      if (qtyB && state.ret) {
        const [saleId, idxS, deltaS] = qtyB.dataset.mzRetQty.split(':');
        const idx = Number(idxS), sale = findSale(saleId);
        if (sale && state.ret.saleId === saleId && state.ret.picks.has(idx)) {
          const current = pickedQty(state.ret, idx, sale.lines[idx]);
          state.ret.quantities.set(idx, Math.max(1, Math.min(lineAvailableQty(sale.lines[idx]), current + Number(deltaS))));
          renderEchanges(); icons();
        }
        return;
      }
      const lnB = e.target.closest('[data-mz-pick]');
      if (lnB) { togglePick(lnB.dataset.mzPick); return; }
      const lockB = e.target.closest('[data-mz-locked]');
      if (lockB) { toast('Pièce déjà retournée, rien à reprendre dessus'); return; }
      const motif = e.target.closest('[data-mz-motif]');
      if (motif && state.ret) { state.ret.motif = motif.dataset.mzMotif; renderEchanges(); icons(); return; }
      const exch = e.target.closest('[data-mz-do-exch]');
      if (exch) { doExchange(); return; }
      const avoir = e.target.closest('[data-mz-do-avoir]');
      if (avoir) { void doAvoir(); return; }
      const refund = e.target.closest('[data-mz-do-refund]');
      if (refund) { void doRefund(); return; }
    };
    icons();
  }

  const MOTIFS = ['Taille', 'Couleur', 'Défaut', 'Changement d\'avis'];

  /* A ticket line can contain several identical pieces. Older tickets only
     carried the boolean `returned`; keep understanding that format while new
     returns remember exactly how many pieces came back. */
  function lineReturnedQty(ln) {
    const sold = Math.max(0, Number(ln && ln.qty) || 0);
    if (ln && ln.returned) return sold;
    return Math.max(0, Math.min(sold, Number(ln && ln.returnedQty) || 0));
  }
  function lineAvailableQty(ln) { return Math.max(0, (Number(ln && ln.qty) || 0) - lineReturnedQty(ln)); }
  function pickedQty(ret, idx, ln) {
    const wanted = ret && ret.quantities && ret.quantities.get(idx);
    return Math.max(1, Math.min(lineAvailableQty(ln), Number(wanted) || 1));
  }
  function markLineReturned(ln, qty, note) {
    const next = Math.min(Number(ln.qty) || 0, lineReturnedQty(ln) + Math.max(0, Number(qty) || 0));
    ln.returnedQty = next;
    ln.returned = next >= (Number(ln.qty) || 0);
    ln.note = note;
  }

  /* ── Ce qui se REND, c'est ce que la cliente a PAYÉ ──
     La récompense fidélité baisse le TICKET (rewardDiscount), pas les lignes :
     `unit` reste le prix de la ligne avant cette baisse. Rembourser `unit`
     rendait donc plus que ce que la cliente avait déboursé, d'autant plus que le
     retour est partiel. Le prix rendu est `unit` ramené au ratio payé / somme des
     lignes, arrondi vers le bas au centime : la somme des retours d'un ticket ne
     dépasse jamais ce qu'il a encaissé, au dirham près que le serveur plafonne.
     Un ticket sans récompense garde ratio 1, donc `unit` à l'identique. */
  function returnRatio(sale) {
    if (!sale || !sale.reward) return 1;
    const gross = (sale.lines || []).reduce((sum, l) => sum + (+l.unit || 0) * (+l.qty || 0), 0);
    const paid = sale.balanceTotal != null ? +sale.balanceTotal : +sale.total;
    if (!(gross > 0) || !Number.isFinite(paid) || paid < 0 || paid >= gross) return 1;
    return paid / gross;
  }
  function paidUnit(sale, ln) {
    const unit = +(ln && ln.unit) || 0;
    const ratio = returnRatio(sale);
    return ratio >= 1 ? unit : Math.floor(unit * ratio * 100) / 100;
  }

  function saleCard(s, ret) {
    const c = saleClient(s);
    const sel = ret && ret.saleId === s.id ? ret.picks : new Set();
    const selVal = s.lines.reduce((t, l, i) => t + (sel.has(i) ? paidUnit(s, l) * pickedQty(ret, i, l) : 0), 0);
    const hasRet = s.lines.some((l) => lineReturnedQty(l) > 0);
    return `<div class="mz-sale">
      <div class="mz-sale-top">
        <span class="mz-sale-num">${s.id}</span>
        <!-- whenLabel et non fmtHM : la liste couvre la semaine, et « 14:32 »
             tout court ne dit pas si la vente est de ce matin ou de mardi. -->
        <span class="mz-sale-when">${whenLabel(s.at)} · par ${esc(s.by)}</span>
        <span class="mz-pill ${s.kind === 'echange' ? 'warn' : 'ok'}">${s.kind === 'echange' ? 'échange' : esc(s.methods)}</span>
        ${hasRet ? '<span class="mz-pill warn">retour</span>' : ''}
        ${s.kind === 'acompte' ? '<span class="mz-pill warn">Acompte · retour suspendu, contacter le responsable</span>' : ''}
        <span class="mz-sale-who"><i data-lucide="${c ? 'user' : 'users'}"></i>${c ? esc(c.name) : 'Cliente de passage'} · ${fmtMAD(s.total)}</span>
      </div>
      <div class="mz-sale-lines">
        ${s.lines.map((l, i) => {
          /* Le journal couvre la semaine : un article vendu mardi peut avoir été
             supprimé du catalogue depuis. Sans ce repli, P[l.pid] valait
             undefined et TOUTE la page des échanges se vidait — donc plus aucun
             retour possible, y compris sur les ventes intactes. Le nom du
             produit est retrouvé dans la ligne de vente quand il y est, sinon on
             le dit franchement ; le montant payé, lui, vient de la ligne et
             reste toujours juste. */
          const p = P[l.pid] || { name: l.name || 'Article retiré du catalogue', art: '' };
          const returnedQty = lineReturnedQty(l);
          const availableQty = lineAvailableQty(l);
          if (!availableQty) {
            return `<button class="mz-sline is-locked" data-mz-locked="1">
              <span class="tick"></span>
              <span class="mz-line-art">${artOf(p)}</span>
              <span class="mid"><span class="mz-line-name">${esc(p.name)}</span>
                <span class="mz-line-sub"><span class="sz">${esc(l.size)}</span> ${esc(l.note || 'retournée')}</span></span>
              <span class="mz-pill warn">retournée</span>
            </button>`;
          }
          const chosenQty = sel.has(i) ? pickedQty(ret, i, l) : 1;
          return `<button class="mz-sline ${sel.has(i) ? 'on' : ''}" data-mz-pick="${s.id}:${i}">
            <span class="tick"><i data-lucide="check"></i></span>
            <span class="mz-line-art">${artOf(p)}</span>
            <span class="mid"><span class="mz-line-name">${esc(p.name)}</span>
              <span class="mz-line-sub">
                ${colorDot(l.color)}
                <span class="sz">${esc(l.size)}</span> ${availableQty > 1 ? `× ${availableQty} disponibles` : ''} ${returnedQty ? `· ${returnedQty} déjà retournée${returnedQty > 1 ? 's' : ''}` : ''} ${l.remise ? `· remise −${l.remise} %` : ''}
              </span></span>
            <span class="amt">${fmtMAD(paidUnit(s, l) * availableQty)}</span>
          </button>${sel.has(i) && availableQty > 1 ? `
            <div class="mz-ret-qty" style="display:flex;align-items:center;justify-content:flex-end;gap:10px;padding:7px 12px 10px;">
              <span style="font-size:12px;color:var(--ink-3);">Quantité à retourner</span>
              <button class="mz-chip" type="button" data-mz-ret-qty="${s.id}:${i}:-1" aria-label="Retirer une pièce">−</button>
              <b>${chosenQty}</b>
              <button class="mz-chip" type="button" data-mz-ret-qty="${s.id}:${i}:1" aria-label="Ajouter une pièce">+</button>
              <strong>${fmtMAD(paidUnit(s, l) * chosenQty)}</strong>
            </div>` : ''}`;
        }).join('')}
      </div>
      ${sel.size ? `
      <div class="mz-ret-bar">
        <div class="mz-ret-bar-lbl">Motif du retour</div>
        <div class="mz-chips">
          ${MOTIFS.map((m) => `<button class="mz-chip ${ret.motif === m ? 'on' : ''}" data-mz-motif="${esc(m)}">${esc(m)}</button>`).join('')}
        </div>
        ${refundPreviewHTML(s, ret, selVal)}
        <div class="mz-ret-actions">
          <button class="mz-btn secondary" data-mz-do-exch><i data-lucide="arrow-left-right"></i>Échanger la pièce</button>
          <button class="mz-btn secondary" data-mz-do-refund ${state.retBusy ? 'disabled aria-busy="true"' : ''}><i data-lucide="credit-card"></i>Rembourser sur le moyen d’origine · ${fmtMAD(selVal)}</button>
          <button class="mz-btn primary" data-mz-do-avoir ${state.retBusy ? 'disabled aria-busy="true"' : ''}><i data-lucide="ticket"></i>${state.retBusy ? 'Émission en cours…' : `Émettre un avoir · ${fmtMAD(selVal)}`}</button>
        </div>
      </div>` : ''}
    </div>`;
  }

  /* ── CE QUE LE REMBOURSEMENT FERA, DIT AVANT L'ACCORD ──
     Depuis le 22 octobre, le serveur rend l'argent dans le moyen choisi, puis
     recrédite les avoirs qui avaient payé le ticket pour ce qui dépasse.
     L'ancien écran annonçait un seul versement (« 120 MAD · carte ») alors que
     le serveur pouvait écrire 80 carte + 40 sur l'avoir AV-… : la caissière
     rendait au mauvais endroit. L'aperçu applique maintenant la MÊME règle que
     le serveur (assets/refund-split.js) : l'argent du ticket tel que le serveur
     l'a reçu (originalSalePayload), ses avoirs par code, et ce que ce ticket a
     déjà rendu. Le reçu, lui, imprime ce que le serveur a réellement fait. */
  const PAYOUT_SRV = { 'carte': 'card', 'espèces': 'cash', 'virement': 'transfer', 'chèque': 'cheque' };
  const PAYOUT_FR = { card: 'carte', cash: 'espèces', transfer: 'virement', cheque: 'chèque' };
  const PAYOUT_LABEL = { 'carte': 'Rendu sur la carte', 'espèces': 'Rendu en espèces', 'virement': 'Rendu par virement', 'chèque': 'Rendu par chèque' };
  function refundPayout(sale) {
    const paid = (sale.parts || []).filter(part => part && part.m !== 'avoir' && part.m !== 'livraison');
    const preferred = ['carte', 'espèces', 'virement', 'chèque'].find(method => paid.some(part => part.m === method));
    return preferred || (String(sale.methods || '').includes('carte') ? 'carte' : 'espèces');
  }
  /* Allocations (serveur ou aperçu) → lignes de reçu de la caisse. */
  function refundRows(allocations) {
    return (allocations || []).filter(p => p && Number(p.amountCents) > 0).map(p => p.method === 'credit'
      ? { m: 'avoir', code: String(p.code || p.creditId || ''), amount: Number(p.amountCents) / 100 }
      : { m: PAYOUT_FR[p.method] || 'espèces', amount: Number(p.amountCents) / 100 });
  }
  function refundPreview(sale, amount) {
    const split = globalThis.KiwiRefundSplit;
    if (!split || !sale || !(amount > 0)) return null;
    const payout = refundPayout(sale);
    let moneyCents = 0;
    try { const payload = originalSalePayload(sale); moneyCents = payload ? Number(payload.amountCents) || 0 : 0; } catch (_) {}
    const plan = split.preview({
      moneyCents, credits: split.creditsFromParts(sale.parts), method: PAYOUT_SRV[payout],
      previousCents: Number(sale.refundedCents) || 0, amountCents: Math.round(amount * 100),
    });
    return { payout, plan, rows: refundRows(plan.allocations) };
  }
  function refundPreviewHTML(sale, ret, amount) {
    if (!ret || !ret.picks || sale.kind === 'acompte') return '';
    if (Array.from(ret.picks).some(i => sale.lines[i] && sale.lines[i].consigned)) return '';
    const pv = refundPreview(sale, amount);
    if (!pv) return '';
    const total = pv.rows.reduce((sum, r) => sum + r.amount, 0);
    return `<div class="mz-ret-bar-lbl" style="margin-top:11px;">En cas de remboursement</div>
        <div class="mz-pay-break" data-mz-refund-preview>
          ${pv.rows.map(r => `<div class="row"><span>${r.m === 'avoir' ? `<span>Recrédité sur l’avoir</span> ${esc(r.code)}` : `<span>${PAYOUT_LABEL[r.m] || 'Rendu en espèces'}</span>`}</span><b>${fmtMAD(r.amount)}</b></div>`).join('')}
          ${pv.plan.leftCents > 0 ? `<div class="row"><span>Déjà remboursé, refusé</span><b>${fmtMAD(pv.plan.leftCents / 100)}</b></div>` : ''}
          <div class="row"><span>Total remboursé</span><b>${fmtMAD(total)}</b></div>
        </div>`;
  }

  async function doRefund() {
    const ret = state.ret;
    if (!ret || state.retBusy) return;
    const sale = findSale(ret.saleId);
    if (!sale) return;
    /* Même garde que l'avoir et l'échange : un ticket d'acompte n'a encaissé
       qu'une partie de son prix, rendre ses lignes au prix plein rembourserait
       un solde que la cliente n'a pas versé. */
    if (sale.kind === 'acompte') { toast('Retour suspendu sur un acompte'); return; }
    const idxs = Array.from(ret.picks);
    const quantities = new Map(idxs.map((i) => [i, pickedQty(ret, i, sale.lines[i])]));
    const amount = idxs.reduce((sum, i) => sum + paidUnit(sale, sale.lines[i]) * quantities.get(i), 0);
    if (!amount) return;
    const consignedSelected = idxs.some((i) => sale.lines[i] && sale.lines[i].consigned);
    if (consignedSelected) {
      toast('Remboursement original indisponible pour la catégorie B', 5200, 'warn', 'Émettez un avoir boutique pour les articles en dépôt-vente.');
      return;
    }
    const motif = ret.motif || 'Non précisé';
    const resellable = motif !== 'Défaut';
    state.retBusy = true; renderEchanges(); icons();
    let originalSaleId;
    try { originalSaleId = await ensureOriginalSale(sale); }
    catch (_) {
      state.retBusy = false; renderEchanges(); icons();
      toast('Remboursement suspendu', 5200, 'danger', 'La vente d’origine n’a pas pu être vérifiée. Rien n’a été remis en stock.');
      return;
    }
    const refundId = stableRefundId(sale, quantities, amount * 100);
    const preview = refundPreview(sale, amount);
    const payout = preview ? preview.payout : refundPayout(sale);
    const refundMethod = PAYOUT_SRV[payout];
    /* Le responsable accorde ce qui va se passer, pas un versement unique. */
    const planned = preview && preview.rows.length ? preview.rows : [{ m: payout, amount }];
    const said = planned.map(r => r.m === 'avoir' ? `avoir ${r.code} ${fmtMAD(r.amount)}` : `${r.m} ${fmtMAD(r.amount)}`).join(' + ');
    state.retBusy = false; renderEchanges(); icons();
    if (typeof window.requireManager !== 'function') {
      toast('Autorisation responsable indisponible', 5200, 'danger');
      return;
    }
    if (window.KiwiAuthAct) window.KiwiAuthAct({ kind: 'refund', key: 'act.refund', args: { amount: fmtMAD(amount) } });
    window.requireManager(`Remboursement ${fmtMAD(amount)} · ${said} · ticket ${sale.id}`, async (manager) => {
      state.retBusy = true; renderEchanges(); icons();
      try {
        let done = planned;
        if (!IS_DEMO) {
          const response = await fetch('/api/sale/refund', {
            method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({
              merchant: merchantSlug(), id: refundId, originalSaleId, amountCents: Math.round(amount * 100), refundMethod,
              ref: `REM-${sale.id}`, reason: motif, approval: manager && manager.approval,
            }),
          });
          let data = null; try { data = await response.json(); } catch (_) {}
          if (!response.ok || !data || data.error) {
            const error = new Error((data && data.error) || `http-${response.status}`);
            error.code = (data && data.error) || `http-${response.status}`; throw error;
          }
          /* Le reçu dit ce que le serveur a fait, au centime, même si une autre
             caisse avait déjà rendu une partie de ce ticket. */
          if (Array.isArray(data.allocations) && data.allocations.length) done = refundRows(data.allocations);
          if (done.some(r => r.m === 'avoir')) refreshRemoteAvoirs();
        }
        sale.refundedCents = (Number(sale.refundedCents) || 0) + Math.round(amount * 100);
        if (resellable) restoreLines(sale, idxs, quantities, `remboursement (${motif.toLowerCase()})`);
        else markDamagedLines(sale, idxs, quantities, `retour non revendable (${motif.toLowerCase()})`);
        recordReturn(sale, idxs, amount, motif, resellable ? 'refund' : 'refund-damaged', refundId, quantities);
        state.ret = null; refreshOps();
        printReceiptNow({
          ref: `REM-${sale.id}`, title: 'Remboursement', amount,
          lines: idxs.map((i) => ({ qty: quantities.get(i), name: sale.lines[i].name || (P[sale.lines[i].pid] && P[sale.lines[i].pid].name) || 'Article', amount: paidUnit(sale, sale.lines[i]) * quantities.get(i), ref: sale.lines[i].pid })),
          customer: saleClient(sale) ? { name: saleClient(sale).name, phone: saleClient(sale).phone } : null,
        }, done);
        toast('Remboursement enregistré', 4200, 'success', `${fmtMAD(amount)} · accord ${manager && manager.name ? manager.name : 'responsable'}`);
      } catch (error) {
        const detail = error && error.code === 'refund-exceeds-sale'
          ? 'Le montant disponible sur cette vente a déjà été remboursé.'
          : 'Le registre financier a refusé l’opération. Rien n’a été remis en stock.';
        toast('Remboursement non effectué', 5200, 'danger', detail);
      } finally {
        state.retBusy = false; renderEchanges(); icons();
      }
    }, { kind: 'refund', refundId, originalSaleId, amountCents: Math.round(amount * 100), refundMethod });
  }

  function togglePick(key) {
    const [saleId, idxS] = key.split(':');
    if (findSale(saleId)?.kind === 'acompte') {
      toast('Retour suspendu : cette vente a plusieurs reçus d’acompte. Contacter le responsable.'); return;
    }
    const idx = +idxS;
    /* Pas de motif par défaut. Le champ démarrait sur « Taille » : une vendeuse
       qui ne touchait aucune puce classait quand même le retour en problème de
       taille — et c'est exactement la statistique que la patronne lit dans le
       registre des retours pour décider quoi racheter. Tant que personne n'a
       choisi, le registre dit « Non précisé ». */
    if (!state.ret || state.ret.saleId !== saleId) state.ret = { saleId, picks: new Set(), quantities: new Map(), motif: null };
    const picks = state.ret.picks;
    if (picks.has(idx)) { picks.delete(idx); state.ret.quantities.delete(idx); }
    else { picks.add(idx); state.ret.quantities.set(idx, 1); }
    if (!picks.size) state.ret = null;
    renderEchanges(); icons();
  }

  function doExchange() {
    const ret = state.ret;
    if (!ret) return;
    if (ret.picks.size !== 1) { toast('L\'échange se fait pièce par pièce, gardez une seule ligne cochée'); return; }
    const idx = ret.picks.values().next().value;
    const sale = findSale(ret.saleId);
    if (sale?.kind === 'acompte') { toast('Retour suspendu sur un acompte'); return; }
    const ln = sale.lines[idx];
    const qty = pickedQty(ret, idx, ln);
    if (qty !== 1) { toast('L\'échange se fait une pièce à la fois, choisissez la quantité 1'); return; }
    /* Le motif choisi sur la fiche de retour suit l'échange jusqu'au registre :
       sans lui, tout échange y était classé « Echange », c'est-à-dire rien —
       la colonne motif répétait la colonne type et le registre ne disait plus
       pourquoi la pièce était revenue. */
    state.exchange = { saleId: ret.saleId, idx, qty: 1, motif: ret.motif || '' };
    state.ret = null;
    switchView('vente');
    toast(`Échange ${sale.id}, choisissez l'article de remplacement dans la grille`);
  }

  async function doAvoir() {
    const ret = state.ret;
    if (!ret || state.retBusy) return;
    const sale = findSale(ret.saleId);
    if (sale?.kind === 'acompte') { toast('Retour suspendu sur un acompte'); return; }
    if (!sale) return;
    const idxs = Array.from(ret.picks);
    const quantities = new Map(idxs.map((i) => [i, pickedQty(ret, i, sale.lines[i])]));
    const amount = idxs.reduce((t, i) => t + paidUnit(sale, sale.lines[i]) * quantities.get(i), 0);
    if (!amount) return;
    /* `ret.motif` vaut null tant qu'aucune puce n'a été choisie : on l'écrit tel
       quel plutôt que d'inventer un motif que personne n'a donné. */
    const motif = ret.motif || 'Non précisé';
    const c = saleClient(sale);
    const resellable = motif !== 'Défaut';
    state.retBusy = true;
    renderEchanges(); icons();
    try {
      /* The credit is booked before stock or the local sale changes.  A lost
         connection therefore leaves the return untouched, not a free item in
         stock with no liability recorded. */
      const originalSaleId = sale.serverId || sale.syncId || sale.id;
      const av = await issueAvoir(amount, c, `${motif}, retour ${sale.id}`, originalSaleId, {
        requestId: stableCreditIssueId(sale, quantities, amount * 100),
        originalRef: sale.num || sale.id, resellable, originalSale: sale,
        lines: idxs.map((i) => ({
          itemId: sale.lines[i].pid, variantId: sale.lines[i].variantId || '',
          name: (P[sale.lines[i].pid] && P[sale.lines[i].pid].name) || sale.lines[i].name || 'Article',
          size: sale.lines[i].size || '', qty: quantities.get(i), unitCents: Math.round(paidUnit(sale, sale.lines[i]) * 100),
        })),
      });
      if (resellable) restoreLines(sale, idxs, quantities, `avoir (${motif.toLowerCase()})`);
      else markDamagedLines(sale, idxs, quantities, `retour abîmé (${motif.toLowerCase()})`);
      recordReturn(sale, idxs, amount, motif, resellable ? 'avoir' : 'avoir-damaged', av.code, quantities);
      /* L'argent rendu en avoir sort de la dépense et des points de la cliente ;
         l'avoir dépensé plus tard y rentrera, une seule fois. Clé = le code de
         l'avoir : un double clic ne reprend pas deux fois (même geste que la
         caisse boutique). */
      if (c && useKiwiCl() && window.KiwiClients && window.KiwiClients.recordRefund) {
        try {
          window.KiwiClients.recordRefund(c.id, { amount, saleRef: sale.id, eventRef: av.code,
            items: idxs.map((i) => ({ name: (P[sale.lines[i].pid] && P[sale.lines[i].pid].name) || sale.lines[i].name || 'Article', qty: Number(quantities.get(i)) || 1, id: sale.lines[i].pid || '' })) });
        } catch (_) {}
      } else if (c && !useKiwiCl()) {
        c.spent = Math.max(0, (Number(c.spent) || 0) - amount);
      }
      state.ret = null;
      refreshOps();
      openVoucher(av, { mode: 'fresh' });
    } catch (error) {
      toast('Avoir non émis', 5200, 'danger', creditErrorDetail(error));
    } finally {
      state.retBusy = false;
      if (state.ret) { renderEchanges(); icons(); }
    }
  }

  function restoreLines(sale, idxs, quantities, note) {
    idxs.forEach((i) => {
      const ln = sale.lines[i];
      const qty = Math.min(lineAvailableQty(ln), Number(quantities.get(i)) || 0);
      if (!qty) return;
      markLineReturned(ln, qty, note);
      /* Une pièce rendue retourne au dépareillé ; le catalogue ne rebouge que
         si le retour reconstitue un set entier. */
      const back = releaseStock(ln.pid, ln.size, qty, ln.isPiece);
      persistStock(ln.pid, ln.size, ln.color, back, { ref: sale.num || sale.id, why: 'retour' });
    });
    persistDay();  // le retour change la recette du jour, pas seulement l'affichage
  }

  function markDamagedLines(sale, idxs, quantities, note) {
    idxs.forEach((i) => {
      const ln = sale.lines[i];
      const qty = Math.min(lineAvailableQty(ln), Number(quantities.get(i)) || 0);
      if (!qty) return;
      const afterReturned = lineReturnedQty(ln) + qty;
      markLineReturned(ln, qty, note);
      /* Non revendable does not mean physically absent. Keep it out of the
         sellable catalogue, but put the returned unit in a dedicated damaged
         location in the durable movement ledger. The deterministic id makes a
         retry harmless. */
      try {
        window.KiwiInventory?.add?.({
          id: `damaged-${String(sale.serverId || sale.syncId || sale.id).replace(/[^A-Za-z0-9._-]/g, '').slice(0, 40)}-${i}-${afterReturned}`,
          itemId: ln.pid, variantId: ln.variantId || '', locationId: 'damaged', qty,
          reason: 'sale-reversal', refType: 'damaged-return', refId: sale.num || sale.id,
          note: note || 'Retour non revendable', actor: (window.KiwiStaff && window.KiwiStaff.name) || 'Caisse',
          meta: { stockStatus: 'damaged', resellable: false },
        });
      } catch (_) {}
    });
    /* The unit physically came back but is not sellable.  The sale remains
       reduced while catalogue stock stays unchanged; the return audit carries
       resellable=false through the server credit event. */
    persistDay();
  }

  /* ---------- voucher print preview (modeled on the pressing tags) ------- */
  // Real boutique identity from the pairing / hosted session — the printed credit
  // note (BON D'AVOIR) shows the real store name+city, never the demo "Maison
  // Mansour" / its street address. Local demo (unpaired) unchanged.
  function bqPaired() { try { return window.KiwiPlatform?.pairedVenue?.() || JSON.parse(localStorage.getItem('kiwiPairedVenue') || 'null'); } catch (_) { return null; } }
  function bqReal()   { try { return !!(window.KiwiEnv && window.KiwiEnv.isReal && window.KiwiEnv.isReal()) || !!window.KiwiPlatform?.isPaired?.() || !!bqPaired(); } catch (_) { return !!bqPaired(); } }
  function bqName(demo) { const p = bqPaired(); return (p && p.name) || (bqReal() ? '' : demo); }
  function bqCity(demo) { const p = bqPaired(); return (p && p.location) || (bqReal() ? '' : demo); }

  function voucherHTML(av) {
    return `<div class="mz-avoir">
      <div class="c b lg">${esc((bqName('Maison Mansour') || 'Boutique').toUpperCase())}</div>
      <div class="c mut">${bqReal() ? (bqCity('') ? esc(bqCity('')) + ' · ' : '') + 'propulsé par Kiwi' : '12 rue Aïn Harrouda, Maarif, Casablanca<br>05 22 25 XX XX · propulsé par Kiwi'}</div>
      <hr>
      <div class="c b">BON D'AVOIR</div>
      <div class="mz-avoir-amt">${fmtMAD(av.balance)}</div>
      ${av.balance !== av.amount ? `<div class="c mut">émis pour ${fmtMAD(av.amount)}, solde restant</div>` : ''}
      <hr>
      <div class="row"><span>Code</span><span class="b">${av.code}</span></div>
      <div class="row"><span>Cliente</span><span>${esc(av.holderName)}</span></div>
      <div class="row"><span>Motif</span><span>${esc(av.motif)}</span></div>
      ${av.from ? `<div class="row"><span>Vente d'origine</span><span>${esc(av.from)}</span></div>` : ''}
      <div class="row"><span>Émis le</span><span>${fmtDayY(av.at)}</span></div>
      <div class="row b"><span>VALABLE JUSQU'AU</span><span>${fmtValidUntil(av.until)}</span></div>
      <hr>
      <div class="c">${window.KiwiBarcode && window.KiwiBarcode.svg ? window.KiwiBarcode.svg(av.code, { format: 'code128', height: 40, showText: false }) : barcode(av.code + '-MM', 26)}</div>
      <div class="mz-avoir-code">${av.code} · ${esc((bqName('Maison Mansour') || 'Boutique').toUpperCase())}</div>
      <div class="c mut" style="margin-top:6px;">Utilisable en caisse, en une ou plusieurs fois.<br>Ni repris, ni remboursé en espèces.</div>
    </div>`;
  }

  function openVoucher(av, ctx) {
    if (!av) return;
    const fresh = ctx && ctx.mode === 'fresh';
    const el = $('#mz-avoirmm', root);
    el.innerHTML = `
      <button class="mz-modal-x" data-mz-close aria-label="Fermer"><i data-lucide="x"></i></button>
      <h3 class="modal-title">${fresh ? `Avoir émis, ${av.code}` : `Avoir ${av.code}`}</h3>
      <p class="modal-subtle">${esc(av.holderName)} · ${fmtMAD(av.balance)} ${av.balance > 0 ? 'disponibles' : 'consommé'}</p>
      ${voucherHTML(av)}
      <div class="mz-avoir-note"><i data-lucide="shield-check"></i>Le code-barres revient en caisse comme moyen de paiement, il se déduit tout seul à l'encaissement.</div>
      <div class="mz-sheet-foot">
        <button class="mz-btn secondary" id="mz-av-print"><i data-lucide="printer"></i>Imprimer l'avoir</button>
        <button class="mz-btn primary" data-mz-close><i data-lucide="check"></i>${fresh ? 'Terminer' : 'Fermer'}</button>
      </div>`;
    openVeil('#mz-avoir-veil');
    icons();
    $$('[data-mz-close]', el).forEach((b) => { b.onclick = () => closeVeil('#mz-avoir-veil'); });
    $('#mz-av-print', el).onclick = () => {
      /* Le même papier que le reçu (thermique, file durable), plus l'impression
         système qui le transformait en PDF. Code-barres Code 128 scannable. */
      const K = window.KiwiReceipt;
      if (!K || !K.printVoucher) { toast('Impression indisponible sur cet appareil'); return; }
      toast('Impression de l’avoir…');
      K.printVoucher({ code: av.code, amount: av.amount, balance: av.balance, holderName: av.holderName,
        motif: av.motif, from: av.from, at: av.at, until: av.until, untilText: fmtValidUntil(av.until) }).then(
        (r) => toast(!r || !r.ok ? 'Impression échouée'
          : r.queued ? 'Avoir envoyé à l’imprimante'
          : r.thermalFailed ? 'Imprimante injoignable · avoir ouvert dans l’impression système'
          : r.via === 'pdf' || r.via === 'browser' ? 'Avoir ouvert dans l’impression système' : 'Avoir imprimé'),
        () => toast('Impression échouée'));
    };
  }

  /* ---------- exchange summary ---------- */
  function openExchSummary(newPid, newSize, newColor) {
    const ex = state.exchange;
    if (!ex) return;
    const sale = findSale(ex.saleId);
    const ln = sale.lines[ex.idx];
    /* L'article RENDU peut ne plus être au catalogue (le journal couvre la
       semaine) ; celui qui le remplace vient forcément de la grille, donc il y
       est. Le prix du retour se lit sur la ligne de vente — le montant payé —
       et pas sur la fiche produit, qui a pu changer de prix depuis. */
    const oldP = P[ln.pid] || { name: ln.name || 'Article retiré du catalogue', art: '' };
    const newP = P[newPid];
    if (!newP) { toast('Article de remplacement introuvable'); return; }
    /* Review gap R5 · a piece return takes a piece replacement (same format,
     * same loose-aware stock, same per-kind promo conversion) — never a set.
     * The return side stays the frozen amount actually paid (ln.unit). */
    const newIsPiece = !!ln.isPiece;
    const newEff = lineDeal({ pid: newPid, isPiece: newIsPiece, customPrice: newIsPiece ? pieceUnitPrice(newP) : undefined }).price;
    const diff = Math.round((newEff - paidUnit(sale, ln)) * 100) / 100;
    const c = saleClient(sale);
    const el = $('#mz-exchm', root);
    el.innerHTML = `
      <button class="mz-modal-x" data-mz-close aria-label="Fermer"><i data-lucide="x"></i></button>
      <h3 class="modal-title">Échange, ${sale.id}</h3>
      <p class="modal-subtle">${c ? esc(c.name) : 'Cliente de passage'} · la pièce rendue repart en stock</p>
      <div class="mz-exch-row is-ret">
        <span class="mz-line-art">${artOf(oldP)}</span>
        <span class="mid"><b>${esc(oldP.name)}</b><span>retour · ${esc(ln.size)} · ${colorDot(ln.color)} ${esc(colorLabel(ln.color))}${ln.remise ? ` · payé avec −${ln.remise} %` : ''}</span></span>
        <span class="amt">−${fmtMAD(paidUnit(sale, ln))}</span>
      </div>
      <div class="mz-exch-row is-new">
        <span class="mz-line-art">${artOf(newP)}</span>
        <span class="mid"><b>${esc(newP.name)}</b><span>remplacement · ${esc(newSize)}${newIsPiece ? ' · à la pièce' : ''} · ${colorDot(newColor)} ${esc(colorLabel(newColor))}</span></span>
        <span class="amt">+${fmtMAD(newEff)}</span>
      </div>
      <div class="mz-exch-diff ${diff > 0 ? 'pos' : diff < 0 ? 'neg' : 'zero'}">
        <span>${diff > 0 ? 'Différence à encaisser' : diff < 0 ? 'Différence en faveur de la cliente, part en avoir' : 'Aucun écart, échange direct'}</span>
        <span class="amt">${diff === 0 ? '0 MAD' : fmtMAD(Math.abs(diff))}</span>
      </div>
      <div class="mz-sheet-foot">
        <button class="mz-btn secondary" data-mz-close>Retour</button>
        ${diff > 0
          ? `<button class="mz-btn primary" id="mz-exch-go"><i data-lucide="banknote"></i>Encaisser ${fmtMAD(diff)}</button>`
          : diff < 0
            ? `<button class="mz-btn primary" id="mz-exch-go"><i data-lucide="ticket"></i>Échanger + avoir ${fmtMAD(-diff)}</button>`
            : `<button class="mz-btn primary" id="mz-exch-go"><i data-lucide="check"></i>Confirmer l'échange</button>`}
      </div>`;
    openVeil('#mz-exch-veil');
    icons();
    $$('[data-mz-close]', el).forEach((b) => { b.onclick = () => closeVeil('#mz-exch-veil'); });

    let applied = false;
    const apply = () => {
      if (applied) return true;
      /* Take the replacement FIRST (piece-aware), abort untouched on miss. */
      const held = holdStock(newPid, newSize, 1, newIsPiece);
      if (held === false) {
        toast(`${newP.name} · ${newSize}, stock insuffisant pour l'échange`);
        return false;
      }
      applied = true;
      const back = releaseStock(ln.pid, ln.size, 1, ln.isPiece);
      // Commit the swap to the shared inventory: rendered piece back in, replacement out.
      /* Un échange est DEUX mouvements, jamais un seul : la pièce rendue rentre,
         la pièce emportée sort, et le registre le raconte dans les deux sens. */
      persistStock(ln.pid, ln.size, ln.color, back, { ref: sale.num || sale.id, why: 'retour' });
      persistStock(newPid, newSize, newColor, -held, { ref: sale.num || sale.id, why: 'vente' });
      state.exchange = null;
      persistDay();
      queueIfOffline(`Échange ${sale.id}`);
      renderExchNote(); renderGrid(); renderBadges();
      return true;
    };

    $('#mz-exch-go', el).onclick = async () => {
      /* Pre-check before any money moves (piece-aware like the take). */
      if (!canHoldStock(newPid, newSize, 1, newIsPiece)) {
        toast(`${newP.name} · ${newSize}, stock insuffisant pour l'échange`);
        return;
      }
      if (diff > 0) {
        const go = $('#mz-exch-go', el);
        if (go) go.disabled = true;
        nextStandaloneTicketNumber().then((exchangeNumber) => {
          closeVeil('#mz-exch-veil');
          openPay({
            amount: diff,
            customerId: sale.clientId || null,
            title: 'Différence échange',
            subtitle: `${sale.id} · ${esc(oldP.name)} → ${esc(newP.name)}`,
            ref: exchangeNumber,
            lines: [{
              qty: 1,
              name: `Différence échange · ${oldP.name} → ${newP.name}`,
              amount: diff,
              ref: newPid,
              barcode: newP.barcode || '',
            }],
            subtotal: diff,
            doneLabel: 'Terminer',
            waName: c ? firstName(c.name) : null, waPhone: c ? c.phone : null,
            onPaid: (parts) => {
              const swapped = apply();
              /* The paid path kills the old line too, like every return. */
              if (swapped) {
                markLineReturned(ln, 1, `échange ${sale.id}`);
                recordReturn(sale, [ex.idx], paidUnit(sale, ln), `Échange ${sale.id}`, 'echange', exchangeNumber);
              }
              const rec = {
                id: exchangeNumber, syncId: newSaleId(), tenderVersion: 2, at: new Date(), clientId: sale.clientId, by: STAFF.caissiere.name, kind: 'echange',
                methods: parts.map((x) => x.m).join(' + '),
                parts: parts.map((x) => ({ m: x.m, amount: Math.round((+x.amount || 0) * 100) / 100 })),
                lines: swapped ? [{ pid: newPid, size: newSize, color: newColor, qty: 1, remise: 0, unit: diff, isPiece: newIsPiece, returned: false, note: `différence échange ${sale.id}` }] : [],
                total: diff,
                note: swapped ? '' : 'échange non appliqué (rupture entre-temps), différence encaissée à régulariser',
              };
              SALES.unshift(rec);
              persistDay();
              bqSaveProvisional();
              try {
                if (window.KiwiLive && window.KiwiLive.isOn()) {
                  const pm = (parts || []).map((x) => x.m);
                  const isDelivery = pm.indexOf('livraison') >= 0;
                  const method = bqPaymentMethod(parts);
                  const cashIn = (parts || []).reduce((s, x) => s + (x.m === 'avoir' || x.m === 'livraison' ? 0 : (+x.amount || 0)), 0);
                  bqPost(rec, {
                    id: rec.syncId,
                    amount: cashIn,
                    method,
                    paymentParts: bqPaymentParts(parts), ticketAmountCents: Math.round(diff * 100),
                    ...(cashIn <= 0 ? { settlementKind: isDelivery ? 'receivable' : 'store-credit',
                      creditAmountCents: Math.round((parts || []).filter(x => x.m === 'avoir').reduce((sum, x) => sum + (+x.amount || 0), 0) * 100) } : {}),
                    channel: isDelivery ? 'delivery' : 'counter',
                    label: `Différence échange ${sale.id}`,
                    ref: rec.id,
                    time: rec.at,
                    lines: swapped ? [{ name: newP.name + (newSize ? ' ' + newSize : ''), qty: 1, total: diff, cat: rayonOf(newPid) || '' }] : [],
                  });
                }
              } catch (_) {}
              $('#mz-today', root).textContent = headSubVente();
              refreshOps();
              if (!swapped) toast('Échange non appliqué (rupture entre-temps)', 5200, 'danger', 'La différence est encaissée et tracée : régularisez l’échange manuellement.');
              return { ref: rec.id, sale: rec, line: swapped ? `Échange ${sale.id} réglé, différence ${fmtMAD(diff)}` : `Différence ${sale.id} encaissée sans échange, à régulariser` };
            },
          });
        }).catch(() => {
          if (go) go.disabled = false;
          toast('Numéro de ticket indisponible', 5200, 'danger', 'Reconnectez cette caisse pour réserver sa prochaine série.');
        });
      } else if (diff < 0) {
        const quantities = new Map([[ex.idx, 1]]);
        const originalSaleId = sale.serverId || sale.syncId || sale.id;
        const go = $('#mz-exch-go', el);
        if (go) go.disabled = true;
        try {
          /* Book the liability first. If the network or server refuses, the old
             item and both stock positions remain untouched. The deterministic
             request id makes a lost response safe to retry. */
          const av = await issueAvoir(-diff, c, `Différence échange ${sale.id}`, originalSaleId, {
            requestId: stableCreditIssueId(sale, quantities, -diff * 100),
            originalRef: sale.num || sale.id, originalSale: sale,
            resellable: true,
            lines: [{
              itemId: ln.pid, variantId: ln.variantId || '',
              name: oldP.name || 'Article', size: ln.size || '', qty: 1,
              unitCents: Math.round(paidUnit(sale, ln) * 100),
            }],
          });
          closeVeil('#mz-exch-veil');
          if (!apply()) {
            toast('Avoir émis, échange à régulariser', 5200, 'warn', `${av.code} existe mais le remplacement est devenu indisponible.`);
            refreshOps();
            openVoucher(av, { mode: 'fresh' });
            return;
          }
          markLineReturned(ln, 1, `échange ${sale.id}`);
          persistDay();
          recordReturn(sale, [ex.idx], paidUnit(sale, ln), `Échange ${sale.id}`, 'echange', av.code);
          refreshOps();
          openVoucher(av, { mode: 'fresh' });
        } catch (error) {
          if (go) go.disabled = false;
          toast('Avoir non émis', 5200, 'danger', creditErrorDetail(error));
        }
      } else {
        closeVeil('#mz-exch-veil');
        if (!apply()) { refreshOps(); return; }
        markLineReturned(ln, 1, `échange ${sale.id}`);
        recordReturn(sale, [ex.idx], paidUnit(sale, ln), `Échange ${sale.id}`, 'echange', '');
        persistDay();
        refreshOps();
        toast(`Échange ${sale.id}, ${oldP.name} ${ln.size} contre ${newP.name} ${newSize}`);
      }
    };
  }

  /* ═══════════════════════ ENCAISSEMENT ═══════════════════════ */
  /* File d'impression durable : le comptoir garde le ticket jusqu'à ce qu'une
     imprimante le prenne. Rien ici n'invente une file — on réutilise celle du
     poste (KiwiKitchenPrint), la même qui sert déjà avant l'appel direct. */
  function requeueReceipt(opts, doc) {
    const queue = window.KiwiKitchenPrint;
    if (!opts || !opts.sale || !queue || typeof queue.enqueueReceipt !== 'function') return false;
    try {
      const queued = queue.enqueueReceipt('maison:' + opts.sale.id + ':retry', doc, 'original');
      return !!(queued && (queued.accepted || queued.pending));
    } catch (_) { return false; }
  }

  function printReceiptNow(opts, parts, printOpts) {
    printOpts = printOpts || {};
    const isGift = !!printOpts.gift;
    const KP = window.KiwiPrinter;
    const pv = pvPaired();
    const shopName = (pv && pv.name) || 'Vogue Home';
    const lines = (opts.lines || []).map((l) => ({
      qty: l.qty,
      name: l.name + (l.marque ? ' · ' + l.marque : '') + (l.motif ? ' (' + l.motif + ')' : ''),
      price: isGift ? '' : fmtMAD(l.amount),
      total: isGift ? null : l.amount,
      ref: l.ref,
      barcode: l.barcode,
    }));

    if (isGift) {
      // Impression Ticket Cadeau sans montants ni prix
      const giftDoc = {
        shop: shopName + ' · Ticket Cadeau',
        ref: opts.ref || '',
        date: fmtDT(new Date()),
        lines: lines,
        total: '',
        method: '',
        gift: true,
        note: 'Ticket Cadeau / Bon d’échange · Valable 30 jours pour échange ou avoir sur présentation de ce ticket.'
      };
      if (KP && KP.isConnected && KP.isConnected()) {
        toast('Impression du ticket cadeau…');
        /* Une promesse tenue n'est pas une impression réussie : `printReceipt`
           résout aussi sur `{ok:false}`. On lit le résultat. */
        KP.printReceipt(giftDoc).then(
          (r) => toast(r && r.ok === false
            ? ('Échec impression ticket cadeau : ' + ((r && r.reason) || 'inconnu'))
            : 'Ticket cadeau imprimé'),
          (e) => toast('Échec impression ticket cadeau : ' + ((e && e.message) || 'erreur'))
        );
        return;
      }
      if (KP && KP.browserReceipt) {
        KP.browserReceipt(giftDoc);
        toast('Ticket cadeau affiché');
        return;
      }
      const giftHtml = `
        <div style="font-family:monospace; max-width:300px; margin:20px auto; padding:16px; border:1px solid #000; text-align:center;">
          <h3 style="margin:0;">${esc(shopName)}</h3>
          <div style="font-size:12px; margin:4px 0;">TANGER · ART DE TABLE & DÉCORATION</div>
          <div style="font-size:13px; font-weight:bold; margin:10px 0; border-top:1px dashed #000; border-bottom:1px dashed #000; padding:6px 0;">
            *** TICKET CADEAU ***<br>BON D'ÉCHANGE
          </div>
          <div style="text-align:left; font-size:11px; margin-bottom:10px;">
            Ticket: ${esc(opts.ref)}<br>
            Date: ${fmtDT(new Date())}<br>
            Conseiller: ${esc((STAFF && STAFF.caissiere && STAFF.caissiere.name) || 'Caisse')}<br>
            ${opts.customer ? `Cliente: ${esc(opts.customer.name)}<br>` : ''}
          </div>
          <table style="width:100%; border-collapse:collapse; font-size:11px; text-align:left; margin-bottom:12px;">
            <thead>
              <tr style="border-bottom:1px solid #000;"><th>Qté</th><th>Article / Marque</th></tr>
            </thead>
            <tbody>
              ${lines.map((l) => `<tr><td style="padding:4px 0; vertical-align:top; font-weight:bold;">${l.qty || 1}×</td><td style="padding:4px 0;">${esc(l.name)}</td></tr>`).join('')}
            </tbody>
          </table>
          <div style="font-size:10.5px; border-top:1px dashed #000; padding-top:8px; line-height:1.4;">
            Échangeable sous 30 jours dans notre boutique sur présentation de ce bon.<br>
            Articles non utilisés et dans leur emballage d'origine.
          </div>
          <div style="margin-top:12px;">
            ${barcode(opts.ref || 'GIFT', 24)}
          </div>
        </div>`;
      const gw = window.open('', '_blank', 'width=360,height=500');
      if (gw) {
        gw.document.write(`<!DOCTYPE html><html><head><title>Ticket Cadeau - ${esc(opts.ref)}</title></head><body>${giftHtml}<script>window.onload=function(){window.print();};<\/script></body></html>`);
        gw.document.close();
      }
      return;
    }

    if (!KP || !KP.printReceipt) { toast('Impression indisponible sur cet appareil'); return; }

    const K = window.KiwiReceipt;
    if (K) {
      const doc = K.build({
        ref: opts.ref || '',
        ts: (opts.sale && opts.sale.at) || Date.now(),
        cashier: (STAFF && STAFF.caissiere && STAFF.caissiere.name) || '',
        lines: (opts.lines || []).map((l) => ({ qty: l.qty, name: l.name, total: l.amount, ref: l.ref, barcode: l.barcode })),
        subtotal: opts.subtotal,
        promo: opts.promo || null,
        discount: opts.discount,
        total: opts.amount,
        acompte: opts.acompte || null,
        customer: opts.customer || null,
        pay: (parts || []).map((x) => ({ label: x.m === 'avoir' ? ('Avoir ' + (x.code || '')) : x.m, amount: x.amount })),
        received: (function () {
          const c = (parts || []).find((x) => x.m === 'espèces' && x.rendu > 0);
          return c ? (+c.amount || 0) + (+c.rendu || 0) : null;
        })(),
        change: (parts || []).reduce((r, x) => r || x.rendu || 0, 0) || null,
      });
      try {
        if (opts.sale) { opts.sale.rc = K.snapshot(doc); persistDay(); }
      } catch (_) {}
      const queue = window.KiwiKitchenPrint;
      if (opts.sale && queue && typeof queue.enqueueReceipt === 'function') {
        try {
          const queued = queue.enqueueReceipt('maison:' + opts.sale.id, doc, 'original');
          if (queued && (queued.accepted || queued.pending)) return;
        } catch (_) {}
      }
      toast('Impression du reçu…');
      Promise.resolve(K.print(doc)).then(
        (r) => {
          /* Le thermique a échoué et seul le repli navigateur est sorti : on le
             dit, et on remet le ticket en file pour un vrai réessai — sinon la
             vendeuse croit le reçu imprimé et la cliente repart sans rien. */
          if (r && r.thermalFailed) {
            const retried = requeueReceipt(opts, doc);
            toast('Imprimante thermique injoignable', null, 'warn',
              (retried ? 'Reçu remis en file d\'impression. ' : '') + 'Sortie de secours par l\'imprimante système.');
            return;
          }
          toast(r && r.ok
            ? (r.via === 'pdf' ? 'Reçu prêt · imprimer ou partager le PDF' : r.via === 'browser' ? 'Reçu ouvert dans l\'impression système' : ('Reçu imprimé · ' + (r.via === 'bluetooth' ? 'Bluetooth' : r.via === 'usb' ? 'USB' : 'réseau')))
            : 'Impression échouée');
        },
        () => { requeueReceipt(opts, doc); toast('Impression échouée'); }
      );
      return;
    }

    const label = { 'carte': 'Carte', 'avoir': 'Avoir', 'espèces': 'Espèces', 'virement': 'Virement / Versement', 'chèque': 'Chèque', 'livraison': 'Livraison · à recevoir' };
    const doc = {
      shop: shopName,
      ref: opts.ref || '',
      date: fmtDT(new Date()),
      lines: lines.length ? lines : [{ name: opts.title || 'Vente', price: fmtMAD(opts.amount) }],
      total: fmtMAD(opts.amount),
      method: (parts || []).map((x) => label[x.m] || x.m).join(' + '),
    };

    if (!KP.isConnected || !KP.isConnected()) {
      const cfg = (KP.getConfig && KP.getConfig()) || {};
      if (cfg.browserFallback && KP.browserReceipt) { KP.browserReceipt(doc); return; }
      toast('Aucune imprimante connectée');
      try {
        KP.openSetup(KP.browserReceipt ? {
          kind: 'receipt',
          onBrowserPrint: () => {
            try { KP.setConfig({ browserFallback: true }); } catch (_) {}
            KP.browserReceipt(doc);
          },
        } : {});
      } catch (_) {}
      return;
    }
    toast('Impression du reçu…');
    KP.printReceipt(doc).then(
      (r) => toast(r && r.ok
        ? ('Reçu imprimé · ' + (r.via === 'bluetooth' ? 'Bluetooth' : r.via === 'usb' ? 'USB' : 'réseau'))
        : ('Impression échouée : ' + ((r && r.reason) || 'inconnu'))),
      (e) => toast('Impression échouée : ' + ((e && e.message) || 'erreur'))
    );
  }

  /* ── UNE VENTE, PLUSIEURS RÈGLEMENTS ──────────────────────────────────────
     « La moitié en espèces, la moitié en carte » n'est pas deux ventes : c'est
     une vente à deux règlements. La caisse ne savait faire qu'un seul mode par
     vente (l'avoir excepté), et la caissière devait donc encaisser deux tickets
     — deux numéros, deux lignes dans le journal, un panier moyen faux et un
     tiroir qui ne tombe jamais juste.

     `settled` porte ce qui est déjà réglé ; `share` la part que le prochain
     mode prendra. Le reste retourne à l'écran des modes tant qu'il n'est pas
     couvert, ce qui donne gratuitement les partages à trois. */
  function renderAcomptes() {
    const panel = $('[data-mz-panel="acomptes"]', root);
    const R = window.KiwiRetailBalances;
    if (!R) { panel.textContent = 'Registre des acomptes indisponible'; return; }
    void R.render(panel, {
      merchant: merchantSlug(), prefix: 'mz',
      customerName: id => (clById(id) || {}).name || id,
      customerIdForName: query => (clientList().find(c => c.name.toLowerCase().includes(query.toLowerCase())) || {}).id,
      onSelect: payExistingBalance,
    });
  }
  function openPay(opts) {
    const el = $('#mz-paym', root);
    const ownAvoirs = () => opts.customerId
      ? activeAvoirs().filter((a) => a.holderId === opts.customerId) : [];
    let avoirPart = null;                   /* { m:'avoir', amount, code } */
    const settled = [];                     /* les règlements déjà posés */
    let committed = false;                  /* double tap must never book twice */
    const creditCommitId = creditIntent('credit-redeem');
    const appliedAvoirCodes = () => {
      const codes = [];
      if (avoirPart) codes.push(avoirPart.code);
      for (const p of settled) if (p.m === 'avoir' && p.code) codes.push(p.code);
      return codes;
    };
    const remainingAvoirs = () => {
      const used = new Set(appliedAvoirCodes());
      return ownAvoirs().filter((a) => !used.has(a.code));
    };
    let share = 1;                          /* 1 = tout le reste ; 0.5 = la moitié */
    let custom = 0;                          /* un montant saisi à la main */
    const r2 = (n) => Math.round((+n || 0) * 100) / 100;
    const paid = () => settled.reduce((s, p) => s + (+p.amount || 0), 0);
    const due = () => r2(opts.amount - (avoirPart ? avoirPart.amount : 0) - paid());
    /* Ce que prend le prochain mode. Jamais plus que le reste : une part de 50 %
       sur un reste de 3 MAD ne doit pas produire un règlement de 1,50 MAD qu'on
       n'a pas les pièces pour rendre — mais surtout jamais PLUS que dû. */
    const portion = () => {
      if (custom > 0) return Math.min(custom, due());
      if (share >= 1) return due();
      return Math.min(due(), Math.max(0.01, r2(due() * share)));
    };
    const closeBtns = () => $$('[data-mz-close]', el).forEach((b) => {
      b.onclick = () => {
        /* Once one payment part is confirmed, closing would forget money already
           received (especially a card charge) while leaving the cart unpaid.
           Finish the remaining balance; the success screen can close normally. */
        if (!committed && (settled.length || avoirPart)) {
          toast('Paiement commencé', `Il reste ${fmtMAD(due())} à régler avant de fermer.`);
          return;
        }
        closeVeil('#mz-pay-veil');
      };
    });

    const mLabel = (m) => (m === 'espèces' ? 'Espèces' : m === 'carte' ? 'Carte' : m === 'virement' ? 'Virement / Versement' : m === 'chèque' ? 'Chèque' : m === 'livraison' ? 'Livraison' : m === 'avoir' ? 'Avoir' : m);

    const appliedBanner = () => {
      const rows = [];
      if (avoirPart) rows.push(`<i data-lucide="ticket"></i> Avoir <b>${avoirPart.code}</b> appliqué, −${fmtMAD(avoirPart.amount)}`);
      settled.forEach((p) => rows.push(`<i data-lucide="check"></i> ${mLabel(p.m)} <b>${fmtMAD(p.amount)}</b> réglé`));
      return rows.map((r) => `<div class="mz-pay-applied">${r}</div>`).join('');
    };

    /* Le partage. Volontairement à quatre touches et pas un clavier de plus :
       au comptoir, « la moitié » est le cas qui revient, et tout le reste se
       saisit au montant. */
    const splitBar = () => `
      <div class="mz-split" role="group" aria-label="Partager le paiement">
        <span class="mz-split-l">Partager</span>
        <button class="mz-split-c${share >= 1 && !custom ? ' is-on' : ''}" data-mz-share="1">Tout</button>
        <button class="mz-split-c${share === 0.5 && !custom ? ' is-on' : ''}" data-mz-share="0.5">50 %</button>
        <button class="mz-split-c${share === 0.25 && !custom ? ' is-on' : ''}" data-mz-share="0.25">25 %</button>
        <button class="mz-split-c${custom ? ' is-on' : ''}" data-mz-share="x">Montant…</button>
        <input class="mz-split-in mono" id="mz-split-in" type="number" inputmode="decimal" min="0" step="1"
               placeholder="MAD" value="${custom || ''}" ${custom ? '' : 'hidden'} aria-label="Montant de cette part" />
      </div>
      <p class="mz-split-note"${portion() < due() ? '' : ' hidden'}>Cette part : ${fmtMAD(portion())} · restera ${fmtMAD(r2(due() - portion()))}</p>`;

    const stepMethods = () => {
      const avs = ownAvoirs();
      const remAvoirs = remainingAvoirs();
      el.innerHTML = `
        <button class="mz-modal-x" data-mz-close aria-label="Fermer"><i data-lucide="x"></i></button>
        <h3 class="modal-title">${esc(opts.title)}</h3>
        <p class="modal-subtle">${settled.length ? `Reste à régler sur ${fmtMAD(opts.amount)}` : opts.subtitle}</p>
        <div class="modal-amount size-md">${fmtMAD(due())}</div>
        ${appliedBanner()}
        ${due() > 0.01 ? splitBar() : ''}
        ${settled.length === 1 && due() > 0.009 && opts.customerId
          && ['espèces','carte','virement','chèque'].includes(settled[0].m)
          ? `<button class="mz-btn secondary" id="mz-save-acompte">Acompte reçu · garder ${fmtMAD(due())} à régler</button>` : ''}
        <div class="mz-pay-opts">
          <button class="mz-pay-opt" data-mz-m="especes">
            <span class="ic"><i data-lucide="banknote"></i></span>
            <span class="l"><b>Espèces</b><span>Rendu calculé, flous comptés une fois</span></span>
            <span class="amt">${fmtMAD(portion())}</span>
          </button>
          <button class="mz-pay-opt" data-mz-m="carte">
            <span class="ic"><i data-lucide="credit-card"></i></span>
            <span class="l"><b>Carte</b><span>Lecteur partenaire, paiement sur votre terminal</span></span>
            <span class="amt">${fmtMAD(portion())}</span>
          </button>
          <button class="mz-pay-opt" data-mz-m="virement">
            <span class="ic"><img src="assets/icons/material/account_balance.svg" alt=""></span>
            <span class="l"><b>Virement / Versement</b><span>Confirmer uniquement après réception en banque</span></span>
            <span class="amt">${fmtMAD(portion())}</span>
          </button>
          <button class="mz-pay-opt" data-mz-m="cheque">
            <span class="ic"><img src="assets/icons/material/receipt_long.svg" alt=""></span>
            <span class="l"><b>Chèque</b><span>Confirmer après réception du chèque</span></span>
            <span class="amt">${fmtMAD(portion())}</span>
          </button>
          <button class="mz-pay-opt" data-mz-m="livraison">
            <span class="ic"><i data-lucide="truck"></i></span>
            <span class="l"><b>Livraison</b><span>Vente enregistrée, paiement à recevoir du transporteur</span></span>
            <span class="amt">${fmtMAD(portion())}</span>
          </button>
          ${remAvoirs.length ? `
          <button class="mz-pay-opt" data-mz-m="avoir">
            <span class="ic"><i data-lucide="ticket"></i></span>
            <span class="l"><b>Avoir</b><span>${remAvoirs.length === 1 && !avoirPart ? `${remAvoirs[0].code} · ${fmtMAD(remAvoirs[0].balance)}, ${esc(remAvoirs[0].holderName)}` : `${remAvoirs.length} bon${remAvoirs.length > 1 ? 's' : ''} disponible${remAvoirs.length > 1 ? 's' : ''}, scanner ou choisir`}</span></span>
            <span class="amt">−${fmtMAD(Math.min(remAvoirs[0].balance, portion()))}</span>
          </button>` : `
          <button class="mz-pay-opt" data-mz-m="avoir">
            <span class="ic"><i data-lucide="ticket"></i></span>
            <span class="l"><b>Code d’avoir</b><span>${avs.length ? 'Tous les bons de cette cliente sont déjà posés · scanner ou saisir un autre code' : 'Scanner ou saisir le code du bon'}</span></span>
          </button>`}
        </div>`;
      icons(); closeBtns();
      const saveAcompte = $('#mz-save-acompte', el);
      if (saveAcompte) saveAcompte.onclick = () => { void commit(true); };
      const inp = $('#mz-split-in', el);
      $$('[data-mz-share]', el).forEach((b) => {
        b.onclick = () => {
          const v = b.dataset.mzShare;
          if (v === 'x') {
            /* On ne re-rend pas : le champ apparaît sous la main de la caissière
               et prend le curseur. Un re-rendu le lui reprendrait. */
            if (inp) { inp.hidden = false; inp.focus(); inp.select(); }
            return;
          }
          custom = 0; share = +v || 1; stepMethods();
        };
      });
      if (inp) {
        inp.oninput = () => {
          custom = Math.max(0, Math.min(due(), r2(inp.value)));
          /* La pastille suit la saisie. On ne re-rend pas la barre (le champ
             perdrait le curseur en pleine frappe), donc on déplace le marqueur
             à la main — sans quoi « Tout » reste allumé sur une part de 100 MAD. */
          $$('[data-mz-share]', el).forEach((b) => {
            b.classList.toggle('is-on', custom > 0 ? b.dataset.mzShare === 'x' : b.dataset.mzShare === String(share));
          });
          const note = $('.mz-split-note', el);
          if (note) {
            note.hidden = !(portion() < due());
            note.textContent = `Cette part : ${fmtMAD(portion())} · restera ${fmtMAD(r2(due() - portion()))}`;
          }
          /* L'avoir se déduit du total, mais jamais plus que la part choisie :
             sa ligne suit donc la saisie comme les autres, en gardant son signe
             et son plafond propre (le solde du bon). */
          $$('[data-mz-m]', el).forEach((b) => {
            const a = $('.amt', b); if (!a) return;
            if (/^avoir/.test(b.dataset.mzM)) {
              const bal = (remainingAvoirs()[0] || {}).balance;
              if (bal != null) a.textContent = '−' + fmtMAD(Math.min(bal, portion()));
              return;
            }
            a.textContent = fmtMAD(portion());
          });
        };
      }
      $$('[data-mz-m]', el).forEach((b) => {
        b.onclick = () => {
          const m = b.dataset.mzM;
          if (m === 'especes') stepCash(portion());
          else if (m === 'carte') stepCard(portion());
          else if (m === 'virement' || m === 'cheque') stepExternal(m, portion());
          else if (m === 'livraison') {
            /* La fiche destinataire est obligatoire, comme en boutique ; la livraison
               fragile saisie sur le ticket la préremplit et en reçoit le résultat. */
            const amount = portion(), t = state.ticket || {};
            mzDeliveryCard(el, { amount, esc, fmtMAD, icons, closeBtns, prev: (settled.find((p) => p.card) || {}).card,
              ticket: t.delivery || { reinforcedWrap: (t.lines || []).some((l) => l.fragile || (P[l.pid] && P[l.pid].fragile)) }, client: opts.customerId ? clById(opts.customerId) : null, back: stepMethods,
              done: (card, fragile) => {
                if (state.ticket && !opts.balanceExisting) state.ticket.delivery = Object.assign({}, t.delivery || {}, { name: card.name, phone: card.phone, city: card.city, address: card.address, quartier: '' }, fragile);
                settle({ m: 'livraison', amount, card });
              } });
          }
          else if (m === 'avoir') stepAvoir();
          else toast('Aucun avoir actif, émettez-en un depuis Échanges & avoirs');
        };
      });
    };

    /* Un règlement de plus est posé. Tant qu'il reste quelque chose à payer on
       revient aux modes — c'est ce retour, et rien d'autre, qui rend possibles
       les partages à trois ou quatre. */
    const settle = (part) => {
      settled.push(part);
      share = 1; custom = 0;
      if (opts.balanceExisting) void commit(due() > 0.009);
      else if (due() > 0.009) { toast(`Reste ${fmtMAD(due())} à régler`); stepMethods(); }
      else commit();
    };

    const stepAvoir = () => {
      const avs = remainingAvoirs();
      el.innerHTML = `
        <button class="mz-modal-x" data-mz-close aria-label="Fermer"><i data-lucide="x"></i></button>
        <h3 class="modal-title">Avoir en paiement</h3>
        <p class="modal-subtle">Scannez le bon, ou choisissez-le, il se déduit du total</p>
        <form id="mz-av-code-form" style="display:flex;gap:8px;margin:12px 0;">
          <input class="sk-input mono" id="mz-av-code" autocomplete="off" autocapitalize="characters" placeholder="Scanner ou saisir AV-…" aria-label="Code de l’avoir" style="flex:1;min-width:0;" />
          <button class="mz-btn secondary" type="submit">Utiliser</button>
        </form>
        <div class="mz-pay-opts">
          ${avs.map((a) => `
            <button class="mz-pay-opt" data-mz-av-use="${a.code}">
              <span class="ic"><i data-lucide="scan-line"></i></span>
              <span class="l"><b>${a.code} · ${fmtMAD(a.balance)}</b><span>${esc(a.holderName)} · ${esc(a.motif)} · valable jusqu'au ${fmtValidUntil(a.until)}</span></span>
              <span class="amt">−${fmtMAD(Math.min(a.balance, portion()))}</span>
            </button>`).join('')}
        </div>
        <div class="mz-sheet-foot"><button class="mz-btn secondary" id="mz-av-back" style="flex:1;">Retour</button></div>`;
      icons(); closeBtns();
      $('#mz-av-back', el).onclick = stepMethods;
      const applyCode = async (rawCode) => {
        const code = String(rawCode || '').trim().toUpperCase();
        if (!code) return;
        let av = AVOIRS.find((item) => String(item.code).toUpperCase() === code);
        if (!av && !IS_DEMO) {
          try {
            const data = await creditRequest(null, '&code=' + encodeURIComponent(code));
            const row = data.credits && data.credits[0];
            if (row) {
              av = creditFromServer(row);
              const old = AVOIRS.findIndex((item) => item.code === av.code);
              if (old >= 0) AVOIRS.splice(old, 1, av); else AVOIRS.unshift(av);
              persistAvoirs();
            }
          } catch (_) {}
        }
        if (!av || !activeAvoirs().includes(av)) {
          toast('Bon indisponible', 'Code introuvable, expiré ou déjà consommé.');
          return;
        }
        const applied = Math.min(av.balance, portion());
        if (avoirPart) settled.push({ m: 'avoir', amount: avoirPart.amount, code: avoirPart.code });
        avoirPart = { m: 'avoir', amount: applied, code: av.code };
        share = 1; custom = 0;
        if (due() <= 0.009) void commit();
        else { toast(`${av.code} appliqué, reste ${fmtMAD(due())} à payer`); stepMethods(); }
      };
      $('#mz-av-code-form', el).onsubmit = (event) => {
        event.preventDefault();
        void applyCode($('#mz-av-code', el).value);
      };
      $('#mz-av-code', el).focus();
      $$('[data-mz-av-use]', el).forEach((b) => {
        b.onclick = () => { void applyCode(b.dataset.mzAvUse); };
      });
    };

    const stepCash = (amount) => {
      amount = amount > 0 ? amount : due();
      const rest = r2(due() - amount);
      let received = amount;
      el.innerHTML = `
        <button class="mz-modal-x" data-mz-close aria-label="Fermer"><i data-lucide="x"></i></button>
        <h3 class="modal-title">Espèces · ${fmtMAD(amount)}</h3>
        <p class="modal-subtle">${rest > 0.009 ? `Part sur ${fmtMAD(due())} · restera ${fmtMAD(rest)}` : opts.subtitle}</p>
        ${appliedBanner()}
        <div class="cash-grid">
          <div class="cash-input-row">
            <label class="cash-input-label" for="mz-cash-in">Espèces reçues</label>
            <input class="cash-input mono" id="mz-cash-in" type="number" inputmode="numeric" min="0" step="1" value="${amount}" />
          </div>
          <div class="cash-presets" aria-label="Ajout rapide">
            <button class="cash-preset" data-add="20">+20</button>
            <button class="cash-preset" data-add="50">+50</button>
            <button class="cash-preset" data-add="100">+100</button>
            <button class="cash-preset" data-add="200">+200</button>
          </div>
          <div class="cash-rendu"><span class="lbl">Rendu</span><span class="val mono" id="mz-cash-rendu">0 MAD</span></div>
          <button class="cash-confirm" id="mz-cash-ok">Confirmer</button>
        </div>`;
      icons(); closeBtns();
      const refresh = () => {
        $('#mz-cash-rendu', el).textContent = fmtMAD(Math.max(0, received - amount));
        $('#mz-cash-ok', el).disabled = received < amount;
      };
      $('#mz-cash-in', el).oninput = (e) => { received = +e.target.value || 0; refresh(); };
      $$('[data-add]', el).forEach((b) => {
        b.onclick = () => { received += +b.dataset.add; $('#mz-cash-in', el).value = received; refresh(); };
      });
      refresh();
      $('#mz-cash-ok', el).onclick = () => {
        settle({ m: 'espèces', amount, rendu: Math.max(0, received - amount) });
      };
    };

    const stepCard = (amount) => {
      amount = amount > 0 ? amount : due();
      const rest = r2(due() - amount);
      el.innerHTML = `
        <button class="mz-modal-x" data-mz-close aria-label="Fermer"><i data-lucide="x"></i></button>
        <h3 class="modal-title">Carte · ${fmtMAD(amount)}</h3>
        <p class="modal-subtle">${rest > 0.009 ? `Part sur ${fmtMAD(due())} · restera ${fmtMAD(rest)}` : opts.subtitle} · Kiwi affiche, le lecteur encaisse</p>
        <div class="reader-stage">
          <div class="reader-disc is-pulsing" id="mz-reader-disc"><i data-lucide="credit-card"></i></div>
          <div class="reader-status" id="mz-reader-status">Montant envoyé au lecteur<span class="ellipsis"></span></div>
          <div class="reader-method">Lecteur partenaire, paiement sur votre terminal</div>
        </div>
        <div class="mz-card-confirm" id="mz-card-confirm" hidden>
          <button class="cash-confirm" id="mz-card-ok"><i data-lucide="check"></i> Encaissement confirmé sur le lecteur</button>
          <button class="mz-btn ghost" id="mz-card-cancel">Paiement refusé · annuler</button>
        </div>`;
      icons(); closeBtns();
      /* On simule l'aller au lecteur, puis — contrairement à avant — on n'encaisse
         PAS tout seul : la caissière confirme d'un geste que le lecteur a approuvé.
         AVANT, l'encaissement carte partait d'un minuteur de ~2,8 s ; fermer l'écran
         carte pendant l'animation (réflexe normal, le vrai paiement se fait sur le
         lecteur partenaire) perdait TOUTE la vente et ses points fidélité — d'où
         « en carte la cliente ne gagne pas de points ». La confirmation explicite
         enregistre la vente de façon fiable, exactement comme les espèces. */
      setTimeout(() => {
        const disc = $('#mz-reader-disc', el);
        if (!disc || !el.closest('.modal-veil').classList.contains('is-open')) return;
        disc.classList.remove('is-pulsing');
        disc.classList.add('is-success');
        disc.innerHTML = '<i data-lucide="check"></i>';
        $('#mz-reader-status', el).textContent = 'Confirmez l\'encaissement sur le lecteur';
        $('#mz-reader-status', el).classList.add('is-success');
        const cw = $('#mz-card-confirm', el);
        if (cw) cw.hidden = false;
        icons();
        const ok = $('#mz-card-ok', el);
        if (ok) ok.onclick = () => settle({ m: 'carte', amount });
        const cancel = $('#mz-card-cancel', el);
        if (cancel) cancel.onclick = () => {
          if (settled.length || avoirPart) stepMethods();
          else closeVeil('#mz-pay-veil');
        };
      }, 1400);
    };

    const stepExternal = (method, amount) => {
      const cheque = method === 'cheque';
      const label = cheque ? 'Chèque' : 'Virement / Versement';
      el.innerHTML = `
        <button class="mz-modal-x" data-mz-close aria-label="Fermer">×</button>
        <h3 class="modal-title">${label} · ${fmtMAD(amount)}</h3>
        <p class="modal-subtle">${cheque ? 'Le chèque a-t-il été remis au comptoir ?' : 'Les fonds sont-ils visibles sur le compte bancaire ?'} Aucun montant ne sera attendu dans le tiroir.</p>
        <div class="mz-sheet-foot">
          <button class="mz-btn secondary" id="mz-external-back">Retour</button>
          <button class="cash-confirm" id="mz-external-ok">${cheque ? 'Chèque reçu' : 'Versement reçu'} · confirmer</button>
        </div>`;
      closeBtns();
      $('#mz-external-back', el).onclick = stepMethods;
      $('#mz-external-ok', el).onclick = () => settle({ m: cheque ? 'chèque' : 'virement', amount });
    };

    const commit = async (partial) => {
      if (committed) return;
      if (partial && (!opts.customerId || settled.length !== 1 || avoirPart
          || !['espèces','carte','virement','chèque'].includes(settled[0].m))) {
        toast('Acompte : une cliente et un seul règlement sont requis'); return;
      }
      const parts = (avoirPart ? [avoirPart] : []).concat(settled);
      const paidNow = Math.round(parts.reduce((sum, part) => sum + (+part.amount || 0), 0) * 100) / 100;
      for (const part of parts) {
        if (part.m !== 'avoir') continue;
        const av = AVOIRS.find((a) => a.code === part.code);
        if (!av || avoirExpired(av) || !(av.balance >= part.amount)) {
          toast(`Avoir ${part.code} inutilisable`, !av ? 'Bon introuvable en caisse.' : avoirExpired(av) ? 'Bon expiré entre-temps.' : 'Solde insuffisant, montants recalculés.');
          return;
        }
      }
      committed = true;
      if (opts.beforePaid && !await opts.beforePaid()) { committed = false; return; }
      const creditParts = parts.filter((part) => part.m === 'avoir');
      try {
        let remote = null;
        if (!IS_DEMO && creditParts.length) {
          /* All vouchers are consumed by ONE server statement.  Either every
             balance is still valid or none changes; a second caisse cannot
             spend the same code between local validation and checkout. */
          remote = await creditRequest({
            action: 'redeem-batch', id: creditCommitId,
            saleId: opts.sale && opts.sale.id,
            detail: opts.title || 'Vente Maison',
            credits: creditParts.map((part) => ({ code: part.code, amountCents: Math.round(part.amount * 100) })),
          });
        }
        const remoteByCode = new Map(((remote && remote.credits) || []).map((row) => [row.code, creditFromServer(row)]));
        for (const part of creditParts) {
          const av = AVOIRS.find((a) => a.code === part.code);
          if (!av) continue;
          const saved = remoteByCode.get(part.code);
          av.balance = saved ? saved.balance : Math.max(0, av.balance - part.amount);
          av.status = saved ? saved.status : (av.balance > 0 ? 'active' : 'consumed');
          toast(av.balance > 0 ? `${av.code}, reste ${fmtMAD(av.balance)} dessus` : `${av.code} consommé en totalité`);
        }
        persistAvoirs();
      } catch (error) {
        committed = false;
        await refreshRemoteAvoirs();
        toast('Avoir refusé par le registre', 'Le solde a changé, le bon a expiré ou une autre caisse vient de l’utiliser. Aucun encaissement n’a été enregistré.');
        stepMethods();
        return;
      }
      const res = opts.onPaid(parts, { partial: !!partial, paidNow }) || {};
      if (res.error) { committed = false; stepMethods(); return; }
      if (res.sale) opts.sale = res.sale;
      if (partial || opts.balanceExisting) {
        opts.acompte = { total: opts.balanceTotal || opts.amount,
          paid: (opts.balancePaid || 0) + paidNow,
          remaining: Math.max(0, (opts.balanceTotal || opts.amount) - (opts.balancePaid || 0) - paidNow) };
        opts.amount = paidNow;
        opts.title = partial ? 'Acompte' : 'Solde de l’acompte';
      }
      if (res.delivery || parts.some((x) => x.m === 'livraison')) stepSuccess(parts, res);
      else { closeVeil('#mz-pay-veil'); printReceiptNow(opts, parts); }
    };

    const stepSuccess = (parts, res) => {
      const cash = parts.find((x) => x.m === 'espèces');
      const delivery = parts.some((x) => x.m === 'livraison') || (opts.sale && !!opts.sale.delivery);
      el.innerHTML = `
        <button class="mz-modal-x" data-mz-close aria-label="Fermer"><i data-lucide="x"></i></button>
        <h3 class="modal-title">${delivery ? 'Livraison enregistrée' : "C'est encaissé"}</h3>
        <p class="modal-subtle">${res.line ? esc(res.line) : esc(opts.title)}</p>
        ${cash && cash.rendu > 0 ? `
          <div class="cash-success-rendu">${fmtMAD(cash.rendu)}</div>
          <div class="cash-success-label">rendu à la cliente</div>` : `
          <div class="modal-amount size-md">${fmtMAD(opts.amount)}</div>`}
        <div class="mz-pay-break">
          ${parts.map((x) => `<div class="row"><span>${x.m === 'avoir' ? `Avoir ${x.code}` : x.m === 'carte' ? 'Carte, lecteur partenaire' : x.m === 'livraison' ? 'Livraison · à recevoir' : mLabel(x.m)}</span><b>${fmtMAD(x.amount)}</b></div>`).join('')}
        </div>
        <div class="modal-actions is-visible">
          <button class="ma-btn secondary" id="mz-pay-print"><i data-lucide="printer"></i>Reçu 80 mm</button>
          <button class="ma-btn secondary" id="mz-pay-gift"><i data-lucide="gift"></i>Ticket Cadeau</button>
          ${delivery ? '<button class="ma-btn secondary" id="mz-pay-del-note"><i data-lucide="truck"></i>Bon Livraison</button>' : ''}
          <button class="ma-btn secondary" id="mz-pay-wa"><i data-lucide="message-circle"></i>Reçu WhatsApp</button>
        </div>
        <div class="modal-actions is-visible" style="margin-top:10px;">
          <button class="ma-btn primary" id="mz-pay-done"><i data-lucide="check"></i>${esc(opts.doneLabel || 'Nouvelle vente')}</button>
        </div>`;
      icons(); closeBtns();
      $('#mz-pay-print', el).onclick = () => printReceiptNow(opts, parts);
      $('#mz-pay-gift', el).onclick = () => printReceiptNow(opts, parts, { gift: true });
      const delNoteBtn = $('#mz-pay-del-note', el);
      if (delNoteBtn) delNoteBtn.onclick = () => printDeliveryNoteNow(opts, parts);
      $('#mz-pay-wa', el).onclick = () => {
        if (!opts.waPhone) { toast('Cliente de passage, pas de numéro WhatsApp sur le ticket'); return; }
        const pv = pvPaired();
        const body = [
          (pv && pv.name) || 'Vogue Home',
          opts.ref ? ('Reçu ' + opts.ref) : 'Reçu',
          '',
          ...(opts.lines || []).map((l) => `${l.qty ? l.qty + '× ' : ''}${l.name} · ${fmtMAD(l.amount)}`),
          '',
          `TOTAL ${fmtMAD(opts.amount)}`,
          (parts || []).map((x) => x.m === 'avoir' ? 'Avoir' : x.m === 'livraison' ? 'Livraison · à recevoir' : mLabel(x.m)).join(' + '),
          '',
          'Merci !',
        ].filter((x) => x !== undefined).join('\n');
        const num = String(opts.waPhone).replace(/\D/g, '');
        try {
          window.open('https://wa.me/' + num + '?text=' + encodeURIComponent(body), '_blank', 'noopener');
          toast(`WhatsApp ouvert pour ${opts.waName || 'la cliente'}, appuyez sur envoyer`);
        } catch (_) { toast('Impossible d\'ouvrir WhatsApp'); }
      };
      $('#mz-pay-done', el).onclick = () => closeVeil('#mz-pay-veil');
    };

    stepMethods();
    openVeil('#mz-pay-veil');
  }

  /* ═══════════════════════ OFFLINE + VRAIE FILE SERVEUR ══════════════════ */
  function syncNetworkState(snapshot) {
    try {
      const q = snapshot || (window.KiwiLive && window.KiwiLive.queueStatus && window.KiwiLive.queueStatus());
      if (q) {
        state.queued = +q.pending || 0;
        state.syncStorageError = !!q.storageError;
        state.syncBlocked = state.syncStorageError || (+q.blocked || 0) > 0;
      }
    } catch (_) {}
    const browserOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
    state.offline = !!state.simulatedOffline || browserOffline;
    if (root) renderNet();
  }

  function toggleOffline() {
    if (!IS_DEMO) {
      syncNetworkState();
      toast(state.syncBlocked ? 'Synchronisation bloquée, contactez le support'
        : state.offline ? 'Wi-Fi indisponible, les ventes restent sur cette caisse'
          : state.queued ? `${state.queued} vente${state.queued > 1 ? 's' : ''} en cours de synchronisation`
            : 'Caisse en ligne, toutes les ventes sont synchronisées');
      return;
    }
    state.simulatedOffline = !state.simulatedOffline;
    syncNetworkState();
    toast(state.offline ? 'Mode hors-ligne simulé, la boutique continue' : 'Réseau simulé rétabli');
  }
  function renderNet() {
    const net = $('#mz-net', root);
    if (!net) return;
    net.classList.toggle('is-off', state.offline || state.syncBlocked);
    $('.mz-net-label', net).textContent = state.syncBlocked ? 'Sync bloquée' : state.offline ? 'Hors-ligne' : state.queued ? 'Synchronisation' : 'En ligne';
    let q = $('.mz-net-queue', net);
    if (state.queued) {
      if (!q) { q = document.createElement('b'); q.className = 'mz-net-queue'; net.appendChild(q); }
      q.textContent = state.queued;
    } else if (q) q.remove();
    const note = $('#mz-offline-note', root);
    if (!note) return;
    note.hidden = !state.offline && !state.syncBlocked;
    if (state.syncBlocked) {
      note.innerHTML = 'La synchronisation est bloquée. Les ventes restent sur cette caisse : contactez le support avant de vider les données du navigateur. <b id="mz-queue-count"></b>';
    } else {
      note.innerHTML = 'Hors-ligne, les ventes sont enregistrées sur la tablette et synchronisées au retour du réseau. <b id="mz-queue-count"></b>';
    }
    const count = $('#mz-queue-count', root);
    if (count) count.textContent = state.queued ? `${state.queued} en attente` : '';
  }

  /* ═══════════════════════ register ═══════════════════════ */
  /* ═══════════════════════════════════════════════════════════════════════════
   * INVENTAIRE — the caisse is for operational stock and barcode work only.
   * Catalogue ownership (product names, prices, categories and variants) stays
   * in the dashboard so the team has one controlled source of truth. The caisse
   * can still receive/adjust stock and register or print existing labels.
   * ─────────────────────────────────────────────────────────────────────────── */
  const catDB = () => window.KiwiBoutiqueCatalog;
  const fmtNum = (n) => globalThis.KiwiMoney.format(n || 0);

  function injectInvCss() {
    if (document.getElementById('mzi-css')) return;
    const st = document.createElement('style');
    st.id = 'mzi-css';
    st.textContent = `
      .bqi { height: 100%; overflow-y: auto; padding-bottom: 40px; }
      .mzi-tools { display: flex; gap: 12px; align-items: center; padding: 14px 22px 6px; }
      .mzi-scan { flex: 1; display: flex; align-items: center; gap: 10px; background: var(--paper); border: 1.5px solid var(--atlas); border-radius: 14px; padding: 12px 16px; }
      .mzi-scan svg { width: 20px; height: 20px; color: var(--atlas); }
      .mzi-scan input { flex: 1; border: none; background: transparent; outline: none; font: inherit; font-size: 15px; color: var(--ink); }
      .mzi-pills { display: flex; gap: 8px; flex-wrap: wrap; padding: 6px 22px; }
      .mzi-pill { border: 1px solid rgba(10,15,13,.14); background: var(--paper); border-radius: 999px; padding: 6px 13px; font-size: 12.5px; cursor: pointer; color: var(--ink); }
      .mzi-pill.on { background: var(--atlas); color: #fff; border-color: var(--atlas); }
      .mzi-kpis { display: flex; gap: 10px; padding: 6px 22px 10px; }
      .mzi-kpi { flex: 1; background: var(--paper); border: 1px solid rgba(10,15,13,.08); border-radius: 12px; padding: 10px 14px; display: flex; flex-direction: column; gap: 2px; }
      .mzi-kpi .l { font-size: 10px; letter-spacing: .06em; text-transform: uppercase; color: #77807b; }
      .mzi-kpi .v { font-size: 18px; font-weight: 600; font-family: var(--mono); }
      .mzi-kpi.warn { border-color: #E7B24D; background: #FBF3E2; }
      .mzi-list { padding: 4px 22px; display: flex; flex-direction: column; gap: 8px; }
      .mzi-row { display: flex; align-items: center; gap: 14px; background: var(--paper); border: 1px solid rgba(10,15,13,.08); border-radius: 14px; padding: 12px 16px; cursor: pointer; transition: border-color .15s; }
      .mzi-row:hover { border-color: var(--atlas); }
      .mzi-art { width: 40px; height: 40px; flex: 0 0 40px; color: var(--riad); }
      .mzi-art svg, .mzi-art img { width: 40px; height: 40px; }
      .mzi-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
      .mzi-info b { font-size: 14.5px; }
      .mzi-info span { font-size: 12px; color: #77807b; }
      .mzi-stock { font-family: var(--mono); font-size: 15px; font-weight: 600; min-width: 34px; text-align: right; }
      .mzi-stock.bas { color: #B8860B; } .mzi-stock.rupture { color: #9B2F22; }
      .mzi-price { font-family: var(--mono); font-size: 14px; min-width: 90px; text-align: right; }
      .mzi-mini { width: 34px; height: 34px; border-radius: 9px; border: 1px solid rgba(10,15,13,.14); background: var(--paper); cursor: pointer; color: var(--ink); display: inline-flex; align-items: center; justify-content: center; }
      .mzi-mini:hover { background: #f0eee7; } .mzi-mini svg { width: 16px; height: 16px; }
      .mzi-mini.danger { color: #9B2F22; }
      .mz-invm { width: min(720px, 94vw); max-height: 88vh; overflow-y: auto; padding: 0; }
      .mzi-modh { display: flex; align-items: center; gap: 14px; padding: 22px 24px 14px; border-bottom: 1px solid rgba(10,15,13,.08); }
      .mzi-modh h3 { margin: 0; font-size: 18px; } .mzi-modh > div { flex: 1; } .mzi-modh > div span { font-size: 12.5px; color: #77807b; }
      .mzi-vtable-wrap { padding: 8px 24px; }
      .mzi-vtable { width: 100%; border-collapse: collapse; font-size: 13px; }
      .mzi-vtable th { text-align: left; font-size: 10px; letter-spacing: .05em; text-transform: uppercase; color: #77807b; padding: 8px 6px; }
      .mzi-vtable td { padding: 9px 6px; border-top: 1px solid rgba(10,15,13,.07); vertical-align: middle; }
      .mzi-dot { display: inline-block; width: 13px; height: 13px; border-radius: 50%; border: 1px solid rgba(0,0,0,.18); vertical-align: -1px; margin-right: 6px; }
      .mzi-stk { display: inline-flex; align-items: center; gap: 5px; }
      .mzi-stk input { width: 46px; text-align: center; font-family: var(--mono); font-size: 14px; padding: 5px; border: 1px solid rgba(10,15,13,.16); border-radius: 8px; background: var(--paper); color: var(--ink); }
      .mzi-stk button { width: 28px; height: 28px; border-radius: 8px; border: 1px solid rgba(10,15,13,.16); background: var(--paper); cursor: pointer; font-size: 17px; line-height: 1; color: var(--ink); }
      .mzi-bc { display: flex; align-items: center; gap: 8px; }
      .mzi-code { font-family: var(--mono); font-size: 11px; color: #555; display: flex; flex-direction: column; }
      .mzi-code em { font-style: normal; font-size: 8.5px; letter-spacing: .04em; text-transform: uppercase; font-weight: 700; }
      .mzi-code em.gen { color: #0B6E4F; } .mzi-code em.imp { color: #8A6210; }
      .mzi-nocode { color: #99a; font-size: 12px; }
      .mzi-vact { display: flex; gap: 5px; justify-content: flex-end; }
      .mzi-modfoot { display: flex; gap: 8px; padding: 14px 24px 22px; flex-wrap: wrap; }
      .mzi-modfoot .mz-btn.danger { color: #9B2F22; }

      /* Douchette · diagnostic */
      .mz-scan-diag { display: inline-flex; align-items: center; gap: 8px; margin: 12px auto 0; padding: 9px 15px; background: transparent; border: 1px solid var(--n-200, #e7e3da); border-radius: 11px; font: inherit; font-size: 13px; color: var(--n-600, #5d6b63); cursor: pointer; }
      .mz-scan-diag:hover { border-color: var(--atlas); color: var(--atlas); }
      .mz-scan-diag svg { width: 15px; height: 15px; }
      .bqsd { padding: 4px 24px 0; }
      .bqsd-wait { display: flex; align-items: center; gap: 10px; padding: 26px 18px; color: var(--n-500, #7c8a80); background: var(--paper); border-radius: 14px; }
      .bqsd-wait svg { width: 20px; height: 20px; }
      .bqsd-v { padding: 13px 15px; border-radius: 12px; line-height: 1.5; font-size: 14px; }
      .bqsd-v.good { background: rgba(11,110,79,.07); color: var(--riad, #053B2C); }
      .bqsd-v.warn { background: rgba(184,124,32,.09); color: #7a5310; }
      .bqsd-v.bad  { background: rgba(155,47,34,.08); color: #9B2F22; }
      .bqsd-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(132px, 1fr)); gap: 8px; margin-top: 12px; }
      .bqsd-grid > div { background: var(--paper); border-radius: 11px; padding: 9px 12px; }
      .bqsd-grid span { display: block; font-size: 11px; letter-spacing: .04em; text-transform: uppercase; color: var(--n-500, #7c8a80); }
      .bqsd-grid b { font-family: var(--mono, monospace); font-size: 14px; font-weight: 600; word-break: break-all; }
      .bqsd-ok, .bqsd-no { margin-top: 12px; padding: 11px 14px; border-radius: 11px; font-size: 14px; }
      .bqsd-ok { background: rgba(11,110,79,.07); color: var(--riad, #053B2C); }
      .bqsd-no { background: var(--paper); color: var(--n-600, #5d6b63); }
      .bqsd-det { margin-top: 12px; font-size: 13px; }
      .bqsd-det summary { cursor: pointer; color: var(--n-600, #5d6b63); padding: 4px 0; }
      .bqsd-t { width: 100%; border-collapse: collapse; margin-top: 8px; font-family: var(--mono, monospace); font-size: 12px; }
      .bqsd-t th { text-align: left; font-weight: 500; color: var(--n-500, #7c8a80); padding: 4px 8px; border-bottom: 1px solid var(--n-200, #e7e3da); }
      .bqsd-t td { padding: 3px 8px; border-bottom: 1px solid rgba(0,0,0,.04); }
      .mzi-form { padding: 20px 24px 8px; }
      .mzi-fg { margin-bottom: 14px; } .mzi-fg label { display: block; font-size: 11px; letter-spacing: .05em; text-transform: uppercase; color: #77807b; margin-bottom: 6px; }
      .mzi-fg input, .mzi-fg select { width: 100%; padding: 11px 13px; border: 1px solid rgba(10,15,13,.16); border-radius: 10px; font: inherit; font-size: 14px; background: var(--paper); color: var(--ink); }
      .mzi-frow { display: flex; gap: 12px; } .mzi-frow .mzi-fg { flex: 1; }
      .mzi-cat-form { padding-bottom: 20px; }
      .mzi-cat-create { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:10px; align-items:end; padding:16px; border:1px solid rgba(11,110,79,.16); border-radius:14px; background:rgba(11,110,79,.045); }
      .mzi-cat-create .mzi-fg { margin:0; }
      .mzi-cat-create .mz-btn { min-height:42px; }
      .mzi-cat-list { display:grid; gap:10px; margin-top:18px; }
      .mzi-cat-empty { padding:24px 16px; border:1px dashed rgba(10,15,13,.14); border-radius:14px; color:#77807b; text-align:center; font-size:13px; }
      .mzi-cat-row { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:14px; align-items:center; padding:14px 16px; border:1px solid rgba(10,15,13,.10); border-radius:14px; background:var(--paper); }
      .mzi-cat-main { min-width:0; }
      .mzi-cat-meta { display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:7px; }
      .mzi-cat-meta b { font-size:13px; color:var(--ink); }
      .mzi-cat-count { padding:3px 8px; border-radius:999px; background:rgba(10,15,13,.06); color:#77807b; font-size:11px; white-space:nowrap; }
      .mzi-cat-main input { width:100%; padding:10px 12px; border:1px solid rgba(10,15,13,.14); border-radius:9px; font:inherit; font-size:14px; background:var(--paper); color:var(--ink); }
      .mzi-cat-actions { display:flex; gap:7px; align-items:center; }
      .mzi-cat-actions .mz-btn { min-height:38px; padding:8px 11px; }
      .mzi-cat-actions .mz-btn i { width:15px; height:15px; }
      .mzi-ab { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; }
      .mzi-ab label { display:flex; align-items:center; gap:10px; min-height:54px; margin:0; padding:11px 13px; border:1px solid rgba(10,15,13,.13); border-radius:12px; background:var(--paper); cursor:pointer; text-transform:none; letter-spacing:0; color:var(--ink); }
      .mzi-ab label:has(input:checked) { border-color:var(--atlas,#0b6e4f); box-shadow:0 0 0 2px rgba(11,110,79,.10); background:rgba(11,110,79,.045); }
      .mzi-ab input { width:auto; margin:0; accent-color:var(--atlas,#0b6e4f); }
      .mzi-ab b { display:block; font-size:13.5px; }
      .mzi-ab span { display:block; margin-top:2px; color:#77807b; font-size:11.5px; line-height:1.25; }
      .mzi-photo { display:grid; grid-template-columns:86px minmax(0,1fr); gap:12px; align-items:center; padding:12px; border:1px solid rgba(10,15,13,.12); border-radius:14px; background:rgba(10,15,13,.025); }
      .mzi-photo-preview { width:86px; height:86px; border-radius:11px; border:1px dashed rgba(10,15,13,.18); background:var(--paper); display:grid; place-items:center; overflow:hidden; color:#9aa09d; }
      .mzi-photo-preview img { width:100%; height:100%; object-fit:cover; }
      .mzi-photo-preview i { width:24px; height:24px; }
      .mzi-photo-copy { min-width:0; }
      .mzi-photo-copy b { display:block; font-size:13px; margin-bottom:3px; }
      .mzi-photo-status { min-height:16px; color:#77807b; font-size:11.5px; line-height:1.35; }
      .mzi-photo-actions { display:flex; gap:7px; flex-wrap:wrap; margin-top:9px; }
      .mzi-photo-actions .mz-btn { padding:7px 10px; min-height:36px; }
      @media (max-width:700px) {
        .mzi-cat-create, .mzi-cat-row { grid-template-columns:1fr; }
        .mzi-cat-actions { justify-content:flex-end; }
        .mzi-cat-create .mz-btn { width:100%; }
        .mzi-ab { grid-template-columns:1fr; }
        .mzi-photo { grid-template-columns:70px minmax(0,1fr); }
        .mzi-photo-preview { width:70px; height:70px; }
      }
      /* Le sélecteur de couleur vient de color-palette.js (.kc-*) · rien à
         redéfinir ici, c'est tout l'intérêt. Restent la pastille cliquable de la
         ligne variante et le rappel discret de la nuance d'origine. */
      .mzi-cbtn { display: inline-flex; align-items: center; gap: 6px; background: none; border: 0; padding: 2px 4px; margin: -2px -4px; border-radius: 7px; font: inherit; color: inherit; cursor: pointer; }
      .mzi-cbtn:hover { background: rgba(125,242,176,.14); }
      .mzi-dashboard-only { display: inline-flex; align-items: center; min-height: 34px; padding: 0 12px; border: 1px solid rgba(10,15,13,.12); border-radius: 9px; background: var(--paper-soft, #f3f1eb); color: #77807b; font: 600 11px var(--sans, sans-serif); white-space: nowrap; }
      .mzi-cbtn.is-locked, .mzi-mini.is-locked { opacity: .72; cursor: not-allowed; }
      .mzi-csrc { font-style: normal; font-size: 11px; opacity: .6; margin-left: 5px; }
      .mzi-iconpick { display: grid; grid-template-columns: repeat(auto-fill, minmax(46px, 1fr)); gap: 8px; max-height: 168px; overflow-y: auto; padding: 8px; border: 1px solid rgba(10,15,13,.14); border-radius: 12px; background: var(--paper); }
      .mzi-icon { aspect-ratio: 1; border: 1.5px solid rgba(10,15,13,.10); border-radius: 10px; background: var(--paper); cursor: pointer; padding: 5px; color: var(--riad); display: flex; align-items: center; justify-content: center; }
      .mzi-icon:hover { border-color: rgba(11,110,79,.5); }
      .mzi-icon.on { border-color: var(--atlas); border-width: 2px; background: #EAF5EF; }
      .mzi-icon .mz-art-photo { width: 100%; height: 100%; }
      .mzi-help { font-size: 12px; color: #77807b; margin-top: -6px; margin-bottom: 12px; }
      .mzi-help.is-good { color: var(--atlas); }
      .mzi-help.is-bad  { color: #9B2F22; }
      /* .mzi-help remonte de 6px pour se coller sous un <input> nu ; sous une
         boîte de scan (qui a sa propre bordure) ce retrait la fait chevaucher
         le cadre. */
      .bqx-scanbox + .mzi-help { margin-top: 7px; }
      .mzi-first { padding: 40px 26px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 8px; }
      .mzi-first svg { width: 34px; height: 34px; color: var(--atlas); margin-bottom: 4px; }
      .mzi-first b { font-size: 16px; color: var(--ink); }
      .mzi-first span { font-size: 13.5px; color: #6d766f; max-width: 46ch; line-height: 1.55; }
      .mzi-first em { font-style: normal; font-size: 12.5px; color: #8d968f; margin-top: 6px; }

      /* ─── Reprise de stock (saisie à la douchette) ─── */
      .bqx-head { display: flex; align-items: center; gap: 16px; padding: 20px 24px 14px; border-bottom: 1px solid rgba(10,15,13,.08); }
      .bqx-head-t { flex: 1; min-width: 0; }
      .bqx-head-t h3 { margin: 0 0 2px; font-size: 18px; }
      .bqx-head-t span { font-size: 12.5px; color: #77807b; line-height: 1.45; display: block; }
      .bqx-tally { display: flex; align-items: baseline; gap: 6px; background: var(--paper); border: 1px solid rgba(10,15,13,.08); border-radius: 12px; padding: 8px 14px; flex: 0 0 auto; }
      .bqx-tally b { font-family: var(--mono); font-size: 19px; font-weight: 600; color: var(--atlas); }
      .bqx-tally span { font-size: 11px; color: #77807b; }
      .bqx-tally i { width: 1px; height: 18px; background: rgba(10,15,13,.12); margin: 0 4px; }
      .bqx-body { padding: 18px 24px 6px; }
      .bqx-scanbox { display: flex; align-items: center; gap: 12px; background: var(--paper); border: 2px solid var(--atlas); border-radius: 14px; padding: 15px 17px; }
      .bqx-scanbox.slim { padding: 11px 14px; border-width: 1.5px; }
      .bqx-scanbox > svg { width: 22px; height: 22px; color: var(--atlas); flex: 0 0 auto; }
      .bqx-scanbox.slim > svg { width: 18px; height: 18px; }
      .bqx-scanbox input { flex: 1; min-width: 0; border: 0; background: transparent; outline: none; font: inherit; font-size: 17px; font-family: var(--mono); letter-spacing: .02em; color: var(--ink); }
      .bqx-scanbox.slim input { font-size: 15px; }
      .bqx-mini { width: 34px; height: 34px; flex: 0 0 34px; border-radius: 9px; border: 0; background: var(--atlas); color: #fff; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; }
      .bqx-mini svg { width: 17px; height: 17px; }
      .bqx-hint { font-size: 12.5px; color: #77807b; margin: 9px 2px 0; line-height: 1.45; }
      .bqx-hint.is-good { color: var(--atlas); }
      .bqx-hint.is-bad  { color: #9B2F22; font-weight: 500; }
      .bqx-hint.is-warn { color: #8A6210; }
      .bqx-alt { display: flex; gap: 8px; flex-wrap: wrap; margin: 14px 0 4px; }
      .bqx-log { display: flex; flex-direction: column; gap: 5px; margin: 14px 0 4px; }
      .bqx-log-row { display: flex; align-items: center; gap: 9px; background: var(--paper); border-radius: 10px; padding: 8px 12px; font-size: 13px; }
      .bqx-log-row svg { width: 15px; height: 15px; flex: 0 0 15px; color: var(--atlas); }
      .bqx-log-row span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .bqx-log-row em { font-style: normal; font-family: var(--mono); font-size: 11px; color: #8d968f; }
      .bqx-log-row.is-erreur svg { color: #9B2F22; }
      .bqx-log-row.is-recu svg { color: #8A6210; }
      .bqx-log-empty { margin: 16px 0 4px; padding: 16px; text-align: center; font-size: 12.5px; color: #8d968f; background: var(--paper); border-radius: 12px; line-height: 1.5; }
      .bqx-found { display: flex; align-items: center; gap: 13px; padding: 15px 24px; }
      .bqx-found svg { width: 22px; height: 22px; flex: 0 0 22px; }
      .bqx-found b { display: block; font-size: 14.5px; }
      .bqx-found.is-new { background: rgba(11,110,79,.06); } .bqx-found.is-new svg { color: var(--atlas); }
      .bqx-found.is-known { background: rgba(184,124,32,.09); } .bqx-found.is-known svg { color: #8A6210; }
      .bqx-found.is-fix { background: rgba(155,47,34,.06); } .bqx-found.is-fix svg { color: #9B2F22; }
      .bqx-codeline { font-family: var(--mono); font-size: 12.5px; color: #5d6b63; display: inline-flex; align-items: center; gap: 8px; flex-wrap: wrap; }
      .bqx-sym { font-family: 'Inter Tight', sans-serif; font-size: 10.5px; letter-spacing: .04em; text-transform: uppercase; font-weight: 700; color: var(--atlas); background: rgba(11,110,79,.10); border-radius: 5px; padding: 2px 6px; }
      .bqx-sym.warn { color: #8A6210; background: rgba(184,124,32,.14); }
      .bqx-form { padding-top: 16px; }
      .bqx-foot { border-top: 1px solid rgba(10,15,13,.08); margin-top: 4px; }
      .bqx-chain { display: flex; align-items: center; gap: 14px; margin: 14px 24px 0; padding: 13px 16px; background: var(--paper); border: 1px dashed rgba(11,110,79,.4); border-radius: 13px; }
      .bqx-chain.is-link { border-style: solid; border-color: rgba(184,124,32,.45); background: rgba(184,124,32,.05); }
      .bqx-chain > div { flex: 1; min-width: 0; }
      .bqx-linklist { display: flex; flex-direction: column; gap: 9px; margin-top: 10px; max-height: 300px; overflow-y: auto; }
      .bqx-linkprod { background: var(--paper); border: 1px solid rgba(10,15,13,.08); border-radius: 13px; padding: 11px 13px; }
      .bqx-linkhead { display: flex; align-items: center; gap: 11px; margin-bottom: 8px; }
      .bqx-linkhead .mzi-art, .bqx-linkhead .mzi-art svg, .bqx-linkhead .mzi-art img { width: 28px; height: 28px; flex: 0 0 28px; }
      .bqx-linkhead > div { flex: 1; min-width: 0; }
      .bqx-linkhead b { display: block; font-size: 14px; }
      .bqx-linkhead span { font-size: 11.5px; color: #77807b; }
      .bqx-chip.is-pick { cursor: pointer; font: inherit; font-size: 12.5px; color: var(--ink); }
      .bqx-chip.is-pick:hover { border-color: var(--atlas); background: rgba(11,110,79,.08); }
      .bqx-chain b { display: block; font-size: 13.5px; }
      .bqx-chain span { font-size: 12px; color: #77807b; line-height: 1.45; }
      .bqx-common { display: flex; align-items: baseline; gap: 10px; margin: 12px 24px 0; padding: 10px 14px; background: var(--paper); border-radius: 11px; }
      .bqx-common span { font-size: 10.5px; letter-spacing: .05em; text-transform: uppercase; color: #77807b; }
      .bqx-common b { font-size: 13.5px; }
      .bqx-known-card { display: flex; align-items: center; gap: 15px; padding: 16px 24px 8px; }
      .bqx-known-card > div { flex: 1; min-width: 0; }
      .bqx-known-card b { font-size: 16px; display: block; }
      .bqx-known-card span { display: block; font-size: 12.5px; color: #77807b; margin-top: 2px; }
      .bqx-thisvar { display: flex !important; align-items: center; gap: 7px; margin-top: 5px !important; }
      .bqx-thisvar i { width: 12px; height: 12px; border-radius: 50%; border: 1px solid rgba(0,0,0,.18); flex: 0 0 12px; }
      .bqx-existing { padding: 8px 24px 4px; }
      .bqx-existing > span { display: block; font-size: 10.5px; letter-spacing: .05em; text-transform: uppercase; color: #77807b; margin-bottom: 7px; }
      .bqx-chips { display: flex; gap: 6px; flex-wrap: wrap; }
      .bqx-chip { display: inline-flex; align-items: center; gap: 6px; background: var(--paper); border: 1px solid rgba(10,15,13,.10); border-radius: 999px; padding: 5px 11px; font-size: 12.5px; }
      .bqx-chip.on { border-color: var(--atlas); background: rgba(11,110,79,.08); }
      .bqx-chip i { width: 11px; height: 11px; border-radius: 50%; border: 1px solid rgba(0,0,0,.18); }
      .bqx-chip b { font-family: var(--mono); font-size: 12px; }
      .bqx-chip em { font-style: normal; color: #8d968f; }
      .bqx-acts { display: flex; flex-direction: column; gap: 9px; padding: 14px 24px 6px; }
      .bqx-act { background: var(--paper); border: 1px solid rgba(10,15,13,.08); border-radius: 13px; padding: 13px 16px; }
      .bqx-act-h { display: flex; align-items: center; gap: 8px; }
      .bqx-act-h svg { width: 16px; height: 16px; color: var(--atlas); }
      .bqx-act-h b { font-size: 13.5px; }
      .bqx-act p { margin: 4px 0 10px; font-size: 12px; color: #77807b; line-height: 1.45; }
      .bqx-qtyrow { display: flex; align-items: center; gap: 7px; }
      .bqx-qtyrow input { width: 62px; text-align: center; font-family: var(--mono); font-size: 16px; padding: 8px; border: 1px solid rgba(10,15,13,.16); border-radius: 9px; background: var(--surface, #fff); color: var(--ink); }
      .bqx-qtyrow .mz-btn { margin-left: 4px; }
      .bqx-pricediff { display: flex; align-items: center; justify-content: center; gap: 18px; padding: 20px 24px; }
      .bqx-pricediff > div { text-align: center; }
      .bqx-pricediff span { display: block; font-size: 10.5px; letter-spacing: .05em; text-transform: uppercase; color: #77807b; }
      .bqx-pricediff b { font-family: var(--mono); font-size: 19px; }
      .bqx-pricediff .next b { color: var(--atlas); }
      .bqx-pricediff > svg { width: 18px; height: 18px; color: #99a; }
      /* Le choix du code-barres à la création · trois options, la lentille liquide
         s'y attache via data-lens-demo / data-lens-item (assets/liquid-lens.js). */
      .bqx-choice { position: relative; display: grid; grid-template-columns: repeat(3, 1fr); gap: 7px; }
      .bqx-opt { position: relative; z-index: 1; text-align: left; background: var(--paper); border: 1.5px solid rgba(10,15,13,.10); border-radius: 12px; padding: 11px 13px; cursor: pointer; font: inherit; color: var(--ink); display: flex; flex-direction: column; gap: 2px; transition: border-color .15s; }
      .bqx-opt:hover { border-color: rgba(11,110,79,.45); }
      .bqx-opt.on { border-color: var(--atlas); background: rgba(11,110,79,.07); }
      .bqx-opt svg { width: 17px; height: 17px; color: var(--atlas); margin-bottom: 3px; }
      .bqx-opt b { font-size: 13px; }
      .bqx-opt span { font-size: 11.5px; color: #77807b; line-height: 1.38; }
      /* Quand la lentille liquide est attachée (assets/liquid-lens.js ajoute
         data-kw-lens), c'est ELLE qui porte le fond · dégradé atlas → riad. La
         pastille passe donc en transparent et son texte en clair, sinon on lit
         de l'encre sombre sur du vert sombre. Le style .on ci-dessus reste le
         repli lisible si la lentille n'est pas chargée. */
      .bqx-choice[data-kw-lens] .bqx-opt.on { background: transparent; border-color: transparent; }
      .bqx-choice[data-kw-lens] .bqx-opt.on b { color: #fff; }
      .bqx-choice[data-kw-lens] .bqx-opt.on span { color: rgba(255,255,255,.82); }
      .bqx-choice[data-kw-lens] .bqx-opt.on svg { color: var(--mint); }
      .bqx-choice .kw-lens { border-radius: 12px; }
      @media (max-width: 620px) {
        .bqx-choice { grid-template-columns: 1fr; }
        .bqx-head { flex-direction: column; align-items: flex-start; gap: 10px; }
      }
    `;
    document.head.appendChild(st);
  }

  /* ─── global keyboard-wedge : a USB scanner types fast + Enter, from anywhere ───
     A HID scanner (USB or Bluetooth — both enumerate as a keyboard, no driver) is
     just a very fast typist. Two things separate it from a human, and we use both:
     speed, and the terminating Enter.

     AZERTY: a scanner ships configured for a US layout and sends US SCANCODES. On
     a French/Moroccan AZERTY till the unshifted number row is & é " ' ( - è _ ç à,
     so reading e.key turned "2000000000015" into "é000000000015" and every scan
     came back "code inconnu" — the classic AZERTY failure in FR/MA shops. e.code
     is the PHYSICAL key and is layout-independent, so digits are read from it.
     That is correct for BOTH configurations: a US-layout scanner sends Digit2 for
     "2", and an AZERTY-configured one sends Shift+Digit2 — e.code is Digit2 either
     way. Letters stay on e.key (for a letter the two configurations genuinely
     disagree, and EAN/UPC/ITF — everything Kiwi prints and nearly all retail
     barcodes — are pure digits, so this is the safe side to err on). */
  /* Same AZERTY damage, other route: when a scan FIELD has focus (the Scan tab
     focuses one on open), the scanner's keystrokes arrive as normal text and the
     browser has already applied the layout — so the box literally contains
     "é000000000015". e.code can't help after the fact, but the corruption is a
     fixed, reversible substitution: the French unshifted number row. Only applied
     when the string is made ENTIRELY of those symbols and carries no digit at all,
     so a genuine alphanumeric code containing a "-" is never touched. */
  const AZ_ROW = { '&': '1', 'é': '2', '"': '3', "'": '4', '(': '5', '-': '6', 'è': '7', '_': '8', 'ç': '9', 'à': '0' };
  function normScan(raw) {
    const s = String(raw || '').trim();
    if (!s || /\d/.test(s)) return s;
    if (!/^[&é"'(\-è_çà]+$/.test(s)) return s;
    return s.replace(/./g, (ch) => AZ_ROW[ch] || ch);
  }
  function wedgeChar(e) {
    const c = e.code || '';
    if (/^Digit[0-9]$/.test(c)) return c.slice(5);
    if (/^Numpad[0-9]$/.test(c)) return c.slice(6);
    return (e.key && e.key.length === 1) ? e.key : '';
  }
  /* Non-null while the douchette diagnostic is open — see openScannerTest().
   * Declared here rather than beside it because the wedge listener below reads
   * it, and a `let` further down would sit in the temporal dead zone. */
  let scanDiagOff = null;

  function installWedgeScanner() {
    if (installWedgeScanner._done) return;
    installWedgeScanner._done = true;
    /* `started` datait la rafale EN COURS, mais n'était remis à zéro qu'après
     * 120 ms de silence — jamais après un Entrée. Deux scans séparés de moins de
     * 120 ms (un lecteur en mode présentation, ou une reprise de stock menée au
     * rythme) partageaient donc le même `started` : la durée mesurée du second
     * incluait le premier, `span/n` franchissait le seuil des 55 ms/caractère, et
     * la douchette cessait silencieusement d'être reconnue — sans erreur, sans
     * message, les scans suivants disparaissaient. Vu en test : sur une salve
     * continue, tout passait jusqu'au 97e article puis plus rien.
     * `started` est désormais posé au PREMIER caractère de chaque rafale (buf
     * vide), donc chaque scan est chronométré pour lui seul. */
    let buf = '', last = 0, started = 0;
    document.addEventListener('keydown', (e) => {
      if (!document.body.classList.contains('is-pos-maison')) return;
      /* While the diagnostic is open the scan belongs to it and to nothing else.
       * Without this the same keystrokes ALSO ran the normal route — dropping
       * the article on the ticket, or (on an unknown code) switching to the
       * inventory and opening "rattacher ce code". A test must not sell. */
      if (scanDiagOff) return;
      const tag = (e.target && e.target.tagName) || '';
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || (e.target && e.target.isContentEditable);
      const now = Date.now();
      if (now - last > 120) buf = '';        // rafale abandonnée en cours de route
      last = now;
      if (e.key === 'Enter') {
        const code = buf, span = now - started, n = code.length;
        buf = '';
        /* Average gap per character. A scanner runs ~2-15 ms; sustained sub-55 ms
           is ~220 WPM, which no one types. Without this a human pressing Enter
           after any 4 quick keys fired a phantom scan. */
        const fast = n >= 4 && (span / n) < 55;
        /* Pendant une saisie d'inventaire le scan appartient au formulaire, même
           si le curseur traîne dans un autre champ : sinon les chiffres tombent
           dans « Nom du produit » et l'employé les découvre à l'enregistrement. */
        if (fast && scanCapture) { e.preventDefault(); unleak(e.target, code); handleWedge(code); return; }
        if (fast && !typing) { e.preventDefault(); handleWedge(code); }
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (!buf) started = now;               // premier caractère de CETTE rafale
      buf += wedgeChar(e);
    }, true);
  }
  /* ─── à qui appartient le prochain scan ? ────────────────────────────────────
   * Non-null quand une SAISIE D'INVENTAIRE attend un code (reprise de stock déjà
   * étiqueté, rattachement, réception). Tant que c'est armé, la douchette n'écrit
   * QUE dans ce formulaire.
   *
   * Sans cela le routage ne regardait que `state.view`, et un scan pendant la
   * saisie partait quand même sur le ticket : l'employé qui reprend son stock
   * vendait ses articles un par un sans le voir. La règle du cahier des charges
   * est explicite — scanner pendant la mise en stock ne doit JAMAIS mettre au
   * panier, ni vendre, ni bouger le stock avant confirmation, ni imprimer. */
  let scanCapture = null;
  function armScanCapture(fn) { scanCapture = fn; }
  function disarmScanCapture(fn) { if (!fn || scanCapture === fn) scanCapture = null; }

  /* Les caractères d'une rafale sont tapés au fil de l'eau : seul « Entrée » est
   * interceptable après coup. Si le curseur était dans un autre champ, le code
   * vient de s'y écrire — on retire ce suffixe, et rien d'autre. La comparaison
   * porte sur le brut ET sur la version AZERTY mutilée (&é"' au lieu de 1234),
   * puisque c'est exactement ce que le champ a reçu. */
  function unleak(target, code) {
    if (!target || target.value == null || typeof target.value !== 'string') return;
    const val = target.value;
    const az = Object.entries(AZ_ROW).reduce((s, [ch, d]) => s.split(d).join(ch), code);
    for (const tail of [code, az]) {
      if (tail && val.length >= tail.length && val.slice(-tail.length) === tail) {
        target.value = val.slice(0, -tail.length);
        return;
      }
    }
  }

  function handleWedge(code) {
    if (scanCapture) { try { scanCapture(code); } catch (_) {} return; }  /* saisie inventaire */
    if (state.view === 'inventaire') { invScanHandle(code); return; }   /* fiche stock */
    if (state.view === 'scan') { lookupScan(code); return; }            /* vérif prix/stock */
    commitEan(code);                                                    /* vente → ticket */
  }

  /* ─── Douchette · diagnostic ─────────────────────────────────────────────
   * "La douchette ne marche pas" is, at the counter, always one of five things,
   * and from the merchant's side they look identical — nothing happens:
   *   1. the device sends nothing at all (cable/HID mode),
   *   2. it types through a keyboard layout that mangles the digits (a US-mode
   *      scanner on a French Windows sends &é"' where we expect 1234),
   *   3. it never sends the Enter suffix, so no scan is ever committed,
   *   4. it is genuinely too slow / it was a human typing,
   *   5. it reads perfectly and the code simply is not in the catalogue yet.
   * Guessing between those costs a shop visit. This captures one raw burst and
   * names which one it is. It also dumps code→key per character, because that
   * is the only way to tell a US-mode scanner from a locale-matched one — and
   * that determines whether letters (Code 128) need the same fix digits got. */
  function openScannerTest() {
    let ev = [], last = 0, burst = null;

    const finish = () => {
      const chars = ev.filter((x) => x.ch !== '');
      const raw = chars.map((x) => x.ch).join('');
      /* What the OS actually delivered, before wedgeChar() reads the key by its
       * physical position. On a US-mode scanner plugged into a French Windows
       * these differ (é000000000&( vs 2000000000015) — and that difference is
       * the ONLY way to show the merchant that a layout fix happened, since
       * `raw` is already corrected by the time we see it. */
      const typed = chars.map((x) => (x.key && x.key.length === 1) ? x.key : '').join('');
      burst = {
        ev: ev.slice(), raw, typed, norm: normScan(raw),
        n: chars.length,
        span: ev.length ? (ev[ev.length - 1].t - ev[0].t) : 0,
        enter: ev.some((x) => x.key === 'Enter'),
      };
      ev = [];
      paint();
    };

    const onKey = (e) => {
      const now = Date.now();
      if (now - last > 400) ev = [];       // new burst
      last = now;
      if (e.key === 'Enter') {
        e.preventDefault();
        ev.push({ code: e.code || '', key: 'Enter', ch: '', t: now });
        finish();
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      ev.push({ code: e.code || '', key: e.key, ch: wedgeChar(e), shift: !!e.shiftKey, t: now });
      // A scanner with no Enter suffix never calls finish() — settle it ourselves.
      clearTimeout(onKey._t);
      onKey._t = setTimeout(() => { if (ev.length) finish(); }, 500);
    };

    function verdict(b) {
      if (!b) return null;
      if (!b.n) return { tone: 'bad', t: 'Aucun caractère reçu. La douchette n\'est pas vue comme un clavier : vérifiez le câble USB, ou remettez-la en mode « HID / clavier » avec son code de configuration.' };
      const perChar = b.n > 1 ? b.span / b.n : 0;
      if (!b.enter) return { tone: 'warn', t: `${b.n} caractères lus, mais aucune touche Entrée. Kiwi valide un scan sur Entrée : configurez le suffixe « CR / Entrée » de la douchette (code de configuration dans sa notice).` };
      if (b.n >= 4 && perChar >= 55) return { tone: 'warn', t: `Lecture correcte mais lente (${Math.round(perChar)} ms/caractère). À cette vitesse Kiwi la prend pour une saisie au clavier. Si c'est bien la douchette, dites-le-nous, on relèvera le seuil.` };
      if (b.typed && b.typed !== b.raw) return { tone: 'good', t: `Douchette détectée. Elle est en clavier US sur un Windows français · Kiwi corrige toute seule (${esc(b.typed)} → ${esc(b.norm)}). Il n'y a rien à reconfigurer sur la douchette.` };
      return { tone: 'good', t: `Douchette détectée et lue correctement (${Math.round(perChar)} ms/caractère).` };
    }

    function match(code) {
      if (!code) return '';
      const cat = window.KiwiBoutiqueCatalog;
      const hit = cat && cat.resolveScan ? cat.resolveScan(code) : null;
      const pid = hit ? hit.pid : BY_EAN[code];
      if (pid && P[pid]) return `<div class="bqsd-ok">Article trouvé : <b>${esc(P[pid].name)}</b></div>`;
      return `<div class="bqsd-no">Code lu correctement, mais aucun article ne le porte encore. Enregistrez-le depuis l'inventaire.</div>`;
    }

    function paint() {
      const b = burst, v = verdict(b);
      const sym = (b && b.norm && window.KiwiBarcode && window.KiwiBarcode.detect) ? window.KiwiBarcode.detect(b.norm) : '';
      const rows = b ? b.ev.filter((x) => x.key !== 'Enter').map((x) =>
        `<tr><td>${esc(x.code || '·')}</td><td>${esc(x.key)}</td><td>${esc(x.ch || '·')}</td></tr>`).join('') : '';
      invSetModal(`
        <button class="mz-modal-x" data-inv-x aria-label="Fermer"><i data-lucide="x"></i></button>
        <div class="mzi-modh"><div><h3>Test de la douchette</h3><span>Scannez n'importe quel article. Rien n'est vendu, rien n'est modifié.</span></div></div>
        <div class="bqsd">
          ${!b ? `<div class="bqsd-wait"><i data-lucide="scan-line"></i>En attente d'un scan…</div>` : `
            <div class="bqsd-v ${v.tone}">${v.t}</div>
            <div class="bqsd-grid">
              <div><span>Code lu</span><b>${esc(b.norm) || '·'}</b></div>
              <div><span>Caractères</span><b>${b.n}</b></div>
              <div><span>Vitesse</span><b>${b.n > 1 ? Math.round(b.span / b.n) + ' ms/car.' : '·'}</b></div>
              <div><span>Touche Entrée</span><b>${b.enter ? 'oui' : 'non'}</b></div>
              <div><span>Symbologie</span><b>${esc(sym || '·')}</b></div>
              <div><span>Frappe clavier</span><b>${esc(b.typed) || '·'}</b></div>
            </div>
            ${b.n ? match(b.norm) : ''}
            <details class="bqsd-det"><summary>Détail touche par touche</summary>
              <table class="bqsd-t"><thead><tr><th>code physique</th><th>caractère reçu</th><th>lu par Kiwi</th></tr></thead><tbody>${rows}</tbody></table>
            </details>`}
        </div>
        <div class="mzi-modfoot">
          <button class="mz-btn secondary" id="bqsd-copy">Copier le diagnostic</button>
          <button class="mz-btn" data-inv-x>Terminer</button>
        </div>`, (el) => {
        const cp = $('#bqsd-copy', el);
        if (cp) cp.onclick = () => {
          const txt = JSON.stringify({ ua: navigator.userAgent, burst: burst && { raw: burst.raw, norm: burst.norm, n: burst.n, span: burst.span, enter: burst.enter, ev: burst.ev.map((x) => [x.code, x.key, x.ch]) } }, null, 1);
          (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(
            () => toast('Diagnostic copié'), () => toast('Copie impossible sur cet appareil'));
        };
      });
    }

    if (scanDiagOff) scanDiagOff();
    document.addEventListener('keydown', onKey, true);
    // The panel must keep listening while it is open, and stop the moment the
    // veil closes — by the X, the footer button, Escape or a click outside.
    const veil = $('#mz-inv-veil', root);
    const obs = veil ? new MutationObserver(() => {
      if (!veil.classList.contains('is-open') && scanDiagOff) scanDiagOff();
    }) : null;
    if (obs) obs.observe(veil, { attributes: true, attributeFilter: ['class'] });
    scanDiagOff = () => {
      document.removeEventListener('keydown', onKey, true);
      clearTimeout(onKey._t);
      if (obs) obs.disconnect();
      scanDiagOff = null;
    };
    paint();
  }
  function invScanHandle(raw) {
    const code = normScan(raw);
    const cat = catDB(); if (!cat) return;
    const hit = cat.findByBarcode(code);
    if (hit) { toast(`${hit.product.name} · ${hit.variant.colorLabel} ${hit.variant.size}`); openInvProduct(hit.product.id); return; }
    /* Code inconnu depuis l'inventaire : c'est presque toujours un article que la
       boutique possède mais que Kiwi ne connaît pas encore. On ouvre la reprise
       de stock avec ce code, où il peut devenir un nouvel article OU une
       déclinaison du précédent — l'ancien sélecteur, lui, exigeait de choisir un
       produit déjà existant et ne savait pas en créer. */
    toast(`Code ${code} inconnu, à enregistrer`);
    intakeStartWith(code);
  }

  /* Entrer dans la reprise avec un code déjà lu (scan depuis l'inventaire). */
  function intakeStartWith(raw) {
    if (!catDB()) { toast('Base d\'inventaire indisponible'); return; }
    if (state.view !== 'inventaire') switchView('inventaire');
    if (!intake.open) { intake.open = true; intakeReset(); }
    intakeTake(raw);
  }
export { armScanCapture, bqReal, catDB, disarmScanCapture, fmtNum, injectInvCss, installWedgeScanner, invScanHandle, lineAvailableQty, lineReturnedQty, normScan, openExchSummary, openPay, openScannerTest, openVoucher, renderAcomptes, renderEchanges, renderNet, syncNetworkState, toggleOffline };
