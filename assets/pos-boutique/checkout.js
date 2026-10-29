import { saleClient, root, state, retDayKey, retShiftDay, RETAIN_DAYS, SALES, activeAvoirs, AVOIRS, findSale, toast, whenLabel, P, switchView, issueAvoir, stableCreditIssueId, creditErrorDetail, persistAvoirs, recordReturn, refreshOps, persistStock, stockAdd, persistDay, openVeil, closeVeil, newSaleId, variantStock, IS_DEMO, colorKey, showStockIssue, queueIfOffline, renderBadges, nextStandaloneTicketNumber, releaseTicketNumber, firstName, STAFF, bqSaveProvisional, bqPaymentMethod, bqPost, bqPaymentParts, headSubVente, pvPaired, merchantSlug, payExistingBalance, renderAll, creditIntent, creditRequest, creditFromServer, avoirExpired, refreshRemoteAvoirs, BY_EAN, lineUnit } from '../pos-boutique.js?v=215';
import { $, esc, fmtMAD, icons, moveCaretEnd, artOf, colorDot, useKiwiCl, fmtDayY, fmtValidUntil, barcode, $$, shelf, colorLabel, renderExchNote, renderGrid, rayonOf, fmtDT, clById, clientList, lookupScan, commitEan } from './sales.js?v=116';
import { invSetModal, openInvProduct, intake, intakeReset, intakeTake } from './inventory.js?v=116';
import { ticketOwner } from './ticket-owner.js?v=3';
import '../money-cents.js?v=4';
const M = globalThis.KiwiMoney;


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
    const panel = $('[data-bq-panel="echanges"]', root);
    const q = state.retQuery;
    /* Une vente sortie des livres ne se retourne pas : elle n'a plus eu lieu, sa
       marchandise est déjà revenue en stock, et l'échanger créerait un avoir
       adossé à un encaissement que le serveur ne connaît plus. */
    const dateKey = retDayKey; /* journée commerciale (5 h), comme le Z : minuit rangeait 0 h 30 au lendemain */
    const todayKey = retDayKey(Date.now()), yesterdayKey = retShiftDay(todayKey, -1), oldestKey = retShiftDay(todayKey, -(RETAIN_DAYS - 1));
    if (state.retDate < oldestKey || state.retDate > todayKey) state.retDate = todayKey;
    const hits = SALES.filter((s) => !s.voided && dateKey(s.at) === state.retDate && saleMatches(s, q));
    const ret = state.ret;
    panel.innerHTML = `
      <div class="bq-ret">
        <header class="bq-head">
          <div><h1>Échanges &amp; avoirs</h1><div class="bq-head-sub">Retour sous 7 jours avec ticket, échange ou avoir, jamais de remboursement espèces</div></div>
          <div class="bq-search"><i data-lucide="search"></i>
            <input id="bq-ret-q" placeholder="N° de ticket ou téléphone…" value="${esc(q)}" /></div>
        </header>
        <div class="bq-ret-bar">
          <button class="bq-pill ${state.retDate === todayKey ? 'ok' : ''}" type="button" data-bq-ret-day="${todayKey}">Aujourd'hui</button>
          <button class="bq-pill ${state.retDate === yesterdayKey ? 'ok' : ''}" type="button" data-bq-ret-day="${yesterdayKey}">Hier</button>
          <label class="bq-ret-bar-lbl">Date
            <input id="bq-ret-date" type="date" min="${oldestKey}" max="${todayKey}" value="${state.retDate}" class="bq-ret-date-input" />
          </label>
        </div>
        <div class="bq-ret-scroll"><div class="bq-ret-inner">
          ${activeAvoirs().length ? `
            <div class="bq-ret-bar" style="margin-top:14px;">
              <div class="bq-ret-bar-lbl">Avoirs actifs · ${activeAvoirs().length}</div>
              ${activeAvoirs().map((a) => `
                <button class="bq-favoir" data-bq-av="${a.code}" style="margin-bottom:6px;">
                  <i data-lucide="ticket"></i><b>${a.code}</b> · ${fmtMAD(a.balance)}, ${esc(a.holderName)}<span class="see">Voir</span>
                </button>`).join('')}
            </div>` : ''}
          ${hits.map((s) => saleCard(s, ret)).join('') || (String(q).trim()
            ? `<div class="bq-empty" style="display:flex; flex-direction:column; align-items:center; padding:36px 16px;"><div style="width:40px; height:40px; border-radius:12px; background:rgba(11,110,79,0.10); color:var(--atlas); display:grid; place-items:center; margin-bottom:10px;"><svg width="20" height="20" viewBox="0 -960 960 960" fill="currentColor"><path d="M200-80q-33 0-56.5-23.5T120-160v-451q-18-11-29-28.5T80-680v-120q0-33 23.5-56.5T160-880h640q33 0 56.5 23.5T880-800v120q0 23-11 40.5T840-611v451q0 33-23.5 56.5T760-80H200Zm0-520v440h560v-440H200Zm-40-80h640v-120H160v120Zm200 280h240v-80H360v80Zm120 20Z"/></svg></div><div style="font-weight:600; color:var(--ink);">Rien pour « ${esc(q)} »</div><div style="font-size:12.5px; color:var(--n-500); margin-top:4px;">Vérifiez le n° de ticket ou le téléphone.</div></div>`
            /* Rien tapé encore : une boutique sans vente du jour ouvrait cette page
               sur « Rien pour «  » », un échec de recherche que personne n'a lancée. */
            : `<div class="bq-empty" style="display:flex; flex-direction:column; align-items:center; padding:36px 16px;"><div style="width:40px; height:40px; border-radius:12px; background:rgba(11,110,79,0.10); color:var(--atlas); display:grid; place-items:center; margin-bottom:10px;"><svg width="20" height="20" viewBox="0 -960 960 960" fill="currentColor"><path d="M200-80q-33 0-56.5-23.5T120-160v-451q-18-11-29-28.5T80-680v-120q0-33 23.5-56.5T160-880h640q33 0 56.5 23.5T880-800v120q0 23-11 40.5T840-611v451q0 33-23.5 56.5T760-80H200Zm0-520v440h560v-440H200Zm-40-80h640v-120H160v120Zm200 280h240v-80H360v80Zm120 20Z"/></svg></div><div style="font-weight:600; color:var(--ink);">Retrouver une vente</div><div style="font-size:12.5px; color:var(--n-500); margin-top:4px;">Scannez le ticket de la cliente, ou tapez son numéro de téléphone.</div></div>`)}
        </div></div>
      </div>`;
    $('#bq-ret-q', panel).oncompositionend = (e) => e.target.dispatchEvent(new Event('input'));
    $('#bq-ret-q', panel).oninput = (e) => {
      /* The panel re-renders, but the field the cashier is typing in survives:
         swapping a fresh <input> in on every key dropped the iOS keyboard and
         broke accent long-press and Arabic composition mid-word. */
      if (e.isComposing) return;
      const typed = e.target;
      state.retQuery = typed.value;
      renderEchanges(); icons();
      const fresh = $('#bq-ret-q', panel);
      if (fresh && fresh !== typed) fresh.replaceWith(typed);
      if (document.activeElement !== typed) { typed.focus(); moveCaretEnd(typed); }
    };
    $('#bq-ret-date', panel).onchange = (e) => {
      state.retDate = String(e.target.value || todayKey);
      state.ret = null;
      renderEchanges(); icons();
    };
    panel.onclick = (e) => {
      const dayB = e.target.closest('[data-bq-ret-day]');
      if (dayB) { state.retDate = dayB.dataset.bqRetDay; state.ret = null; renderEchanges(); icons(); return; }
      const avB = e.target.closest('[data-bq-av]');
      if (avB) { openVoucher(AVOIRS.find((a) => a.code === avB.dataset.bqAv), { mode: 'view' }); return; }
      const qtyB = e.target.closest('[data-bq-ret-qty]');
      if (qtyB && state.ret) {
        const [saleId, idxS, deltaS] = qtyB.dataset.bqRetQty.split(':');
        const idx = Number(idxS), sale = findSale(saleId);
        if (sale && state.ret.saleId === saleId && state.ret.picks.has(idx)) {
          const current = pickedQty(state.ret, idx, sale.lines[idx]);
          state.ret.quantities.set(idx, Math.max(1, Math.min(lineAvailableQty(sale.lines[idx]), current + Number(deltaS))));
          renderEchanges(); icons();
        }
        return;
      }
      const lnB = e.target.closest('[data-bq-pick]');
      if (lnB) { togglePick(lnB.dataset.bqPick); return; }
      const lockB = e.target.closest('[data-bq-locked]');
      if (lockB) { toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Pièce déjà retournée, rien à reprendre dessus')); return; }
      const motif = e.target.closest('[data-bq-motif]');
      if (motif && state.ret) { state.ret.motif = motif.dataset.bqMotif; renderEchanges(); icons(); return; }
      const exch = e.target.closest('[data-bq-do-exch]');
      if (exch) { doExchange(); return; }
      const avoir = e.target.closest('[data-bq-do-avoir]');
      if (avoir) { doAvoir(); return; }
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
    return `<div class="bq-sale">
      <div class="bq-sale-top">
        <span class="bq-sale-num">${s.id}</span>
        <!-- whenLabel et non fmtHM : la liste couvre la semaine, et « 14:32 »
             tout court ne dit pas si la vente est de ce matin ou de mardi. -->
        <span class="bq-sale-when">${whenLabel(s.at)} · par ${esc(s.by)}</span>
        <span class="bq-pill ${s.kind === 'echange' ? 'warn' : 'ok'}">${s.kind === 'echange' ? 'échange' : esc(s.methods)}</span>
        ${hasRet ? '<span class="bq-pill warn">retour</span>' : ''}
        ${s.kind === 'acompte' ? '<span class="bq-pill warn">Acompte · retour suspendu, contacter le responsable</span>' : ''}
        <span class="bq-sale-who"><i data-lucide="${c ? 'user' : 'users'}"></i>${c ? esc(c.name) : 'Cliente de passage'} · ${fmtMAD(s.total)}</span>
      </div>
      <div class="bq-sale-lines">
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
            return `<button class="bq-sline is-locked" data-bq-locked="1">
              <span class="tick"></span>
              <span class="bq-line-art">${artOf(p)}</span>
              <span class="mid"><span class="bq-line-name">${esc(p.name)}</span>
                <span class="bq-line-sub"><span class="sz">${esc(l.size)}</span> ${esc(l.note || 'retournée')}</span></span>
              <span class="bq-pill warn">retournée</span>
            </button>`;
          }
          const chosenQty = sel.has(i) ? pickedQty(ret, i, l) : 1;
          return `<button class="bq-sline ${sel.has(i) ? 'on' : ''}" data-bq-pick="${s.id}:${i}">
            <span class="tick"><i data-lucide="check"></i></span>
            <span class="bq-line-art">${artOf(p)}</span>
            <span class="mid"><span class="bq-line-name">${esc(p.name)}</span>
              <span class="bq-line-sub">
                ${colorDot(l.color)}
                <span class="sz">${esc(l.size)}</span> ${availableQty > 1 ? `× ${availableQty} disponibles` : ''} ${returnedQty ? `· ${returnedQty} déjà retournée${returnedQty > 1 ? 's' : ''}` : ''} ${l.remise ? `· remise −${l.remise} %` : ''}
              </span></span>
            <span class="amt">${fmtMAD(paidUnit(s, l) * availableQty)}</span>
          </button>${sel.has(i) && availableQty > 1 ? `
            <div class="bq-ret-qty" style="display:flex;align-items:center;justify-content:flex-end;gap:10px;padding:7px 12px 10px;">
              <span style="font-size:12px;color:var(--ink-3);">Quantité à retourner</span>
              <button class="bq-chip" type="button" data-bq-ret-qty="${s.id}:${i}:-1" aria-label="${(globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Retirer une pièce')}">−</button>
              <b>${chosenQty}</b>
              <button class="bq-chip" type="button" data-bq-ret-qty="${s.id}:${i}:1" aria-label="${(globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Ajouter une pièce')}">+</button>
              <strong>${fmtMAD(paidUnit(s, l) * chosenQty)}</strong>
            </div>` : ''}`;
        }).join('')}
      </div>
      ${sel.size ? `
      <div class="bq-ret-bar">
        <div class="bq-ret-bar-lbl">Motif du retour</div>
        <div class="bq-chips">
          ${MOTIFS.map((m) => `<button class="bq-chip ${ret.motif === m ? 'on' : ''}" data-bq-motif="${esc(m)}">${esc(m)}</button>`).join('')}
        </div>
        <div class="bq-ret-actions">
          <button class="bq-btn secondary" data-bq-do-exch><i data-lucide="arrow-left-right"></i>Échanger la pièce</button>
          <button class="bq-btn primary" data-bq-do-avoir><i data-lucide="ticket"></i>Émettre un avoir · ${fmtMAD(selVal)}</button>
        </div>
      </div>` : ''}
    </div>`;
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
    if (ret.picks.size !== 1) { toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('L\'échange se fait pièce par pièce, gardez une seule ligne cochée')); return; }
    const idx = ret.picks.values().next().value;
    const sale = findSale(ret.saleId);
    if (sale?.kind === 'acompte') { toast('Retour suspendu sur un acompte'); return; }
    const ln = sale.lines[idx];
    const qty = pickedQty(ret, idx, ln);
    if (qty !== 1) { toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('L\'échange se fait une pièce à la fois, choisissez la quantité 1')); return; }
    /* Le motif choisi sur la fiche de retour suit l'échange jusqu'au registre :
       sans lui, tout échange y était classé « Echange », c'est-à-dire rien —
       la colonne motif répétait la colonne type et le registre ne disait plus
       pourquoi la pièce était revenue. */
    ticketOwner.startReturn(state, { saleId: ret.saleId, idx, qty: 1, motif: ret.motif || '' });
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
    state.retBusy = true;
    let av;
    try {
      /* L'avoir est inscrit au registre AVANT que le stock ou la vente bougent. */
      av = await issueAvoir(amount, c, `${motif}, retour ${sale.id}`, sale.serverId || sale.syncId || sale.id, {
        requestId: stableCreditIssueId(sale, quantities, M.toCents(amount)),
        originalRef: sale.id, originalSale: sale, resellable: true,
        lines: idxs.map((i) => ({
          itemId: sale.lines[i].pid, variantId: [sale.lines[i].pid || '', sale.lines[i].size || '', sale.lines[i].color || ''].join(':'),
          name: (P[sale.lines[i].pid] && P[sale.lines[i].pid].name) || sale.lines[i].name || 'Article',
          size: sale.lines[i].size || '', qty: quantities.get(i), unitCents: M.toCents(paidUnit(sale, sale.lines[i])),
        })),
      });
    } catch (error) {
      toast('Avoir non émis', creditErrorDetail(error));
      return;
    } finally {
      state.retBusy = false;
    }
    restoreLines(sale, idxs, quantities, `avoir (${motif.toLowerCase()})`);
    // La fiche client liste les pièces rendues sous l'avoir (#105).
    av.lines = idxs.map((i) => {
      const ln = sale.lines[i];
      return ln ? { name: (P[ln.pid] && P[ln.pid].name) || ln.name || 'Article', qty: Number(quantities.get(i)) || 1, pid: ln.pid || '' } : null;
    }).filter(Boolean);
    persistAvoirs();
    recordReturn(sale, idxs, amount, motif, 'avoir', av.code, quantities);
    /* L'argent rendu en avoir sort de la dépense et des points de la cliente ;
       l'avoir dépensé plus tard y rentrera, une seule fois. Clé = le code de
       l'avoir : un double clic ne reprend pas deux fois. */
    const holder = saleClient(sale);
    if (holder && useKiwiCl() && window.KiwiClients && window.KiwiClients.recordRefund) {
      try { window.KiwiClients.recordRefund(holder.id, { amount, saleRef: sale.id, eventRef: av.code,
        items: av.lines.map((l) => ({ name: l.name, qty: l.qty, id: l.pid || '' })) }); } catch (_) {}
    } else if (holder && !useKiwiCl()) {
      holder.spent = Math.max(0, (Number(holder.spent) || 0) - amount);
    }
    state.ret = null;
    refreshOps();
    openVoucher(av, { mode: 'fresh' });
  }

  function restoreLines(sale, idxs, quantities, note) {
    let unresolved = 0;
    idxs.forEach((i) => {
      const ln = sale.lines[i];
      const qty = Math.min(lineAvailableQty(ln), Number(quantities.get(i)) || 0);
      if (!qty) return;
      // Returned pieces go back into the real inventory too, not just the display.
      const restored = persistStock(ln.pid, ln.size, ln.color, qty,
        sale.id, 'retour');
      stockAdd(ln.pid, ln.size, qty);
      markLineReturned(ln, qty, restored ? note : `${note} · stock à rapprocher`);
      if (!restored) unresolved += qty;
    });
    persistDay();  // le retour change la recette du jour, pas seulement l'affichage
    if (unresolved) toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Retour enregistré, stock à rapprocher'), `${unresolved} pièce${unresolved > 1 ? 's' : ''} appartenait à une variante supprimée du catalogue.`);
    return unresolved === 0;
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
    return `<div class="bq-avoir">
      <div class="c b lg">${esc((bqName('Maison Mansour') || 'Boutique').toUpperCase())}</div>
      <div class="c mut">${bqReal() ? (bqCity('') ? esc(bqCity('')) + ' · ' : '') + 'propulsé par Kiwi' : '12 rue Aïn Harrouda, Maarif, Casablanca<br>05 22 25 XX XX · propulsé par Kiwi'}</div>
      <hr>
      <div class="c b">BON D'AVOIR</div>
      <div class="bq-avoir-amt">${fmtMAD(av.balance)}</div>
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
      <div class="bq-avoir-code">${av.code} · ${esc((bqName('Maison Mansour') || 'Boutique').toUpperCase())}</div>
      <div class="c mut" style="margin-top:6px;">Utilisable en caisse, en une ou plusieurs fois.<br>Ni repris, ni remboursé en espèces.</div>
    </div>`;
  }

  function openVoucher(av, ctx) {
    if (!av) return;
    const fresh = ctx && ctx.mode === 'fresh';
    const el = $('#bq-avoirmm', root);
    el.innerHTML = `
      <button class="bq-modal-x" data-bq-close aria-label="${(globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Fermer')}"><i data-lucide="x"></i></button>
      <h3 class="modal-title">${fresh ? `Avoir émis, ${av.code}` : `Avoir ${av.code}`}</h3>
      <p class="modal-subtle">${esc(av.holderName)} · ${fmtMAD(av.balance)} ${av.balance > 0 ? 'disponibles' : 'consommé'}</p>
      ${voucherHTML(av)}
      <div class="bq-avoir-note"><i data-lucide="shield-check"></i>Le code-barres revient en caisse comme moyen de paiement, il se déduit tout seul à l'encaissement.</div>
      <div class="bq-sheet-foot">
        <button class="bq-btn secondary" id="bq-av-print"><i data-lucide="printer"></i>Imprimer l'avoir</button>
        <button class="bq-btn primary" data-bq-close><i data-lucide="check"></i>${(globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr(fresh ? 'Terminer' : 'Fermer')}</button>
      </div>`;
    openVeil('#bq-avoir-veil');
    icons();
    $$('[data-bq-close]', el).forEach((b) => { b.onclick = () => closeVeil('#bq-avoir-veil'); });
    $('#bq-av-print', el).onclick = () => {
      /* Le même papier que le reçu (thermique, file durable), plus l'impression
         système qui le transformait en PDF. Code-barres Code 128 scannable. */
      const K = window.KiwiReceipt;
      if (!K || !K.printVoucher) { toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Impression indisponible sur cet appareil')); return; }
      toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Impression de l’avoir…'));
      K.printVoucher({ code: av.code, amount: av.amount, balance: av.balance, holderName: av.holderName,
        motif: av.motif, from: av.from, at: av.at, until: av.until, untilText: fmtValidUntil(av.until) }).then(
        (r) => toast(!r || !r.ok ? (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Impression échouée')
          : r.queued ? (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Avoir envoyé à l’imprimante')
          : r.thermalFailed ? (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Imprimante injoignable · avoir ouvert dans l’impression système')
          : r.via === 'pdf' || r.via === 'browser' ? (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Avoir ouvert dans l’impression système') : (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Avoir imprimé')),
        () => toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Impression échouée')));
    };
  }

  /* ---------- exchange summary ---------- */
  /* Le prix de la pièce de remplacement (newUnit, plus bas) suit la règle d'une vente : le meilleur
     de la remise du rayon et de la promotion en vigueur, celle de la grille
     (lineUnit, donc la règle partagée des promotions), jamais le prix de
     rayon brut. Sans cela, l'étiquette promo lue par la cliente et la
     différence encaissée à l'échange se contredisaient. */
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
    if (!newP) { toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Article de remplacement introuvable')); return; }
    const newUnit = lineUnit({ pid: newPid, remise: 0 });
    const diff = M.toMad(M.toCents(newUnit) - M.toCents(paidUnit(sale, ln)));
    const c = saleClient(sale);
    const el = $('#bq-exchm', root);
    el.innerHTML = `
      <button class="bq-modal-x" data-bq-close aria-label="${(globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Fermer')}"><i data-lucide="x"></i></button>
      <h3 class="modal-title">Échange, ${sale.id}</h3>
      <p class="modal-subtle">${c ? esc(c.name) : 'Cliente de passage'} · la pièce rendue repart en stock</p>
      <div class="bq-exch-row is-ret">
        <span class="bq-line-art">${artOf(oldP)}</span>
        <span class="mid"><b>${esc(oldP.name)}</b><span>retour · ${esc(ln.size)} · ${colorDot(ln.color)} ${esc(colorLabel(ln.color))}${ln.remise ? ` · payé avec −${ln.remise} %` : ''}</span></span>
        <span class="amt">−${fmtMAD(paidUnit(sale, ln))}</span>
      </div>
      <div class="bq-exch-row is-new">
        <span class="bq-line-art">${artOf(newP)}</span>
        <span class="mid"><b>${esc(newP.name)}</b><span>remplacement · ${esc(newSize)} · ${colorDot(newColor)} ${esc(colorLabel(newColor))}</span></span>
        <span class="amt">+${fmtMAD(newUnit)}</span>
      </div>
      <div class="bq-exch-diff ${diff > 0 ? 'pos' : diff < 0 ? 'neg' : 'zero'}">
        <span>${diff > 0 ? 'Différence à encaisser' : diff < 0 ? 'Différence en faveur de la cliente, part en avoir' : 'Aucun écart, échange direct'}</span>
        <span class="amt">${diff === 0 ? '0 MAD' : fmtMAD(Math.abs(diff))}</span>
      </div>
      <div class="bq-sheet-foot">
        <button class="bq-btn secondary" data-bq-close>Retour</button>
        ${diff > 0
          ? `<button class="bq-btn primary" id="bq-exch-go"><i data-lucide="banknote"></i>Encaisser ${fmtMAD(diff)}</button>`
          : diff < 0
            ? `<button class="bq-btn primary" id="bq-exch-go"><i data-lucide="ticket"></i>Échanger + avoir ${fmtMAD(-diff)}</button>`
            : `<button class="bq-btn primary" id="bq-exch-go"><i data-lucide="check"></i>Confirmer l'échange</button>`}
      </div>`;
    openVeil('#bq-exch-veil');
    icons();
    $$('[data-bq-close]', el).forEach((b) => { b.onclick = () => closeVeil('#bq-exch-veil'); });

    let applied = false;
    const stockRef = `exch-${newSaleId()}`;      // clé de réservation, jamais affichée
    /* Ce que le registre des mouvements montre : le ticket d'origine et la
       caissière, comme pour une vente ou un retour ordinaires. */
    const moveRef = String(sale.id || '');
    const moveActor = STAFF && STAFF.caissiere ? STAFF.caissiere.name : '';
    const cat = window.KiwiBoutiqueCatalog;
    const reserveReplacement = () => {
      if (variantStock(newPid, newSize, newColor) < 1) {
        return Promise.resolve({ ok: false, issue: { pid: newPid, size: newSize, color: newColor, needed: 1, onHand: 0 } });
      }
      if (IS_DEMO || state.offline || !cat || !cat.reserveSale) return Promise.resolve({ ok: false, offline: true });
      /* le registre des mouvements écoute avant que la pièce de remplacement sorte */
      try { window.KiwiMaisonStock?.enable('boutique'); } catch (_) {}
      return cat.reserveSale(stockRef, [{ pid: newPid, size: newSize, color: colorKey(newPid, newColor), qty: 1, price: newUnit }]);
    };
    const apply = (reserved) => {
      if (applied) return true;
      if (!reserved && !persistStock(newPid, newSize, newColor, -1, moveRef, 'vente')) {
        showStockIssue({ pid: newPid, size: newSize, color: newColor, needed: 1, onHand: variantStock(newPid, newSize, newColor) });
        return false;
      }
      applied = true;
      if (reserved && cat && cat.confirmSale) cat.confirmSale(stockRef, { ref: moveRef, actor: moveActor });
      stockAdd(newPid, newSize, -1);
      // Commit the swap to the shared inventory: returned piece back in, replacement out.
      const oldRestored = persistStock(ln.pid, ln.size, ln.color, 1, moveRef, 'retour');
      stockAdd(ln.pid, ln.size, 1);
      markLineReturned(ln, 1, `échangée → ${newP.name} · ${newSize}`);
      recordReturn(sale, [ex.idx], paidUnit(sale, ln), ex.motif || 'Non précisé', 'echange', '', new Map([[ex.idx, 1]]));
      state.exchange = null;
      persistDay();
      queueIfOffline(`Échange · ${sale.id}`);
      renderExchNote(); renderGrid(); renderBadges();
      if (!oldRestored) toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Échange enregistré, retour à rapprocher'), 6000, 'warn', 'La variante d’origine a été supprimée du catalogue.');
      return true;
    };

    $('#bq-exch-go', el).onclick = () => {
      if (diff > 0) {
        const go = $('#bq-exch-go', el);
        if (go) go.disabled = true;
        nextStandaloneTicketNumber().then((exchangeNumber) => {
          return reserveReplacement().then((reservation) => {
            if (!reservation.ok && !reservation.offline) {
              /* Échange refusé avant tout paiement : le numéro tiré n'a rien
                 couvert, il revient à la série au lieu de laisser un trou. */
              releaseTicketNumber(exchangeNumber);
              if (go) go.disabled = false;
              if (reservation.issue) showStockIssue(reservation.issue);
              else toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Échange suspendu'), 6000, 'warn', 'Impossible de réserver l’article de remplacement.');
              return;
            }
            const reserved = !!reservation.ok;
            closeVeil('#bq-exch-veil');
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
            onCancel: () => {
              if (reserved && cat && cat.releaseSale) cat.releaseSale(stockRef);
              releaseTicketNumber(exchangeNumber);   /* fenêtre fermée sans paiement */
            },
            onPaid: (parts) => {
              if (!apply(reserved)) return { line: 'Échange non enregistré · stock insuffisant' };
              const rec = {
                id: exchangeNumber, syncId: newSaleId(), tenderVersion: 2, at: new Date(), clientId: sale.clientId, by: STAFF.caissiere.name, kind: 'echange',
                methods: parts.map((x) => x.m).join(' + '),
                parts: parts.map((x) => ({ m: x.m, amount: M.toMad(M.toCents(+x.amount || 0)) })),
                lines: [{ pid: newPid, size: newSize, color: newColor, qty: 1, remise: 0, unit: diff, returned: false, note: `différence échange ${sale.id}` }],
                total: diff,
              };
              SALES.unshift(rec);
              persistDay();
              bqSaveProvisional();
              /* A positive exchange difference is real money received. It used
                 to exist only in this tablet's journal, so the dashboard missed
                 it even though the customer had paid and received a numbered
                 receipt. Mirror it with the same UUID/ref split as a sale. */
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
                    paymentParts: bqPaymentParts(parts), ticketAmountCents: M.toCents(diff),
                    ...(cashIn <= 0 ? { settlementKind: isDelivery ? 'receivable' : 'store-credit',
                      creditAmountCents: M.sumCents((parts || []).filter(x => x.m === 'avoir').map(x => +x.amount || 0)) } : {}),
                    channel: isDelivery ? 'delivery' : 'counter',
                    label: `Différence échange ${sale.id}`,
                    ref: rec.id,
                    time: rec.at,
                    lines: [{ name: newP.name + (newSize ? ' ' + newSize : ''), qty: 1, total: diff, cat: rayonOf(newPid) || '' }],
                  });
                }
              } catch (_) {}
              $('#bq-today', root).textContent = headSubVente();
              refreshOps();
              return { ref: rec.id, sale: rec, line: `Échange ${sale.id} réglé, différence ${fmtMAD(diff)}` };
            },
            });
          });
        }).catch(() => {
          if (go) go.disabled = false;
          toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Numéro de ticket indisponible'), 'Reconnectez cette caisse pour réserver sa prochaine série.');
        });
      } else if (diff < 0) {
        const go = $('#bq-exch-go', el); if (go) go.disabled = true;
        reserveReplacement().then(async (reservation) => {
          if (!reservation.ok && !reservation.offline) {
            if (go) go.disabled = false;
            if (reservation.issue) showStockIssue(reservation.issue);
            return;
          }
          /* La dette d'abord : si le registre refuse, ni la pièce rendue ni la
             pièce de remplacement n'ont bougé, et la réservation est rendue. */
          let av;
          try {
            av = await issueAvoir(-diff, c, `Différence échange ${sale.id}`, sale.serverId || sale.syncId || sale.id, {
              requestId: stableCreditIssueId(sale, new Map([[ex.idx, 1]]), -M.toCents(diff)),
              originalRef: sale.id, originalSale: sale, resellable: true,
              lines: [{ itemId: ln.pid, variantId: [ln.pid || '', ln.size || '', ln.color || ''].join(':'),
                name: oldP.name || 'Article', size: ln.size || '', qty: 1, unitCents: M.toCents(paidUnit(sale, ln)) }],
            });
          } catch (error) {
            if (reservation.ok && cat && cat.releaseSale) cat.releaseSale(stockRef);
            if (go) go.disabled = false;
            toast('Avoir non émis', creditErrorDetail(error));
            return;
          }
          closeVeil('#bq-exch-veil');
          if (!apply(!!reservation.ok)) {
            toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Avoir émis, échange à régulariser'), `${av.code} existe mais le remplacement est devenu indisponible.`);
            refreshOps(); openVoucher(av, { mode: 'fresh' });
            return;
          }
          refreshOps(); openVoucher(av, { mode: 'fresh' });
        });
      } else {
        const go = $('#bq-exch-go', el); if (go) go.disabled = true;
        reserveReplacement().then((reservation) => {
          if (!reservation.ok && !reservation.offline) {
            if (go) go.disabled = false;
            if (reservation.issue) showStockIssue(reservation.issue);
            return;
          }
          closeVeil('#bq-exch-veil');
          if (!apply(!!reservation.ok)) return;
          refreshOps();
          toast(`Échange ${sale.id}, ${oldP.name} ${ln.size} contre ${newP.name} ${newSize}`);
        });
      }
    };
  }

  /* ═══════════════════════ ENCAISSEMENT ═══════════════════════
     Réutilise le kit caisse : .modal-amount, .cash-grid, .reader-stage.
     L'avoir est un moyen de paiement à part entière — il se déduit. */
  /* Real receipt printing.
     This button used to be a bare toast that announced "Envoyé, reçu 80 mm sur
     l'imprimante caisse" whether or not a printer existed — so on a real till
     with nothing connected it told the merchant a receipt had printed that never
     did, every single time. It now actually prints, and when it cannot it says
     so and opens the printer setup instead of pretending. */
  /* L'impression AUTOMATIQUE qui suit un paiement ne part que vers une vraie
     imprimante (ou la file d'impression du pont), ou vers l'impression système
     si la propriétaire l'a choisie (browserFallback). Sans rien de tout ça, le
     play-test Amira ouvrait la boîte d'impression de macOS après chaque vente
     et la caisse restait figée jusqu'à Échap. On rend alors false : l'appelant
     montre l'écran « C'est encaissé » avec son bouton « Imprimer le ticket ». */
  function printReceiptNow(opts, parts, how) {
    const auto = !!(how && how.auto);
    const KP = window.KiwiPrinter;
    const receiptPrinterReady = (KP) => {
      try {
        if (!KP) return false;
        if (KP.isConnected ? KP.isConnected() : (KP.isConfigured && KP.isConfigured())) return true;
        const cfg = (KP.getConfig && KP.getConfig()) || {};
        return !!cfg.browserFallback;
      } catch (_) { return false; }
    };
    if (!KP || !KP.printReceipt) {
      if (auto) return false;
      toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Impression indisponible sur cet appareil')); return;
    }

    /* Le ticket que la boutique imprime est celui que la propriétaire a réglé
       dans Réglages → Reçu : son enseigne, son adresse, son ICE, sa politique
       d'échange, sa largeur de rouleau. Cette fonction composait le sien —
       `shop: pv.name || 'Kiwi'` et rien d'autre — ce qui donnait le ticket d'une
       boutique marocaine sans une seule mention légale. */
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
        /* Le « reçu » du ticket, c'est ce que la main du client a posé sur le
           comptoir — donc la PART espèces plus le rendu, pas le total de la
           vente. Avec un paiement partagé (moitié carte, moitié espèces), le
           total imprimait un billet que personne n'avait donné. */
        received: (function () {
          const c = (parts || []).find((x) => x.m === 'espèces' && x.rendu > 0);
          return c ? (+c.amount || 0) + (+c.rendu || 0) : null;
        })(),
        change: (parts || []).reduce((r, x) => r || x.rendu || 0, 0) || null,
      });
      /* Le ticket remis reste avec la vente : une réimpression sortira celui-là,
         avec son numéro, même si l'enseigne change de pied de page demain.
         persistDay() À NOUVEAU, et c'est tout l'intérêt : la vente a été écrite
         au moment du paiement, ce bouton-ci n'est touché qu'APRÈS, et le ticket
         figé ne partait donc jamais sur le disque. Il vivait dans l'onglet et
         mourait avec — c'est-à-dire précisément le jour où on en a besoin. */
      try {
        if (opts.sale) { opts.sale.rc = K.snapshot(doc); persistDay(); }
      } catch (_) {}
      const queue = window.KiwiKitchenPrint;
      if (opts.sale && queue && typeof queue.enqueueReceipt === 'function') {
        try {
          const queued = queue.enqueueReceipt('boutique:' + opts.sale.id, doc, 'original');
          if (queued && (queued.accepted || queued.pending)) return true;
        } catch (_) {}
      }
      if (auto && !receiptPrinterReady(KP)) return false;
      toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Impression du reçu…'));
      Promise.resolve(K.print(doc)).then(
        (r) => toast(r && r.ok
          ? (r.via === 'pdf' ? (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Reçu prêt · imprimer ou partager le PDF') : r.via === 'browser' ? (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Reçu ouvert dans l\'impression système') : ('Reçu imprimé · ' + (r.via === 'bluetooth' ? 'Bluetooth' : r.via === 'usb' ? 'USB' : 'réseau')))
          : (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Impression échouée')),
        () => toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Impression échouée'))
      );
      return true;
    }

    /* Sans assets/receipt.js (navigateur où il n'a pas chargé) : l'ancien
       chemin, inchangé. */
    const pv = pvPaired();
    const label = { 'carte': 'Carte', 'avoir': 'Avoir', 'espèces': 'Espèces', 'virement': 'Virement / Versement', 'chèque': 'Chèque', 'livraison': 'Livraison · à recevoir' };
    const lines = (opts.lines || []).map((l) => ({ qty: l.qty, name: l.name, price: fmtMAD(l.amount) }));
    const doc = {
      shop: (pv && pv.name) || 'Kiwi',
      ref: opts.ref || '',
      date: fmtDT(new Date()),
      lines: lines.length ? lines : [{ name: opts.title || (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Vente'), price: fmtMAD(opts.amount) }],
      total: fmtMAD(opts.amount),
      method: (parts || []).map((x) => label[x.m] || x.m).join(' + '),
    };

    /* Aucune imprimante ESC/POS joignable. Ça ne veut PAS dire que la boutique
     * n'a pas d'imprimante : sur une caisse Windows où elle est déjà installée,
     * Windows possède le périphérique, WebUSB se voit refuser le claim, et les
     * trois transports de Kiwi échouent alors que l'imprimante marche.
     * On propose donc l'impression système au lieu de renvoyer le commerçant
     * vers un écran de connexion qui ne peut rien pour lui — et on retient son
     * choix, sinon la caissière repasse par le modal à chaque ticket. */
    if (!KP.isConnected || !KP.isConnected()) {
      if (auto && !receiptPrinterReady(KP)) return false;
      const cfg = (KP.getConfig && KP.getConfig()) || {};
      if (cfg.browserFallback && KP.browserReceipt) { KP.browserReceipt(doc); return; }
      toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Aucune imprimante connectée'));
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
    toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Impression du reçu…'));
    KP.printReceipt(doc).then(
      (r) => toast(r && r.ok
        ? ('Reçu imprimé · ' + (r.via === 'bluetooth' ? 'Bluetooth' : r.via === 'usb' ? 'USB' : 'réseau'))
        : ('Impression échouée : ' + ((r && r.reason) || (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('inconnu')))),
      (e) => toast('Impression échouée : ' + ((e && e.message) || (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('erreur')))
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
    const panel = $('[data-bq-panel="acomptes"]', root);
    const R = window.KiwiRetailBalances;
    if (!R) { panel.textContent = (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Registre des acomptes indisponible'); return; }
    void R.render(panel, {
      merchant: merchantSlug(), prefix: 'bq',
      customerName: id => (clById(id) || {}).name || id,
      customerIdForName: query => (clientList().find(c => c.name.toLowerCase().includes(query.toLowerCase())) || {}).id,
      onSelect: payExistingBalance,
    }).then(() => mountDeliveries(panel));
  }
  /* Livraisons à encaisser (delivery-collect.js) : la créance d'une vente
     partie en livraison, que le livreur rapporte en espèces au comptoir.
     L'argent entre dans la recette du jour où il est reçu ; le panier, lui,
     reste sur la vente d'origine (déjà dans Vendus), d'où lines: []. */
  const demoDelivery = {};                /* démo : saleId → centimes reçus, en mémoire */
  function mountDeliveries(panel) {
    const D = window.KiwiDeliveryCollect;
    const wrap = panel && panel.querySelector('.kiwi-retail-balances');
    if (!D || !wrap) return;
    let host = wrap.querySelector('[data-bq-deliveries]');
    if (!host) {
      host = document.createElement('div'); host.setAttribute('data-bq-deliveries', '');
      const head = wrap.querySelector('.krb-head');
      if (head) head.after(host); else wrap.prepend(host);
    }
    void D.render(host, {
      merchant: merchantSlug(), toast,
      staff: () => {
        const op = window.KiwiCaissePairing && window.KiwiCaissePairing.lastOperator && window.KiwiCaissePairing.lastOperator();
        return { id: (op && op.id) || '', name: (op && op.name) || STAFF.caissiere.name };
      },
      onCollected: recordDeliveryCash,
      demo: IS_DEMO ? {
        list: () => SALES.filter((x) => x && !x.voided && (x.parts || []).some((p) => p && p.m === 'livraison')).map((x) => {
          const owed = M.sumCents((x.parts || []).map((p) => (p && p.m === 'livraison' ? (+p.amount || 0) : 0)));
          return { saleId: x.id, ref: x.id, label: ((x.lines || [])[0] && ((x.lines[0].name) || (P[x.lines[0].pid] || {}).name)) || 'Vente', ts: +new Date(x.at),
            owedCents: owed, dueCents: Math.max(0, owed - (demoDelivery[x.id] || 0)), collections: demoDelivery[x.id] ? [{}] : [] };
        }),
        collect: (d, cents, id) => {
          demoDelivery[d.saleId] = (demoDelivery[d.saleId] || 0) + cents;
          return { ok: true, sale: { id, amountCents: cents, ts: Date.now() }, dueCents: Math.max(0, d.dueCents - cents) };
        },
      } : null,
    });
  }
  function recordDeliveryCash(paid, d) {
    if (SALES.some((x) => x && x.serverId === paid.id)) return;      /* un essai rejoué ne compte qu'une fois */
    const amount = paid.amountCents / 100;
    const at = new Date(paid.ts || Date.now());
    SALES.unshift({
      /* La référence vient du serveur : un id de vente s'affiche partout, on n'y
         laisse que des caractères de référence. */
      id: (String(d.ref || d.saleId || 'LIV').replace(/[^\w.-]/g, '').slice(0, 40) || 'LIV') + '-L' + at.getTime(),
      syncId: paid.id, serverId: paid.id, tenderVersion: 2, at,
      by: STAFF.caissiere.name, kind: 'livraison-reglement', deliveryOf: d.saleId,
      methods: 'espèces', parts: [{ m: 'espèces', amount }], lines: [], total: amount,
    });
    persistDay(); bqSaveProvisional(true); renderAll();
  }
  function openPay(opts) {
    const el = $('#bq-paym', root);
    const ownAvoirs = () => opts.customerId
      ? activeAvoirs().filter((a) => a.holderId === opts.customerId) : [];
    let avoirPart = null;                   /* { m:'avoir', amount, code } */
    const creditCommitId = creditIntent('credit-redeem');   /* une consommation, rejouable sans double débit */
    const settled = [];                     /* les règlements déjà posés */
    let committed = false;                  /* double tap must never book twice */
    let share = 1;                          /* 1 = tout le reste ; 0.5 = la moitié */
    let custom = 0;                          /* un montant saisi à la main */
    const r2 = (n) => M.toMad(M.toCents(typeof n === 'string' ? n : (+n || 0)));
    const paid = () => settled.reduce((s, p) => s + (+p.amount || 0), 0);
    const due = () => r2(opts.amount - (avoirPart ? avoirPart.amount : 0) - paid());
    /* Ce que prend le prochain mode. Jamais plus que le reste : une part de 50 %
       sur un reste de 3 MAD ne doit pas produire un règlement de 1,50 MAD qu'on
       n'a pas les pièces pour rendre — mais surtout jamais PLUS que dû. */
    const portion = () => {
      if (custom > 0) return Math.min(custom, due());
      if (share >= 1) return due();
      /* Une part se compte en dirhams entiers, comme tout le reste ici : 50 %
         de 339 donnait 169,50 + 169,50, que l'écran, le ticket et la clôture
         affichaient « 170 » et « 170 » (340 pour 339 encaissés). La part prend
         le dirham inférieur, le reste porte l'autre : 169 + 170. */
      if (due() >= 1) return Math.min(due(), Math.max(1, shelf(due() * share)));
      return Math.min(due(), Math.max(0.01, r2(due() * share)));
    };
    const closeBtns = () => $$('[data-bq-close]', el).forEach((b) => {
      b.onclick = () => {
        /* Once one payment part is confirmed, closing would forget money already
           received (especially a card charge) while leaving the cart unpaid.
           Finish the remaining balance; the success screen can close normally. */
        if (!committed && (settled.length || avoirPart)) {
          toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Paiement commencé'), `Il reste ${fmtMAD(due())} à régler avant de fermer.`);
          return;
        }
        if (!committed && opts.onCancel) opts.onCancel();
        closeVeil('#bq-pay-veil');
      };
    });

    const mLabel = (m) => (m === 'espèces' ? 'Espèces' : m === 'carte' ? 'Carte' : m === 'virement' ? 'Virement / Versement' : m === 'chèque' ? 'Chèque' : m === 'livraison' ? 'Livraison' : m === 'avoir' ? 'Avoir' : m);

    const appliedBanner = () => {
      const rows = [];
      if (avoirPart) rows.push(`<i data-lucide="ticket"></i> Avoir <b>${avoirPart.code}</b> appliqué, −${fmtMAD(avoirPart.amount)}`);
      settled.forEach((p) => rows.push(`<i data-lucide="check"></i> ${mLabel(p.m)} <b>${fmtMAD(p.amount)}</b> réglé`));
      return rows.map((r) => `<div class="bq-pay-applied">${r}</div>`).join('');
    };

    /* Le partage. Volontairement à quatre touches et pas un clavier de plus :
       au comptoir, « la moitié » est le cas qui revient, et tout le reste se
       saisit au montant. */
    const splitBar = () => `
      <div class="bq-split" role="group" aria-label="${(globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Partager le paiement')}">
        <span class="bq-split-l">Partager</span>
        <button class="bq-split-c${share >= 1 && !custom ? ' is-on' : ''}" data-bq-share="1">Tout</button>
        <button class="bq-split-c${share === 0.5 && !custom ? ' is-on' : ''}" data-bq-share="0.5">50 %</button>
        <button class="bq-split-c${share === 0.25 && !custom ? ' is-on' : ''}" data-bq-share="0.25">25 %</button>
        <button class="bq-split-c${custom ? ' is-on' : ''}" data-bq-share="x">Montant…</button>
        <input class="bq-split-in mono" id="bq-split-in" type="number" inputmode="decimal" min="0" step="1"
               placeholder="MAD" value="${custom || ''}" ${custom ? '' : 'hidden'} aria-label="${(globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Montant de cette part')}" />
      </div>
      <p class="bq-split-note"${portion() < due() ? '' : ' hidden'}>Cette part : ${fmtMAD(portion())} · restera ${fmtMAD(r2(due() - portion()))}</p>`;

    const stepMethods = () => {
      const avs = ownAvoirs();
      el.innerHTML = `
        <button class="bq-modal-x" data-bq-close aria-label="${(globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Fermer')}"><i data-lucide="x"></i></button>
        <h3 class="modal-title">${esc(opts.title)}</h3>
        <p class="modal-subtle">${settled.length ? `Reste à régler sur ${fmtMAD(opts.amount)}` : opts.subtitle}</p>
        <div class="modal-amount size-md">${fmtMAD(due())}</div>
        ${appliedBanner()}
        ${due() > 0.01 ? splitBar() : ''}
        ${settled.length === 1 && due() > 0.009 && opts.customerId
          && ['espèces','carte','virement','chèque'].includes(settled[0].m)
          ? `<button class="bq-btn secondary" id="bq-save-acompte">Acompte reçu · garder ${fmtMAD(due())} à régler</button>` : ''}
        <div class="bq-pay-opts">
          <button class="bq-pay-opt" data-bq-m="especes">
            <span class="ic"><i data-lucide="banknote"></i></span>
            <span class="l"><b>Espèces</b><span>Rendu calculé, flous comptés une fois</span></span>
            <span class="amt">${fmtMAD(portion())}</span>
          </button>
          <button class="bq-pay-opt" data-bq-m="carte">
            <span class="ic"><i data-lucide="credit-card"></i></span>
            <span class="l"><b>Carte</b><span>Terminal de la banque, montant à saisir dessus</span></span>
            <span class="amt">${fmtMAD(portion())}</span>
          </button>
          <button class="bq-pay-opt" data-bq-m="virement">
            <span class="ic"><img src="assets/icons/material/account_balance.svg" alt=""></span>
            <span class="l"><b>Virement / Versement</b><span>Confirmer uniquement après réception en banque</span></span>
            <span class="amt">${fmtMAD(portion())}</span>
          </button>
          <button class="bq-pay-opt" data-bq-m="cheque">
            <span class="ic"><img src="assets/icons/material/receipt_long.svg" alt=""></span>
            <span class="l"><b>Chèque</b><span>Confirmer après réception du chèque</span></span>
            <span class="amt">${fmtMAD(portion())}</span>
          </button>
          <button class="bq-pay-opt" data-bq-m="livraison">
            <span class="ic"><i data-lucide="truck"></i></span>
            <span class="l"><b>Livraison</b><span>Vente enregistrée, paiement à recevoir du transporteur</span></span>
            <span class="amt">${fmtMAD(portion())}</span>
          </button>
          ${avoirPart ? '' : avs.length ? `
          <button class="bq-pay-opt" data-bq-m="avoir">
            <span class="ic"><i data-lucide="ticket"></i></span>
            <span class="l"><b>Avoir</b><span>${avs.length === 1 ? `${avs[0].code} · ${fmtMAD(avs[0].balance)}, ${esc(avs[0].holderName)}` : `${avs.length} avoirs actifs, scanner ou choisir`}</span></span>
            <span class="amt">−${fmtMAD(Math.min(avs[0].balance, portion()))}</span>
          </button>` : `
          <button class="bq-pay-opt" data-bq-m="avoir">
            <span class="ic"><i data-lucide="ticket"></i></span>
            <span class="l"><b>Code d’avoir</b><span>Scanner ou saisir le code du bon</span></span>
          </button>`}
        </div>`;
      icons(); closeBtns();
      const saveAcompte = $('#bq-save-acompte', el);
      if (saveAcompte) saveAcompte.onclick = () => commit(true);
      const inp = $('#bq-split-in', el);
      $$('[data-bq-share]', el).forEach((b) => {
        b.onclick = () => {
          const v = b.dataset.bqShare;
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
          $$('[data-bq-share]', el).forEach((b) => {
            b.classList.toggle('is-on', custom > 0 ? b.dataset.bqShare === 'x' : b.dataset.bqShare === String(share));
          });
          const note = $('.bq-split-note', el);
          if (note) {
            note.hidden = !(portion() < due());
            note.textContent = `Cette part : ${fmtMAD(portion())} · restera ${fmtMAD(r2(due() - portion()))}`;
          }
          /* L'avoir se déduit du total, mais jamais plus que la part choisie :
             sa ligne suit donc la saisie comme les autres, en gardant son signe
             et son plafond propre (le solde du bon). */
          $$('[data-bq-m]', el).forEach((b) => {
            const a = $('.amt', b); if (!a) return;
            if (/^avoir/.test(b.dataset.bqM)) {
              const bal = (ownAvoirs()[0] || {}).balance;
              if (bal != null) a.textContent = '−' + fmtMAD(Math.min(bal, portion()));
              return;
            }
            a.textContent = fmtMAD(portion());
          });
        };
      }
      $$('[data-bq-m]', el).forEach((b) => {
        b.onclick = () => {
          if (!settled.length && !avoirPart && opts.stockCheck) {
            const issue = opts.stockCheck();
            if (issue) {
              closeVeil('#bq-pay-veil');
              if (opts.onStockError) opts.onStockError(issue);
              return;
            }
          }
          const m = b.dataset.bqM;
          if (m === 'especes') stepCash(portion());
          else if (m === 'carte') stepCard(portion());
          else if (m === 'virement' || m === 'cheque') stepExternal(m, portion());
          else if (m === 'livraison') settle({ m: 'livraison', amount: portion() });
          else if (m === 'avoir') stepAvoir();
          else toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Aucun avoir actif, émettez-en un depuis Échanges & avoirs'));
        };
      });
    };

    /* Un règlement de plus est posé. Tant qu'il reste quelque chose à payer on
       revient aux modes — c'est ce retour, et rien d'autre, qui rend possibles
       les partages à trois ou quatre. */
    const settle = (part) => {
      settled.push(part);
      share = 1; custom = 0;
      if (opts.balanceExisting) commit(due() > 0.009);
      else if (due() > 0.009) { toast(`Reste ${fmtMAD(due())} à régler`); stepMethods(); }
      else commit();
    };

    const stepAvoir = () => {
      const avs = ownAvoirs();
      el.innerHTML = `
        <button class="bq-modal-x" data-bq-close aria-label="${(globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Fermer')}"><i data-lucide="x"></i></button>
        <h3 class="modal-title">Avoir en paiement</h3>
        <p class="modal-subtle">Scannez le bon, ou choisissez-le, il se déduit du total</p>
        <form id="bq-av-code-form" style="display:flex;gap:8px;margin:12px 0;">
          <input class="bq-in mono" id="bq-av-code" autocomplete="off" autocapitalize="characters" placeholder="Scanner ou saisir AV-…" aria-label="${(globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Code de l’avoir')}" style="flex:1;min-width:0;" />
          <button class="bq-btn secondary" type="submit">Utiliser</button>
        </form>
        <p class="bq-av-err" id="bq-av-err" role="alert" hidden></p>
        <div class="bq-pay-opts">
          ${avs.map((a) => `
            <button class="bq-pay-opt" data-bq-av-use="${a.code}">
              <span class="ic"><i data-lucide="scan-line"></i></span>
              <span class="l"><b>${a.code} · ${fmtMAD(a.balance)}</b><span>${esc(a.holderName)} · ${esc(a.motif)} · valable jusqu'au ${fmtValidUntil(a.until)}</span></span>
              <span class="amt">−${fmtMAD(Math.min(a.balance, portion()))}</span>
            </button>`).join('')}
        </div>
        <div class="bq-sheet-foot"><button class="bq-btn secondary" id="bq-av-back" style="flex:1;">Retour</button></div>`;
      icons(); closeBtns();
      $('#bq-av-back', el).onclick = stepMethods;
      const applyCode = async (rawCode) => {
        /* En arabe le code s'affiche isolé de gauche à droite (U+2066…U+2069) :
           ces marques invisibles suivent un copier-coller du bon ou d'un message
           et le code n'était plus trouvé. On les retire avant de chercher. */
        const code = String(rawCode || '').replace(/[‎‏‪-‮⁦-⁩]/g, '').trim().toUpperCase();
        if (!code) return;
        const errEl = $('#bq-av-err', el);
        if (errEl) { errEl.hidden = true; errEl.textContent = ''; }
        /* Même pliage que le registre (O→0, I/L→1) : un code recopié à la main
           depuis le bon imprimé se retrouve aussi dans le cache local. */
        const fold = (x) => String(x || '').toUpperCase().replace(/O/g, '0').replace(/[IL]/g, '1');
        let av = AVOIRS.find((a) => fold(a.code) === fold(code));
        /* un bon émis par l'autre caisse : on le demande au registre */
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
        if (!av || avoirExpired(av) || !activeAvoirs().includes(av)) {
          /* Le toast passait en deux secondes et la caissière ne savait pas
             pourquoi : la raison reste écrite sous le champ, et la saisie aussi. */
          const why = !av ? 'Aucun avoir avec ce code, vérifiez-le sur le bon.'
            : avoirExpired(av) ? (av.until ? `Cet avoir a expiré le ${new Date(av.until).toLocaleDateString('fr-FR')}.` : 'Cet avoir a expiré.')
            : 'Cet avoir est déjà entièrement utilisé.';
          toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Bon indisponible'), why);
          if (errEl) { errEl.textContent = why; errEl.hidden = false; }
          const input = $('#bq-av-code', el); if (input) { input.focus(); input.select(); }
          return;
        }
        const applied = Math.min(av.balance, portion());
        avoirPart = { m: 'avoir', amount: applied, code: av.code };
        share = 1; custom = 0;
        if (due() <= 0.009) void commit();
        else { toast(`${av.code} appliqué, reste ${fmtMAD(due())} à payer`); stepMethods(); }
      };
      $('#bq-av-code-form', el).onsubmit = (event) => {
        event.preventDefault();
        void applyCode($('#bq-av-code', el).value);
      };
      $$('[data-bq-av-use]', el).forEach((b) => {
        b.onclick = () => { void applyCode(b.dataset.bqAvUse); };
      });
    };

    const stepCash = (amount) => {
      amount = amount > 0 ? amount : due();
      const rest = r2(due() - amount);
      let received = amount;
      el.innerHTML = `
        <button class="bq-modal-x" data-bq-close aria-label="${(globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Fermer')}"><i data-lucide="x"></i></button>
        <h3 class="modal-title">Espèces · ${fmtMAD(amount)}</h3>
        <p class="modal-subtle">${rest > 0.009 ? `Part sur ${fmtMAD(due())} · restera ${fmtMAD(rest)}` : opts.subtitle}</p>
        ${appliedBanner()}
        <div class="cash-grid">
          <div class="cash-input-row">
            <label class="cash-input-label" for="bq-cash-in">Espèces reçues</label>
            <input class="cash-input mono" id="bq-cash-in" type="number" inputmode="numeric" min="0" step="1" value="${amount}" />
          </div>
          <div class="cash-presets" aria-label="${(globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Ajout rapide')}">
            <button class="cash-preset" data-add="20">+20</button>
            <button class="cash-preset" data-add="50">+50</button>
            <button class="cash-preset" data-add="100">+100</button>
            <button class="cash-preset" data-add="200">+200</button>
          </div>
          <div class="cash-rendu"><span class="lbl">Rendu</span><span class="val mono" id="bq-cash-rendu">0 MAD</span></div>
          <button class="cash-confirm" id="bq-cash-ok">Confirmer</button>
        </div>`;
      icons(); closeBtns();
      const refresh = () => {
        $('#bq-cash-rendu', el).textContent = fmtMAD(Math.max(0, received - amount));
        $('#bq-cash-ok', el).disabled = received < amount;
      };
      $('#bq-cash-in', el).oninput = (e) => { received = M.toMad(M.toCents(e.target.value)); refresh(); };
      $$('[data-add]', el).forEach((b) => {
        b.onclick = () => { received += +b.dataset.add; $('#bq-cash-in', el).value = received; refresh(); };
      });
      refresh();
      $('#bq-cash-ok', el).onclick = () => {
        settle({ m: 'espèces', amount, rendu: Math.max(0, received - amount) });
      };
    };

    const stepCard = (amount) => {
      amount = amount > 0 ? amount : due();
      const rest = r2(due() - amount);
      el.innerHTML = `
        <button class="bq-modal-x" data-bq-close aria-label="${(globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Fermer')}"><i data-lucide="x"></i></button>
        <h3 class="modal-title">Carte · ${fmtMAD(amount)}</h3>
        <p class="modal-subtle">${rest > 0.009 ? `Part sur ${fmtMAD(due())} · restera ${fmtMAD(rest)}` : opts.subtitle} · Kiwi affiche, le lecteur encaisse</p>
        <div class="reader-stage">
          <div class="reader-disc is-pulsing" id="bq-reader-disc"><i data-lucide="credit-card"></i></div>
          <div class="reader-status" id="bq-reader-status">Montant envoyé au lecteur<span class="ellipsis"></span></div>
          <div class="reader-method">Terminal de la banque, montant à saisir dessus</div>
        </div>
        <div class="bq-card-confirm" id="bq-card-confirm" hidden>
          <button class="cash-confirm" id="bq-card-ok"><i data-lucide="check"></i> Encaissement confirmé sur le lecteur</button>
          <button class="bq-btn ghost" id="bq-card-cancel">Paiement refusé · annuler</button>
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
        const disc = $('#bq-reader-disc', el);
        if (!disc || !el.closest('.modal-veil').classList.contains('is-open')) return;
        disc.classList.remove('is-pulsing');
        disc.classList.add('is-success');
        disc.innerHTML = '<i data-lucide="check"></i>';
        $('#bq-reader-status', el).textContent = (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Confirmez l\'encaissement sur le lecteur');
        $('#bq-reader-status', el).classList.add('is-success');
        const cw = $('#bq-card-confirm', el);
        if (cw) cw.hidden = false;
        icons();
        const ok = $('#bq-card-ok', el);
        if (ok) ok.onclick = () => settle({ m: 'carte', amount });
        const cancel = $('#bq-card-cancel', el);
        if (cancel) cancel.onclick = () => {
          if (settled.length || avoirPart) stepMethods();
          else {
            if (opts.onCancel) opts.onCancel();
            closeVeil('#bq-pay-veil');
          }
        };
      }, 1400);
    };

    const stepExternal = (method, amount) => {
      const cheque = method === 'cheque';
      const label = cheque ? 'Chèque' : 'Virement / Versement';
      el.innerHTML = `
        <button class="bq-modal-x" data-bq-close aria-label="${(globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Fermer')}">×</button>
        <h3 class="modal-title">${label} · ${fmtMAD(amount)}</h3>
        <p class="modal-subtle">${cheque ? 'Le chèque a-t-il été remis au comptoir ?' : 'Les fonds sont-ils visibles sur le compte bancaire ?'} Aucun montant ne sera attendu dans le tiroir.</p>
        <div class="bq-sheet-foot">
          <button class="bq-btn secondary" id="bq-external-back">Retour</button>
          <button class="cash-confirm" id="bq-external-ok">${cheque ? 'Chèque reçu' : 'Versement reçu'} · confirmer</button>
        </div>`;
      closeBtns();
      $('#bq-external-back', el).onclick = stepMethods;
      $('#bq-external-ok', el).onclick = () => settle({ m: cheque ? 'chèque' : 'virement', amount });
    };

    const commit = async (partial) => {
      if (committed) return;
      if (partial && (!opts.customerId || settled.length !== 1 || avoirPart
          || !['espèces','carte','virement','chèque'].includes(settled[0].m))) {
        toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Acompte : une cliente et un seul règlement sont requis')); return;
      }
      committed = true;
      if (opts.beforePaid && !await opts.beforePaid()) { committed = false; return; }
      const parts = (avoirPart ? [avoirPart] : []).concat(settled);
      const paidNow = M.toMad(M.sumCents(parts.map((part) => +part.amount || 0)));
      const avp = parts.find((x) => x.m === 'avoir');
      if (avp) {
        const av = AVOIRS.find((a) => a.code === avp.code);
        if (!av || avoirExpired(av) || !(av.balance >= avp.amount - 0.009)) {
          committed = false;
          toast(`Avoir ${avp.code} inutilisable`, !av ? 'Bon introuvable en caisse.' : avoirExpired(av) ? 'Bon expiré entre-temps.' : 'Solde insuffisant, montants recalculés.');
          stepMethods();
          return;
        }
        try {
          let saved = null;
          if (!IS_DEMO) {
            /* Une seule écriture au registre : si une autre caisse vient
               d'entamer ce bon, rien n'est consommé et rien n'est encaissé. */
            const remote = await creditRequest({
              /* La vente n'existe qu'après cette écriture : sans le numéro du
                 ticket à venir, le registre ne savait plus quel ticket avait
                 consommé le bon. */
              action: 'redeem-batch', id: creditCommitId,
              saleId: (opts.sale && opts.sale.id) || opts.ref || '',
              detail: opts.title || (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Vente boutique'),
              credits: [{ code: avp.code, amountCents: M.toCents(avp.amount) }],
            });
            const row = ((remote && remote.credits) || []).find((r) => r.code === avp.code);
            saved = row ? creditFromServer(row) : null;
          }
          av.balance = saved ? saved.balance : Math.max(0, av.balance - avp.amount);
          av.status = saved ? saved.status : (av.balance > 0 ? 'active' : 'consumed');
          persistAvoirs();                     // le solde entamé survit au rechargement
          toast(av.balance > 0 ? `${av.code}, reste ${fmtMAD(av.balance)} dessus` : `${av.code} consommé en totalité`);
        } catch (_) {
          committed = false;
          await refreshRemoteAvoirs();
          toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Avoir refusé par le registre'), 'Le solde a changé, le bon a expiré ou une autre caisse vient de l’utiliser. Aucun encaissement n’a été enregistré.');
          stepMethods();
          return;
        }
      }
      const res = opts.onPaid(parts, { partial: !!partial, paidNow }) || {};
      if (res.error) { committed = false; stepMethods(); return; }
      if (res.sale) opts.sale = res.sale;
      if (partial || opts.balanceExisting) {
        opts.acompte = { total: opts.balanceTotal || opts.amount,
          paid: (opts.balancePaid || 0) + paidNow,
          remaining: Math.max(0, (opts.balanceTotal || opts.amount) - (opts.balancePaid || 0) - paidNow) };
        opts.amount = paidNow;
        opts.title = partial ? (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Acompte') : (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Solde de l’acompte');
      }
      if (res.delivery || parts.some((x) => x.m === 'livraison')) stepSuccess(parts, res);
      else {
        /* Sans imprimante : pas de boîte d'impression système, la vente suivante
           reste à un geste ; le ticket se réimprime depuis l'historique. */
        const printed = printReceiptNow(opts, parts, { auto: true });
        closeVeil('#bq-pay-veil');
        if (printed === false) toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Ticket non imprimé · aucune imprimante'), 4000);
      }
    };

    const stepSuccess = (parts, res) => {
      const cash = parts.find((x) => x.m === 'espèces');
      const delivery = parts.some((x) => x.m === 'livraison');
      el.innerHTML = `
        <button class="bq-modal-x" data-bq-close aria-label="${(globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Fermer')}"><i data-lucide="x"></i></button>
        <h3 class="modal-title">${delivery ? 'Livraison enregistrée' : "C'est encaissé"}</h3>
        <p class="modal-subtle">${res.line ? esc(res.line) : esc(opts.title)}</p>
        ${cash && cash.rendu > 0 ? `
          <div class="cash-success-rendu">${fmtMAD(cash.rendu)}</div>
          <div class="cash-success-label">rendu à la cliente</div>` : `
          <div class="modal-amount size-md">${fmtMAD(opts.amount)}</div>`}
        <div class="bq-pay-break">
          ${parts.map((x) => `<div class="row"><span>${x.m === 'avoir' ? `Avoir ${x.code}` : x.m === 'carte' ? 'Carte, lecteur partenaire' : x.m === 'livraison' ? 'Livraison · à recevoir' : mLabel(x.m)}</span><b>${fmtMAD(x.amount)}</b></div>`).join('')}
        </div>
        <div class="modal-actions is-visible">
          <button class="ma-btn secondary" id="bq-pay-print"><i data-lucide="printer"></i>Reçu 80 mm</button>
          <button class="ma-btn secondary" id="bq-pay-wa"><i data-lucide="message-circle"></i>Reçu WhatsApp</button>
        </div>
        <div class="modal-actions is-visible" style="margin-top:10px;">
          <button class="ma-btn primary" id="bq-pay-done"><i data-lucide="check"></i>${esc(opts.doneLabel || 'Nouvelle vente')}</button>
        </div>`;
      icons(); closeBtns();
      $('#bq-pay-print', el).onclick = () => printReceiptNow(opts, parts);
      /* Same problem as the 80 mm button: this claimed "Reçu envoyé sur WhatsApp"
         while sending nothing at all. WhatsApp cannot be sent silently from a web
         page, and it shouldn't be — the merchant should see what goes to their
         client. So we open a real pre-filled WhatsApp draft; they press send. */
      $('#bq-pay-wa', el).onclick = () => {
        if (!opts.waPhone) { toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Cliente de passage, pas de numéro WhatsApp sur le ticket')); return; }
        const pv = pvPaired();
        const body = [
          (pv && pv.name) || 'Kiwi',
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
          toast(`WhatsApp ouvert pour ${opts.waName || (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('la cliente')}, appuyez sur envoyer`);
        } catch (_) { toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Impossible d\'ouvrir WhatsApp')); }
      };
      $('#bq-pay-done', el).onclick = () => closeVeil('#bq-pay-veil');
    };

    stepMethods();
    openVeil('#bq-pay-veil');
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
      toast(state.syncBlocked ? (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Synchronisation bloquée, contactez le support')
        : state.offline ? (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Wi-Fi indisponible, les ventes restent sur cette caisse')
          : state.queued ? `${state.queued} vente${state.queued > 1 ? 's' : ''} en cours de synchronisation`
            : (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Caisse en ligne, toutes les ventes sont synchronisées'));
      return;
    }
    state.simulatedOffline = !state.simulatedOffline;
    syncNetworkState();
    toast(state.offline ? (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Mode hors-ligne simulé, la boutique continue') : (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Réseau simulé rétabli'));
  }
  function renderNet() {
    const net = $('#bq-net', root);
    if (!net) return;
    net.classList.toggle('is-off', state.offline || state.syncBlocked);
    $('.bq-net-label', net).textContent = state.syncBlocked ? (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Sync bloquée') : state.offline ? (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Hors-ligne') : state.queued ? (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Synchronisation') : (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('En ligne');
    let q = $('.bq-net-queue', net);
    if (state.queued) {
      if (!q) { q = document.createElement('b'); q.className = 'bq-net-queue'; net.appendChild(q); }
      q.textContent = state.queued;
    } else if (q) q.remove();
    const note = $('#bq-offline-note', root);
    if (!note) return;
    note.hidden = !state.offline && !state.syncBlocked;
    if (state.syncBlocked) {
      note.innerHTML = 'La synchronisation est bloquée. Les ventes restent sur cette caisse : contactez le support avant de vider les données du navigateur. <b id="bq-queue-count"></b>';
    } else {
      note.innerHTML = 'Hors-ligne, les ventes sont enregistrées sur la tablette et synchronisées au retour du réseau. <b id="bq-queue-count"></b>';
    }
    const count = $('#bq-queue-count', root);
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
  const fmtNum = (n) => new Intl.NumberFormat('fr-FR').format(Math.round(n || 0));

  function injectInvCss() {
    if (document.getElementById('bqi-css')) return;
    const st = document.createElement('style');
    st.id = 'bqi-css';
    st.textContent = `
      .bqi { height: 100%; overflow-y: auto; padding-bottom: 40px; }
      .bqi-tools { display: flex; gap: 12px; align-items: center; padding: 14px 22px 6px; }
      .bqi-scan { flex: 1; display: flex; align-items: center; gap: 10px; background: var(--paper); border: 1.5px solid var(--atlas); border-radius: 14px; padding: 12px 16px; }
      .bqi-scan svg { width: 20px; height: 20px; color: var(--atlas); }
      .bqi-scan input { flex: 1; border: none; background: transparent; outline: none; font: inherit; font-size: 15px; color: var(--ink); }
      .bqi-pills { display: flex; gap: 8px; flex-wrap: wrap; padding: 6px 22px; }
      .bqi-pill { border: 1px solid rgba(10,15,13,.14); background: var(--paper); border-radius: 999px; padding: 6px 13px; font-size: 12.5px; cursor: pointer; color: var(--ink); }
      .bqi-pill.on { background: var(--atlas); color: #fff; border-color: var(--atlas); }
      .bqi-kpis { display: flex; gap: 10px; padding: 6px 22px 10px; }
      .bqi-kpi { flex: 1; background: var(--paper); border: 1px solid rgba(10,15,13,.08); border-radius: 12px; padding: 10px 14px; display: flex; flex-direction: column; gap: 2px; }
      .bqi-kpi .l { font-size: 10px; letter-spacing: .06em; text-transform: uppercase; color: #5E6762; }
      .bqi-kpi .v { font-size: 18px; font-weight: 600; font-family: var(--mono); }
      .bqi-kpi.warn { border-color: #E7B24D; background: #FBF3E2; }
      .bqi-list { padding: 4px 22px; display: flex; flex-direction: column; gap: 8px; }
      .bqi-row { display: flex; align-items: center; gap: 14px; background: var(--paper); border: 1px solid rgba(10,15,13,.08); border-radius: 14px; padding: 12px 16px; cursor: pointer; transition: border-color .15s; }
      .bqi-row:hover { border-color: var(--atlas); }
      .bqi-art { width: 40px; height: 40px; flex: 0 0 40px; color: var(--riad); }
      .bqi-art svg, .bqi-art img { width: 40px; height: 40px; }
      .bqi-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
      .bqi-info b { font-size: 14.5px; }
      .bqi-info span { font-size: 12px; color: #5E6762; }
      .bqi-stock { font-family: var(--mono); font-size: 15px; font-weight: 600; min-width: 34px; text-align: right; }
      .bqi-stock.bas { color: #8A6406; } .bqi-stock.rupture { color: #9B2F22; }
      .bqi-price { font-family: var(--mono); font-size: 14px; min-width: 90px; text-align: right; }
      .bqi-mini { width: 34px; height: 34px; border-radius: 9px; border: 1px solid rgba(10,15,13,.14); background: var(--paper); cursor: pointer; color: var(--ink); display: inline-flex; align-items: center; justify-content: center; }
      .bqi-mini:hover { background: #f0eee7; } .bqi-mini svg { width: 16px; height: 16px; }
      .bqi-mini.danger { color: #9B2F22; }
      .bq-invm { width: min(720px, 94vw); max-height: 88vh; overflow-y: auto; padding: 0; }
      .bqi-modh { display: flex; align-items: center; gap: 14px; padding: 22px 24px 14px; border-bottom: 1px solid rgba(10,15,13,.08); }
      .bqi-modh h3 { margin: 0; font-size: 18px; } .bqi-modh > div { flex: 1; } .bqi-modh > div span { font-size: 12.5px; color: #5E6762; }
      .bqi-vtable-wrap { padding: 8px 24px; }
      .bqi-vtable { width: 100%; border-collapse: collapse; font-size: 13px; }
      .bqi-vtable th { text-align: left; font-size: 10px; letter-spacing: .05em; text-transform: uppercase; color: #5E6762; padding: 8px 6px; }
      .bqi-vtable td { padding: 9px 6px; border-top: 1px solid rgba(10,15,13,.07); vertical-align: middle; }
      .bqi-dot { display: inline-block; width: 13px; height: 13px; border-radius: 50%; border: 1px solid rgba(0,0,0,.18); vertical-align: -1px; margin-right: 6px; }
      .bqi-stk { display: inline-flex; align-items: center; gap: 5px; }
      .bqi-stk input { width: 46px; text-align: center; font-family: var(--mono); font-size: 14px; padding: 5px; border: 1px solid rgba(10,15,13,.16); border-radius: 8px; background: var(--paper); color: var(--ink); }
      .bqi-stk button { width: 28px; height: 28px; border-radius: 8px; border: 1px solid rgba(10,15,13,.16); background: var(--paper); cursor: pointer; font-size: 17px; line-height: 1; color: var(--ink); }
      .bqi-bc { display: flex; align-items: center; gap: 8px; }
      .bqi-code { font-family: var(--mono); font-size: 11px; color: #555; display: flex; flex-direction: column; }
      .bqi-code em { font-style: normal; font-size: 8.5px; letter-spacing: .04em; text-transform: uppercase; font-weight: 700; }
      .bqi-code em.gen { color: #0B6E4F; } .bqi-code em.imp { color: #8A6210; }
      .bqi-nocode { color: #99a; font-size: 12px; }
      .bqi-vact { display: flex; gap: 5px; justify-content: flex-end; }
      .bqi-modfoot { display: flex; gap: 8px; padding: 14px 24px 22px; flex-wrap: wrap; }
      .bqi-modfoot .bq-btn.danger { color: #9B2F22; }

      /* Douchette · diagnostic */
      .bq-scan-diag { display: inline-flex; align-items: center; gap: 8px; margin: 12px auto 0; padding: 9px 15px; background: transparent; border: 1px solid var(--n-200, #e7e3da); border-radius: 11px; font: inherit; font-size: 13px; color: var(--n-600, #5d6b63); cursor: pointer; }
      .bq-scan-diag:hover { border-color: var(--atlas); color: var(--atlas); }
      .bq-scan-diag svg { width: 15px; height: 15px; }
      /* Sur la caisse sombre, --n-600 donnait 2,2:1 : le bouton se lisait à peine. */
      html[data-caisse-theme="dark"] .bq-scan-diag { color: #c9d6cf; border-color: rgba(234,255,243,.16); }
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
      .bqi-form { padding: 20px 24px 8px; }
      .bqi-fg { margin-bottom: 14px; } .bqi-fg label { display: block; font-size: 11px; letter-spacing: .05em; text-transform: uppercase; color: #5E6762; margin-bottom: 6px; }
      .bqi-fg input, .bqi-fg select { width: 100%; padding: 11px 13px; border: 1px solid rgba(10,15,13,.16); border-radius: 10px; font: inherit; font-size: 14px; background: var(--paper); color: var(--ink); }
      .bqi-frow { display: flex; gap: 12px; } .bqi-frow .bqi-fg { flex: 1; }
      /* Le sélecteur de couleur vient de color-palette.js (.kc-*) · rien à
         redéfinir ici, c'est tout l'intérêt. Restent la pastille cliquable de la
         ligne variante et le rappel discret de la nuance d'origine. */
      .bqi-cbtn { display: inline-flex; align-items: center; gap: 6px; background: none; border: 0; padding: 2px 4px; margin: -2px -4px; border-radius: 7px; font: inherit; color: inherit; cursor: pointer; }
      .bqi-cbtn:hover { background: rgba(125,242,176,.14); }
      .bqi-dashboard-only { display: inline-flex; align-items: center; min-height: 34px; padding: 0 12px; border: 1px solid rgba(10,15,13,.12); border-radius: 9px; background: var(--paper-soft, #f3f1eb); color: #5E6762; font: 600 11px var(--sans, sans-serif); white-space: nowrap; }
      .bqi-cbtn.is-locked, .bqi-mini.is-locked { opacity: .72; cursor: not-allowed; }
      .bqi-csrc { font-style: normal; font-size: 11px; opacity: .6; margin-left: 5px; }
      .bqi-iconpick { display: grid; grid-template-columns: repeat(auto-fill, minmax(46px, 1fr)); gap: 8px; max-height: 168px; overflow-y: auto; padding: 8px; border: 1px solid rgba(10,15,13,.14); border-radius: 12px; background: var(--paper); }
      .bqi-icon { aspect-ratio: 1; border: 1.5px solid rgba(10,15,13,.10); border-radius: 10px; background: var(--paper); cursor: pointer; padding: 5px; color: var(--riad); display: flex; align-items: center; justify-content: center; }
      .bqi-icon:hover { border-color: rgba(11,110,79,.5); }
      .bqi-icon.on { border-color: var(--atlas); border-width: 2px; background: #EAF5EF; }
      .bqi-icon .bq-art-photo { width: 100%; height: 100%; }
      .bqi-help { font-size: 12px; color: #5E6762; margin-top: -6px; margin-bottom: 12px; }
      .bqi-help.is-good { color: var(--atlas); }
      .bqi-help.is-bad  { color: #9B2F22; }
      /* .bqi-help remonte de 6px pour se coller sous un <input> nu ; sous une
         boîte de scan (qui a sa propre bordure) ce retrait la fait chevaucher
         le cadre. */
      .bqx-scanbox + .bqi-help { margin-top: 7px; }
      .bqi-first { padding: 40px 26px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 8px; }
      .bqi-first svg { width: 34px; height: 34px; color: var(--atlas); margin-bottom: 4px; }
      .bqi-first b { font-size: 16px; color: var(--ink); }
      .bqi-first span { font-size: 13.5px; color: #6d766f; max-width: 46ch; line-height: 1.55; }
      .bqi-first em { font-style: normal; font-size: 12.5px; color: #8d968f; margin-top: 6px; }

      /* ─── Reprise de stock (saisie à la douchette) ─── */
      .bqx-head { display: flex; align-items: center; gap: 16px; padding: 20px 24px 14px; border-bottom: 1px solid rgba(10,15,13,.08); }
      .bqx-head-t { flex: 1; min-width: 0; }
      .bqx-head-t h3 { margin: 0 0 2px; font-size: 18px; }
      .bqx-head-t span { font-size: 12.5px; color: #5E6762; line-height: 1.45; display: block; }
      .bqx-tally { display: flex; align-items: baseline; gap: 6px; background: var(--paper); border: 1px solid rgba(10,15,13,.08); border-radius: 12px; padding: 8px 14px; flex: 0 0 auto; }
      .bqx-tally b { font-family: var(--mono); font-size: 19px; font-weight: 600; color: var(--atlas); }
      .bqx-tally span { font-size: 11px; color: #5E6762; }
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
      .bqx-hint { font-size: 12.5px; color: #5E6762; margin: 9px 2px 0; line-height: 1.45; }
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
      .bqx-linkhead .bqi-art, .bqx-linkhead .bqi-art svg, .bqx-linkhead .bqi-art img { width: 28px; height: 28px; flex: 0 0 28px; }
      .bqx-linkhead > div { flex: 1; min-width: 0; }
      .bqx-linkhead b { display: block; font-size: 14px; }
      .bqx-linkhead span { font-size: 11.5px; color: #5E6762; }
      .bqx-chip.is-pick { cursor: pointer; font: inherit; font-size: 12.5px; color: var(--ink); }
      .bqx-chip.is-pick:hover { border-color: var(--atlas); background: rgba(11,110,79,.08); }
      .bqx-chain b { display: block; font-size: 13.5px; }
      .bqx-chain span { font-size: 12px; color: #5E6762; line-height: 1.45; }
      .bqx-common { display: flex; align-items: baseline; gap: 10px; margin: 12px 24px 0; padding: 10px 14px; background: var(--paper); border-radius: 11px; }
      .bqx-common span { font-size: 10.5px; letter-spacing: .05em; text-transform: uppercase; color: #5E6762; }
      .bqx-common b { font-size: 13.5px; }
      .bqx-known-card { display: flex; align-items: center; gap: 15px; padding: 16px 24px 8px; }
      .bqx-known-card > div { flex: 1; min-width: 0; }
      .bqx-known-card b { font-size: 16px; display: block; }
      .bqx-known-card span { display: block; font-size: 12.5px; color: #5E6762; margin-top: 2px; }
      .bqx-thisvar { display: flex !important; align-items: center; gap: 7px; margin-top: 5px !important; }
      .bqx-thisvar i { width: 12px; height: 12px; border-radius: 50%; border: 1px solid rgba(0,0,0,.18); flex: 0 0 12px; }
      .bqx-existing { padding: 8px 24px 4px; }
      .bqx-existing > span { display: block; font-size: 10.5px; letter-spacing: .05em; text-transform: uppercase; color: #5E6762; margin-bottom: 7px; }
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
      .bqx-act p { margin: 4px 0 10px; font-size: 12px; color: #5E6762; line-height: 1.45; }
      .bqx-qtyrow { display: flex; align-items: center; gap: 7px; }
      .bqx-qtyrow input { width: 62px; text-align: center; font-family: var(--mono); font-size: 16px; padding: 8px; border: 1px solid rgba(10,15,13,.16); border-radius: 9px; background: var(--surface, #fff); color: var(--ink); }
      .bqx-qtyrow .bq-btn { margin-left: 4px; }
      .bqx-pricediff { display: flex; align-items: center; justify-content: center; gap: 18px; padding: 20px 24px; }
      .bqx-pricediff > div { text-align: center; }
      .bqx-pricediff span { display: block; font-size: 10.5px; letter-spacing: .05em; text-transform: uppercase; color: #5E6762; }
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
      .bqx-opt span { font-size: 11.5px; color: #5E6762; line-height: 1.38; }
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
      /* #0152/#0158 · nuit : les encres claires codées en dur restaient
         posées sur des fonds sombres (même famille que #0156 : la carte
         .warn crème sur fond nuit). On ne change que la luminance, jamais
         la teinte — pas de nouvelle couleur d'accent. */
      :is(html[data-theme="dark"], html[data-caisse-theme="dark"]) .bqi-kpi.warn { background: rgba(230,184,77,.13); border-color: #6b5320; }
      :is(html[data-theme="dark"], html[data-caisse-theme="dark"]) .bqi-kpi.warn .l { color: #e6c878; }
      :is(html[data-theme="dark"], html[data-caisse-theme="dark"]) .bqi-info span,
      :is(html[data-theme="dark"], html[data-caisse-theme="dark"]) .bqi-kpi .l,
      :is(html[data-theme="dark"], html[data-caisse-theme="dark"]) .bqi-modh > div span,
      :is(html[data-theme="dark"], html[data-caisse-theme="dark"]) .bqi-vtable th,
      :is(html[data-theme="dark"], html[data-caisse-theme="dark"]) .bqi-fg label,
      :is(html[data-theme="dark"], html[data-caisse-theme="dark"]) .bqi-help,
      :is(html[data-theme="dark"], html[data-caisse-theme="dark"]) .bqi-dashboard-only,
      :is(html[data-theme="dark"], html[data-caisse-theme="dark"]) .bqi-first span,
      :is(html[data-theme="dark"], html[data-caisse-theme="dark"]) .bqx-head-t span,
      :is(html[data-theme="dark"], html[data-caisse-theme="dark"]) .bqx-tally span,
      :is(html[data-theme="dark"], html[data-caisse-theme="dark"]) .bqx-hint,
      :is(html[data-theme="dark"], html[data-caisse-theme="dark"]) .bqx-chain span,
      :is(html[data-theme="dark"], html[data-caisse-theme="dark"]) .bqx-known-card span,
      :is(html[data-theme="dark"], html[data-caisse-theme="dark"]) .bqx-existing > span,
      :is(html[data-theme="dark"], html[data-caisse-theme="dark"]) .bqx-common span,
      :is(html[data-theme="dark"], html[data-caisse-theme="dark"]) .bqx-pricediff span,
      :is(html[data-theme="dark"], html[data-caisse-theme="dark"]) .bqx-linkhead span,
      :is(html[data-theme="dark"], html[data-caisse-theme="dark"]) .bqx-act p,
      :is(html[data-theme="dark"], html[data-caisse-theme="dark"]) .bqx-opt span { color: #9cb1a6; }
      :is(html[data-theme="dark"], html[data-caisse-theme="dark"]) .bqi-first em,
      :is(html[data-theme="dark"], html[data-caisse-theme="dark"]) .bqi-nocode,
      :is(html[data-theme="dark"], html[data-caisse-theme="dark"]) .bqx-log-row em,
      :is(html[data-theme="dark"], html[data-caisse-theme="dark"]) .bqx-log-empty,
      :is(html[data-theme="dark"], html[data-caisse-theme="dark"]) .bqx-pricediff > svg,
      :is(html[data-theme="dark"], html[data-caisse-theme="dark"]) .bqi-code { color: #7e9489; }
      :is(html[data-theme="dark"], html[data-caisse-theme="dark"]) .bqi-code em.gen { color: #7DF2B0; }
      :is(html[data-theme="dark"], html[data-caisse-theme="dark"]) .bqi-code em.imp,
      :is(html[data-theme="dark"], html[data-caisse-theme="dark"]) .bqx-hint.is-warn,
      :is(html[data-theme="dark"], html[data-caisse-theme="dark"]) .bqx-sym.warn,
      :is(html[data-theme="dark"], html[data-caisse-theme="dark"]) .bqx-log-row.is-recu svg,
      :is(html[data-theme="dark"], html[data-caisse-theme="dark"]) .bqx-found.is-known svg { color: #e6c878; }
      :is(html[data-theme="dark"], html[data-caisse-theme="dark"]) .bqi-stock.rupture,
      :is(html[data-theme="dark"], html[data-caisse-theme="dark"]) .bqi-help.is-bad,
      :is(html[data-theme="dark"], html[data-caisse-theme="dark"]) .bqx-hint.is-bad,
      :is(html[data-theme="dark"], html[data-caisse-theme="dark"]) .bqsd-v.bad,
      :is(html[data-theme="dark"], html[data-caisse-theme="dark"]) .bqx-log-row.is-erreur svg,
      :is(html[data-theme="dark"], html[data-caisse-theme="dark"]) .bqx-found.is-fix svg,
      :is(html[data-theme="dark"], html[data-caisse-theme="dark"]) .bqi-modfoot .bq-btn.danger { color: #e08d7f; }
      :is(html[data-theme="dark"], html[data-caisse-theme="dark"]) .bqsd-v.warn { color: #e6c878; }
      :is(html[data-theme="dark"], html[data-caisse-theme="dark"]) .bqsd-ok { color: #7DF2B0; }
      :is(html[data-theme="dark"], html[data-caisse-theme="dark"]) .bqi-icon.on { background: rgba(125,242,176,.14); }
      @media (max-width: 620px) {
        .bqx-choice { grid-template-columns: 1fr; }
        .bqx-head { flex-direction: column; align-items: flex-start; gap: 10px; }
        /* Sur téléphone, le nom et sa ligne de détails gardent toute la largeur ;
           stock, prix et étiquettes passent dessous au lieu de les écraser. */
        .bqi-list { padding: 4px 14px; }
        .bqi-row { display: grid; grid-template-columns: 40px minmax(0, 1fr) auto auto; column-gap: 12px; row-gap: 8px; align-items: center; padding: 12px; }
        .bqi-art { grid-row: 1 / 3; align-self: start; }
        .bqi-info { grid-column: 2 / 5; }
        .bqi-stock { grid-column: 2; min-width: 0; text-align: left; }
        .bqi-stock::after { content: ' en stock'; font-family: var(--sans); font-size: 12px; font-weight: 400; color: #5E6762; }
        .bqi-price { grid-column: 3; min-width: 0; }
        .bqi-mini { grid-column: 4; }
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
      if (!document.body.classList.contains('is-pos-boutique')) return;
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
    if (state.checkoutBusy || (root && $$('.modal-veil.is-open', root).length)) {
      toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Terminez la fenêtre ouverte avant de scanner'));
      return;
    }
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
        <button class="bq-modal-x" data-inv-x aria-label="${(globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Fermer')}"><i data-lucide="x"></i></button>
        <div class="bqi-modh"><div><h3>Test de la douchette</h3><span>Scannez n'importe quel article. Rien n'est vendu, rien n'est modifié.</span></div></div>
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
        <div class="bqi-modfoot">
          <button class="bq-btn secondary" id="bqsd-copy">Copier le diagnostic</button>
          <button class="bq-btn" data-inv-x>Terminer</button>
        </div>`, (el) => {
        const cp = $('#bqsd-copy', el);
        if (cp) cp.onclick = () => {
          const txt = JSON.stringify({ ua: navigator.userAgent, burst: burst && { raw: burst.raw, norm: burst.norm, n: burst.n, span: burst.span, enter: burst.enter, ev: burst.ev.map((x) => [x.code, x.key, x.ch]) } }, null, 1);
          (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(
            () => toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Diagnostic copié')), () => toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Copie impossible sur cet appareil')));
        };
      });
    }

    if (scanDiagOff) scanDiagOff();
    document.addEventListener('keydown', onKey, true);
    // The panel must keep listening while it is open, and stop the moment the
    // veil closes — by the X, the footer button, Escape or a click outside.
    const veil = $('#bq-inv-veil', root);
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
    if (!catDB()) { toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Base d\'inventaire indisponible')); return; }
    if (state.view !== 'inventaire') switchView('inventaire');
    if (!intake.open) { intake.open = true; intakeReset(); }
    intakeTake(raw);
  }
export { armScanCapture, bqReal, catDB, disarmScanCapture, fmtNum, injectInvCss, installWedgeScanner, invScanHandle, lineAvailableQty, lineReturnedQty, normScan, openExchSummary, openPay, openScannerTest, openVoucher, renderAcomptes, renderEchanges, renderNet, syncNetworkState, toggleOffline };
