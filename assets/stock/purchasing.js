/* Stock · purchasing. Fonctions privées, installées au premier usage. */
window.KiwiStockInternal.install('purchasing', (S) => {
  'use strict';
  const { PICK_COPY, QO_COPY, STR, allCategories, catLabel, catalogLabel, catalogText, closeTopModal, currentStockFor, esc, fmtDateShort, fmtMad, fmtPct, fmtUnit, getInv, getSup, isRetailStock, itemHistory, lang, render, renderAiCard, rerenderTabBody, retailProcurementDoc, stConfirmedOrders, stDeletedSups, stDemoNote, stOverlayRaw, stOverlayScope, stSaveOverlay, stShowReal, stSupOverrides, svg, t, topBackdrop, wireDismiss } = S;

  function computeRealSupplierPriceChanges() {
    if (!window.KiwiInventory || !window.KiwiInventory.history) return [];
    const raw = stOverlayRaw();
    const subList = Array.isArray(raw.subcategories) ? raw.subcategories : [];
    const changes = [];
    
    subList.forEach(sub => {
      const hist = (window.KiwiInventory.history(sub.id) || []).filter(m => m.reason === 'receipt' && m.unitCost != null);
      if (!hist.length) return;
      
      const bySup = new Map();
      hist.forEach(m => {
        const supName = (m.meta && m.meta.supplierName) || (m.meta && m.meta.supplierId) || 'Fournisseur';
        if (!bySup.has(supName)) bySup.set(supName, []);
        bySup.get(supName).push(m);
      });

      bySup.forEach((mList, supName) => {
        mList.sort((a, b) => (+b.occurredTs || 0) - (+a.occurredTs || 0));
        const latest = mList[0];
        const prev = mList[1] || null;
        if (!prev) return;
        const pLast = latest.unitCost;
        const pPrev = prev.unitCost;
        if (pLast != null && pPrev != null && pLast !== pPrev) {
          const delta = Math.round((pLast - pPrev) * 100) / 100;
          const pct = Math.round(((delta) / pPrev) * 1000) / 10;
          
          const impactedRecipes = [];
          try {
            const costDoc = window.KiwiCost && window.KiwiCost.doc ? window.KiwiCost.doc() : (window.KiwiCost && window.KiwiCost.store ? window.KiwiCost.store.get(stOverlayScope()) : null);
            const recipes = (costDoc && costDoc.recipes) || (window.KiwiRestaurantRecipes && window.KiwiRestaurantRecipes.getAll ? window.KiwiRestaurantRecipes.getAll() : {});
            Object.entries(recipes).forEach(([rId, rec]) => {
              if (!rec || !Array.isArray(rec.ingredients)) return;
              const line = rec.ingredients.find(ing => ing.stockId === sub.id || ing.name === sub.name);
              if (line) {
                const portionQty = +line.qty || 0;
                const dishCostDelta = Math.round(portionQty * delta * 100) / 100;
                impactedRecipes.push({
                  id: rId,
                  name: rec.itemName || rec.name || rId,
                  dishCostDelta: dishCostDelta,
                });
              }
            });
          } catch (_) {}

          changes.push({
            subId: sub.id,
            subName: sub.name,
            unit: sub.unit,
            supplierName: supName,
            pLast: pLast,
            pPrev: pPrev,
            delta: delta,
            pct: pct,
            date: latest.occurredTs || Date.now(),
            impactedRecipes: impactedRecipes,
          });
        }
      });
    });

    return changes;
  }

  function renderRealSupplierPriceChanges() {
    const changes = computeRealSupplierPriceChanges();
    if (!changes.length) {
      return `
        <div class="st-ai" style="margin-top:16px;">
          <div class="st-ai-t">Évolution des tarifs fournisseurs</div>
          <div class="st-ai-b">Tous les tarifs facturés lors des dernières réceptions sont stables. Kiwi analyse automatiquement l'historique des bons de livraison pour détecter les variations de prix.</div>
        </div>
      `;
    }
    return changes.map(ch => {
      const isUp = ch.delta > 0;
      const recipesText = ch.impactedRecipes.length > 0
        ? ` · Impact sur ${ch.impactedRecipes.length} recette${ch.impactedRecipes.length > 1 ? 's' : ''} (ex: ${esc(ch.impactedRecipes[0].name)} ${isUp ? '+' : ''}${fmtMad(ch.impactedRecipes[0].dishCostDelta)}/portion)`
        : '';
      return `
        <div class="st-ai ${isUp ? 'warn' : 'ok'}" style="margin-top:14px;">
          <div class="st-ai-t" style="display:flex; align-items:center; gap:6px;">
            ${svg(isUp ? 'trendingUp' : 'trendingDown', 14)}
            <span>${esc(ch.supplierName)} : variation de tarif sur ${esc(ch.subName)} (${isUp ? '+' : ''}${fmtPct(ch.pct, 1)})</span>
          </div>
          <div class="st-ai-b">
            Passage de <b>${esc(fmtMad(ch.pPrev))}</b> à <b>${esc(fmtMad(ch.pLast))}</b> / ${esc(ch.unit)}${recipesText}.
          </div>
        </div>
      `;
    }).join('');
  }

  function renderSuppliers() {
    const sup = getSup();
    const totalSpend = sup.reduce((s, x) => s + x.monthlySpend, 0);
    const weightedPrice = sup.reduce((s, x) => s + (x.priceChangeLast30d * x.monthlySpend), 0) / (totalSpend || 1);
    const trendCls = weightedPrice > 1 ? 'up' : weightedPrice < -1 ? 'down' : '';
    return `
      <div class="st-section">
        <div class="st-section-head" style="justify-content:space-between; flex-wrap:wrap; gap:10px;">
          <div style="display:flex; align-items:baseline; gap:10px; flex-wrap:wrap;">
            <h3>${esc(t('supTitle'))}</h3>
            <span class="st-section-sub">${esc(t('supSub', sup.length))}</span>
          </div>
          <button data-activation=write class="st-btn primary" type="button" data-action="stock-add-supplier">${svg('plus', 13)}<span>${esc(t('addSupCta'))}</span></button>
        </div>
        <div class="st-sup-stats">
          <div class="st-sup-stat"><div class="l">${esc(t('supStatActive'))}</div><div class="v">${sup.length}</div></div>
          <div class="st-sup-stat"><div class="l">${esc(t('supStatSpend'))}</div><div class="v">${esc(fmtMad(totalSpend))}</div></div>
          <div class="st-sup-stat"><div class="l">${esc(t('supStatPriceTrend'))}</div><div class="v ${trendCls}">${esc(fmtPct(weightedPrice, 1))}</div></div>
        </div>
        <div class="st-supplier-cards">${sup.map(renderSupplierCard).join('')||`<div class="rmw-empty">${catalogLabel('noSuppliers','Aucun fournisseur enregistré.')}</div>`}</div>
        <div class="st-tbl-wrap st-supplier-table">
          <table class="st-sup-table">
            <thead>
              <tr>
                <th>${esc(t('colSupplier'))}</th>
                <th>${esc(t('colSupCat'))}</th>
                <th class="r">${esc(t('colSupSpend'))}</th>
                <th>${esc(t('colSupPrice'))}</th>
                <th>${esc(t('colSupDeliv'))}</th>
                <th>${esc(t('colSupRate'))}</th>
                <th class="r">${esc(t('colActions'))}</th>
              </tr>
            </thead>
            <tbody>
              ${sup.map(renderSupRow).join('')}
            </tbody>
          </table>
        </div>
      </div>

      ${stShowReal() ? renderRealSupplierPriceChanges() : renderAiCard(t('aiPriceUpT'), t('aiPriceUpB'), t('aiPriceUpA'))}
    `;
  }

  function supplierDate(at){const n=typeof at==='string'&&/^\d+$/.test(at)?+at:at;const d=new Date(n);return Number.isFinite(d.getTime())?fmtDateShort(d.toISOString()):catalogText('notRecorded','Non enregistrée');}

  function supplierHistory(s){
    const receipts=(window.KiwiProcurement?.doc?.()?.receipts||[]).filter(r=>String(r.supplierId)===String(s.id)).map(r=>({at:r.receivedAt||r.createdAt,reference:r.number||r.id,total:(r.lines||[]).reduce((n,l)=>n+(+l.qty||0)*(+l.unitCost||0),0)}));
    const stamp=at=>{const value=typeof at==='string'&&/^\d+$/.test(at)?+at:at;return new Date(value).getTime()||0;};
    if(receipts.length)return receipts.sort((a,b)=>stamp(b.at)-stamp(a.at));
    // A delivery can have multiple item movements. Count/group its receipt once.
    const groups=new Map();
    getInv().forEach(it=>itemHistory(it).filter(m=>m.reason==='receipt'&&(String(m.meta?.supplierId||'')===String(s.id)||(s.name&&m.meta?.supplierName===s.name))).forEach(m=>{
      const key=m.refId||m.meta?.receiptRef||m.id,at=m.occurredTs||m.createdTs;
      const row=groups.get(key)||{at,reference:m.meta?.externalRef||m.refId||it.name,total:0};
      row.total+=Math.max(0,+m.qty||0)*(+m.unitCost||0);groups.set(key,row);
    }));
    return [...groups.values()].sort((a,b)=>stamp(b.at)-stamp(a.at));
  }

  function renderSupplierCard(s){
    const last=supplierHistory(s)[0];
    const sub=[catLabel(s.category),s.location].filter(Boolean).map(esc).join(' · ');
    return `<article class="st-supplier-card"><button data-activation=write class="st-supplier-open" type="button" data-action="stock-supplier-detail" data-supplier-id="${esc(s.id)}" aria-label="${esc(t('btnDetail'))} · ${esc(s.name)}">
      <span class="st-supplier-card-head"><span class="st-sup-name">${esc(s.name)}</span><small class="st-sup-loc">${sub}</small></span>
      <span class="st-supplier-card-meta"><span><span>${esc(t('colSupSpend'))}</span><b>${esc(fmtMad(s.monthlySpend))}</b></span><span><span>${catalogLabel('lastDelivery','Dernière livraison')}</span><b>${last?esc(supplierDate(last.at)):catalogLabel('notRecorded','Non enregistrée')}</b></span></span></button>
      <button class="st-supplier-call" type="button" data-action="stock-call-supplier" data-supplier-id="${esc(s.id)}" data-name="${esc(s.name)}" data-phone="${esc(s.contact)}"${s.contact?'':' disabled'} aria-label="${esc(t('mSupCall'))} · ${esc(s.name)}">${svg('phone',16)}</button></article>`;
  }

  function renderSupRow(s) {
    const pcl = s.priceChangeLast30d;
    const priceCls = pcl > 1 ? 'up' : pcl < -1 ? 'down' : 'neutral';
    const priceIco = pcl > 1 ? 'trendingUp' : pcl < -1 ? 'trendingDown' : 'minus';
    const priceLabel = pcl === 0 ? t('priceStable') : fmtPct(pcl, 1);
    const risePill = pcl > 5 ? `<span class="st-sup-rise-pill">${esc(t('priceUp'))}</span>` : '';
    const rateVal = (s.rating != null && !isNaN(s.rating) && s.rating !== '') ? Number(s.rating) : null;
    const rateHtml = rateVal != null
      ? `<span class="st-sup-rate"><span class="st">${'★'.repeat(Math.round(rateVal))}</span>${esc(rateVal.toFixed(1))}</span>`
      : `<span class="st-sup-rate muted" style="color:var(--n-500);">·</span>`;
    return `
      <tr>
        <td>
          <div class="st-sup-name">${esc(s.name)}</div>
          <div class="st-sup-loc">${esc(s.location)}</div>
          <div class="st-sup-phone">${esc(s.contact)}</div>
        </td>
        <td><span class="st-sup-cat">${esc(catLabel(s.category))}</span></td>
        <td class="r"><span class="st-sup-spend">${esc(fmtMad(s.monthlySpend))}</span></td>
        <td><span class="st-sup-price ${priceCls}">${svg(priceIco, 12)}${esc(priceLabel)}</span>${risePill}</td>
        <td>
          <div class="st-sup-deliv">${esc(s.deliverySchedule)}</div>
          <div class="st-sup-deliv-sub">${esc(s.paymentTerms)}</div>
        </td>
        <td>${rateHtml}</td>
        <td class="r">
          <div class="st-actions">
            <button class="st-icon-btn" type="button" data-action="stock-call-supplier" data-supplier-id="${esc(s.id)}" data-name="${esc(s.name)}" data-phone="${esc(s.contact)}" title="${esc(t('mSupCall'))}" aria-label="${esc(t('mSupCall'))}">${svg('phone', 14)}</button>
            <button class="st-icon-btn" type="button" data-action="stock-wa-supplier" data-supplier-id="${esc(s.id)}" data-name="${esc(s.name)}" data-phone="${esc(s.contact)}" title="${esc(t('mSupWa'))}" aria-label="${esc(t('mSupWa'))}">${svg('messageCircle', 14)}</button>
            <button class="st-icon-btn" type="button" data-action="stock-supplier-detail" data-supplier-id="${esc(s.id)}" title="${esc(t('btnDetail'))}" aria-label="${esc(t('btnDetail'))}">${svg('eye', 14)}</button>
            <button data-activation=write class="st-icon-btn" type="button" data-action="stock-edit-supplier" data-supplier-id="${esc(s.id)}" title="${esc(t('titleEdit'))}" aria-label="${esc(t('titleEdit'))}">${svg('edit', 14)}</button>
            <button class="st-icon-btn" type="button" data-action="stock-new-po" data-supplier-id="${esc(s.id)}" title="${esc(t('mSupOrd'))}" aria-label="${esc(t('mSupOrd'))}">${svg('plus', 14)}</button>
            <button data-activation=write class="st-icon-btn" type="button" data-action="stock-delete-supplier" data-supplier-id="${esc(s.id)}" title="${esc(t('titleDelete'))}" aria-label="${esc(t('titleDelete'))}" style="color:#9a1f1f;">${svg('x', 14)}</button>
          </div>
        </td>
      </tr>
    `;
  }

  function renderOrders() {
    if (stShowReal()) {
      const d = retailProcurementDoc();
      const suppliers = new Map((d.suppliers || []).map((s) => [String(s.id), s]));
      const total = (row) => (row.lines || []).reduce((sum, line) => sum + (+line.qty || 0) * (+line.unitCost || 0), 0);
      const statusLabel = (status) => ({ draft: 'Brouillon', sent: 'Envoyée', partial: 'Partielle', received: 'Reçue', cancelled: 'Annulée' }[status] || status || '·');
      const active = (d.orders || []).filter((o) => !['received', 'cancelled'].includes(o.status));
      const history = [
        ...(d.orders || []).filter((o) => ['received', 'cancelled'].includes(o.status)).map((o) => ({
          id: o.id, at: o.updatedAt || o.createdAt, supplierId: o.supplierId, total: total(o), status: statusLabel(o.status), number: o.number,
        })),
        ...(d.receipts || []).filter((r) => !r.orderId).map((r) => ({
          id: r.id, at: r.receivedAt || r.createdAt, supplierId: r.supplierId, total: total(r), status: 'Reçue', number: r.number,
        })),
      ].sort((a, b) => (+b.at || 0) - (+a.at || 0));
      return `
      <div class="st-section">
        <div class="st-section-head" style="justify-content:space-between;">
          <div style="display:flex; align-items:center; gap:10px;">
            <h3>${esc(t('ordTitle'))}</h3>
          </div>
          <button data-activation=write class="st-btn primary" type="button" data-action="${isRetailStock() ? 'stock-new-order' : 'supplier-new-po'}">${esc(t('ordNew'))}</button>
        </div>
        ${active.length ? `<div class="st-ord-list">${active.map((o) => `
          <div class="st-ord-card">
            <div class="st-ord-body">
              <div class="st-ord-top"><span class="st-ord-id">${esc(o.number || o.id)}</span><span class="st-ord-when">${esc(o.expectedDate || '·')}</span><span class="st-ord-status ${o.status === 'partial' ? 'pending' : 'ok'}">${esc(statusLabel(o.status))}</span></div>
              <div class="st-ord-items"><b>${esc(suppliers.get(String(o.supplierId))?.name || 'Fournisseur')}</b> · ${esc((o.lines || []).map((line) => `${line.name || line.itemId} ${line.qty} ${line.unit || ''}`).join(' · '))}</div>
              <div class="st-ord-total">${esc(fmtMad(total(o)))}</div>
            </div>
          </div>`).join('')}</div>` : `<div style="color:var(--n-500); font-size:13px; padding:14px 2px;">${esc(t('ordEmpty'))}</div>`}
      </div>
      ${history.length ? `
      <div class="st-section">
        <div class="st-section-head"><h3>${esc(t('ordHistory'))}</h3></div>
        <div class="st-tbl-wrap st-order-table"><table class="st-sup-table"><thead><tr><th>DATE</th><th>${esc(t('colSupplier'))}</th><th class="r">${esc(t('mScanTotal'))}</th><th>${esc(t('colStatus'))}</th></tr></thead><tbody>
          ${history.map((h) => `<tr><td>${esc(fmtDateShort(new Date(h.at || Date.now()).toISOString()))}</td><td><span class="st-sup-name">${esc(suppliers.get(String(h.supplierId))?.name || 'Fournisseur')}</span><div class="st-sup-deliv-sub">${esc(h.number || h.id)}</div></td><td class="r"><span class="st-sup-spend">${esc(fmtMad(h.total))}</span></td><td><span class="status-ok">${esc(h.status)}</span></td></tr>`).join('')}
        </tbody></table></div>
      </div>` : ''}`;
    }
    return `
      <div class="st-section">
        <div class="st-section-head" style="justify-content:space-between;">
          <div style="display:flex; align-items:center; gap:10px;">
            <h3>${esc(t('ordTitle'))}</h3>
            <span class="st-count-badge">4</span>
          </div>
          <button data-activation=write class="st-btn primary" type="button" data-action="stock-new-order">${esc(t('ordNew'))}</button>
        </div>
        <div class="st-ord-stats">
          <div class="st-sup-stat"><div class="l">${esc(t('ordStatActive'))}</div><div class="v">4</div></div>
          <div class="st-sup-stat"><div class="l">${esc(t('ordStatPending'))}</div><div class="v">${esc(fmtMad(12458))}</div></div>
          <div class="st-sup-stat"><div class="l">${esc(t('ordStatMonth'))}</div><div class="v">47</div></div>
        </div>
        <div class="st-ord-list">
          ${renderActiveOrders()}
        </div>
      </div>

      <div class="st-section">
        <div class="st-section-head"><h3>${esc(t('ordHistory'))}</h3></div>
        ${renderHistoryTable()}
      </div>

      ${renderSuggestedOrder()}
    `;
  }

  function renderActiveOrders() {
    const orders = [
      {
        id: '2843', sup: 'Boucherie Errazi', when: `${t('ramTomorrow')} 06h`,
        items: 'Viande hachée 12 kg · Agneau épaule 14 kg · Merguez 4 kg',
        total: 3250, status: 'ok', statusLabel: t('stConfirmed'),
        acts: [['btnDetail', 'stock-ord-detail'], ['btnEditOrd', 'stock-ord-edit'], ['btnCancel', 'stock-ord-cancel']],
        urgent: false,
      },
      {
        id: '2844', sup: 'Marché de gros Inezgane', when: `${t('ramFriday')} 06h`,
        items: 'Tomates 20 kg · Oignons 15 kg · Coriandre 30 bottes · Menthe 40 bottes · Persil 25 bottes',
        total: 1840, status: stConfirmedOrders.has('2844') ? 'ok' : 'pending',
        statusLabel: stConfirmedOrders.has('2844') ? t('stConfirmed') : t('stPending'),
        acts: stConfirmedOrders.has('2844')
          ? [['btnDetail', 'stock-ord-detail'], ['btnEditOrd', 'stock-ord-edit']]
          : [['btnConfirm', 'stock-confirm-order', 'primary'], ['btnEditOrd', 'stock-ord-edit']],
        urgent: false,
      },
      {
        id: '2845', sup: 'Métro Casablanca (récurrente)', when: `${t('ramNextThu')} 14h`,
        items: 'Liste type, 14 articles',
        total: 4620, status: 'rec', statusLabel: t('stRecurring'),
        acts: [['btnEditList', 'stock-ord-edit'], ['btnPause', 'stock-ord-pause']],
        urgent: false,
      },
      {
        id: '2846', sup: 'Marché Central · Port', when: t('ramTodayLate'),
        items: 'Poisson frais sole 6 kg · Crevettes 2 kg',
        total: 1188, status: 'urgent', statusLabel: t('stUrgent'),
        acts: [['btnTrack', 'stock-ord-track'], ['btnContactSup', 'stock-ord-contact']],
        urgent: true,
      },
    ];
    return orders.map(o => {
      return `
        <div class="st-ord-card ${o.urgent ? 'urgent' : ''}">
          <div class="st-ord-body">
            <div class="st-ord-top">
              <span class="st-ord-id">${esc(t('ramOrder'))}${esc(o.id)}</span>
              <span class="st-ord-when">${esc(o.when)}</span>
              <span class="st-ord-status ${o.status}">${esc(o.statusLabel)}</span>
            </div>
            <div class="st-ord-items"><b>${esc(o.sup)}</b> · ${esc(o.items)}</div>
            <div class="st-ord-total">${esc(fmtMad(o.total))}</div>
          </div>
          <div class="st-ord-acts">
            ${o.acts.map(a => `<button data-activation=write class="st-btn${a[2] ? ' ' + a[2] : ''}" type="button" data-action="${a[1]}" data-order-id="${esc(o.id)}">${esc(t(a[0]))}</button>`).join('')}
          </div>
        </div>
      `;
    }).join('');
  }

  function renderHistoryTable() {
    const hist = [
      { date: '2026-05-13', sup: 'Boucherie Errazi', total: 3120, status: t('stReceived'), cls: 'ok' },
      { date: '2026-05-13', sup: 'Centrale Danone', total: 1180, status: t('stReceived'), cls: 'ok' },
      { date: '2026-05-12', sup: 'Marché de gros Inezgane', total: 1720, status: t('stReceived'), cls: 'ok' },
      { date: '2026-05-12', sup: 'NABC', total: 2160, status: t('stReceived'), cls: 'ok' },
      { date: '2026-05-10', sup: 'Métro Casablanca', total: 4480, status: t('stReceived'), cls: 'ok' },
      { date: '2026-05-09', sup: 'Minoterie Lazaar', total: 480, status: t('stReceived'), cls: 'ok' },
      { date: '2026-05-08', sup: 'Marché Central · Port', total: 920, status: t('stPartial'), cls: 'warn' },
      { date: '2026-05-07', sup: 'Huileries Sefrioui', total: 1680, status: t('stReceived'), cls: 'ok' },
      { date: '2026-05-06', sup: 'Boucherie Errazi', total: 3540, status: t('stReceived'), cls: 'ok' },
      { date: '2026-05-05', sup: 'Avicole Atlas', total: 480, status: t('stCancelled'), cls: 'bad' },
    ];
    return `
      <div class="st-tbl-wrap st-order-table">
        <table class="st-sup-table">
          <thead>
            <tr><th>DATE</th><th>${esc(t('colSupplier'))}</th><th class="r">${esc(t('mScanTotal'))}</th><th>${esc(t('colStatus'))}</th></tr>
          </thead>
          <tbody>
            ${hist.map(h => `
              <tr>
                <td><span class="st-sup-deliv-sub">${esc(fmtDateShort(h.date))}</span></td>
                <td><span class="st-sup-name">${esc(h.sup)}</span></td>
                <td class="r"><span class="st-sup-spend">${esc(fmtMad(h.total))}</span></td>
                <td><span class="status-${h.cls === 'ok' ? 'ok' : h.cls === 'warn' ? 'warn' : 'bad'}" style="font-weight:600; font-size:11.5px;">${esc(h.status)}</span></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderSuggestedOrder() {
    const items = [
      { n: 'Viande hachée bœuf', q: '14 kg', c: 1330, sup: 'Boucherie Errazi' },
      { n: 'Agneau épaule', q: '12 kg', c: 2016, sup: 'Boucherie Errazi' },
      { n: 'Merguez', q: '4 kg', c: 312, sup: 'Boucherie Errazi' },
      { n: 'Tomates fraîches', q: '24 kg', c: 192, sup: 'Marché Inezgane' },
      { n: 'Courgettes', q: '12 kg', c: 108, sup: 'Marché Inezgane' },
      { n: 'Menthe fraîche', q: '80 bottes', c: 240, sup: 'Marché Inezgane' },
      { n: 'Avocats', q: '8 kg', c: 256, sup: 'Fruits Premium' },
      { n: 'Coriandre fraîche', q: '24 bottes', c: 96, sup: 'Marché Inezgane' },
      { n: 'Lait entier', q: '60 L', c: 480, sup: 'Centrale Danone' },
      { n: 'Œufs', q: '240 unités', c: 336, sup: 'Avicole Atlas' },
      { n: 'Coca-Cola 33cl', q: '240 bouteilles', c: 1440, sup: 'NABC' },
      { n: 'Eau minérale 50cl', q: '120 bouteilles', c: 360, sup: 'Sidi Ali' },
      { n: 'Pain rond', q: '120 unités', c: 240, sup: 'Bakery El Ouafy' },
      { n: 'Couscous fin', q: '12 kg', c: 216, sup: 'Métro Casablanca' },
      { n: 'Semoule fine', q: '14 kg', c: 168, sup: 'Métro Casablanca' },
      { n: 'Sucre blanc', q: '10 kg', c: 90, sup: 'Métro Casablanca' },
      { n: 'Fromage frais', q: '4 kg', c: 248, sup: 'Métro Casablanca' },
      { n: 'Beurre', q: '6 kg', c: 468, sup: 'Centrale Danone' },
    ];
    const total = items.reduce((s, x) => s + x.c, 0);
    return `
      <div class="st-suggest">
        <div class="st-suggest-eyebrow">KIWI AI · AUTO-COMMANDE</div>
        <div class="st-suggest-t">${esc(t('autoOrderT'))}</div>
        <div class="st-suggest-b">${esc(t('autoOrderB'))}</div>
        <div class="st-suggest-items">
          ${items.map(x => `
            <div class="st-suggest-item">
              <span class="n">${esc(x.n)} <span style="color:rgba(247,245,240,0.5); font-size:11px;">· ${esc(x.sup)}</span></span>
              <span class="q">${esc(x.q)}</span>
              <span class="c">${esc(fmtMad(x.c))}</span>
            </div>
          `).join('')}
        </div>
        <div class="st-suggest-foot">
          <div class="st-suggest-total">
            <span class="l">${esc(t('autoOrderTotal'))}</span>
            <span class="v">${esc(fmtMad(total))}</span>
            <span class="st-suggest-save">${esc(t('autoOrderSave'))}</span>
          </div>
          <div class="st-suggest-acts">
            <button data-activation=write class="st-btn" type="button" data-action="stock-edit-suggested">${esc(t('btnEditFirst'))}</button>
            <button data-activation=write class="st-btn primary" type="button" data-action="stock-send-suggested">${esc(t('btnSendSuggested'))}</button>
          </div>
        </div>
      </div>
    `;
  }

  function openQuickOrder(itemId, opts = {}) {
    const it = getInv().find(x => x.id === itemId);
    if (!it) return;
    const L = QO_COPY[lang()] || QO_COPY.fr;
    const suggested = Math.max(1, Math.round((it.parLevel * 1.2 - currentStockFor(it)) * 10) / 10);
    const sups = getSup();
    const sup = sups.find(s => it.supplierId && s.id === it.supplierId) || sups.find(s => s.name === String(it.supplier || '').split(' · ')[0]) || sups[0] || null;
    const supOptions = sups.map(s => `<option value="${esc(s.id || s.name)}" ${sup && s === sup ? 'selected' : ''}>${esc(s.name)}${s.location ? ' · ' + esc(s.location) : ''}</option>`).join('');
    const phoneOk = (v) => /^\+?[\d\s.-]{8,}$/.test(String(v || '').trim());
    const waNum = (v) => { let d = String(v || '').replace(/\D/g, ''); if (d.startsWith('00')) d = d.slice(2); if (d.startsWith('0')) d = '212' + d.slice(1); return d; };
    const costLine = (q) => it.costPerUnit > 0 ? fmtMad(q * it.costPerUnit) : L.noCost;
    const m = window.Kiwi.modal({
      title: t('mQoTitle'),
      tag: opts.urgent === true ? 'URGENT' : '',
      desc: `${esc(it.name)} · ${esc(catLabel(it.category))}`,
      width: 560,
      body: `
        <div class="st-mb-row">
          <div class="st-mb-field">
            <label class="st-mb-label">${esc(t('mQoQty'))}</label>
            <div class="st-qo-qty">
              <button type="button" data-stock-qo-dec>−</button>
              <input class="st-mb-input mono" type="number" step="0.5" min="0.5" value="${suggested}" data-stock-qo-qty />
              <button type="button" data-stock-qo-inc>+</button>
              <span style="font-size:12px; color:var(--n-500); margin-left:6px;">${esc(it.unit)}</span>
            </div>
          </div>
          <div class="st-mb-field">
            <label class="st-mb-label">${esc(t('mQoSup'))}</label>
            ${sups.length ? `<select class="st-mb-input" data-stock-qo-sup>${supOptions}</select>` : `<input class="st-mb-input" type="text" value="${esc(L.noSupplier)}" disabled />`}
          </div>
        </div>
        <div class="st-mb-field" style="margin-bottom:14px;">
          <label class="st-mb-label">${esc(t('mQoNote'))}</label>
          <textarea class="st-mb-textarea" placeholder="${esc(L.notePh)}" data-stock-qo-note></textarea>
        </div>
        <div class="st-qo-summary">
          <span class="l">${esc(L.costLabel)}</span>
          <span class="v" data-stock-qo-total>${esc(costLine(suggested))}</span>
        </div>
        <p class="st-qo-how" data-stock-qo-how style="margin:12px 0 0; font-size:12px; color:var(--n-500); line-height:1.5;"></p>
      `,
      foot: `<button class="st-btn" data-dismiss-modal>${esc(STR[lang()].btnCancel || 'Annuler')}</button><button data-activation=write class="st-btn primary" data-stock-qo-send></button>`,
    });
    requestAnimationFrame(() => {
      wireDismiss(m?.el || topBackdrop());
      const qty = document.querySelector('[data-stock-qo-qty]');
      const totalEl = document.querySelector('[data-stock-qo-total]');
      const supSel = document.querySelector('[data-stock-qo-sup]');
      const how = document.querySelector('[data-stock-qo-how]');
      const sendBtn = document.querySelector('[data-stock-qo-send]');
      const chosen = () => sups.find(s => (s.id || s.name) === supSel?.value) || sup;
      const sync = () => {
        const s = chosen();
        const wa = !!(s && phoneOk(s.contact));
        if (sendBtn) sendBtn.textContent = wa ? L.sendWa : L.copy;
        if (how) how.textContent = wa ? L.howWa(s.name) : s ? L.howNoPhone(s.name) : L.howNoSupplier;
      };
      const recompute = () => { if (totalEl) totalEl.textContent = costLine(parseFloat(qty.value) || 0); };
      document.querySelector('[data-stock-qo-dec]')?.addEventListener('click', () => { qty.value = Math.max(0.5, (parseFloat(qty.value) || 1) - 0.5); recompute(); });
      document.querySelector('[data-stock-qo-inc]')?.addEventListener('click', () => { qty.value = (parseFloat(qty.value) || 1) + 0.5; recompute(); });
      qty?.addEventListener('input', recompute);
      supSel?.addEventListener('change', sync);
      sync();
      sendBtn?.addEventListener('click', () => {
        const s = chosen();
        const q = Math.max(0, parseFloat(qty.value) || 0);
        if (!q) return;
        const note = (document.querySelector('[data-stock-qo-note]')?.value || '').trim();
        /* « 16,8 kg » pour un fournisseur francophone, pas « 16.8 ». Chiffres
         * latins dans les trois langues, comme partout ailleurs dans Kiwi. */
        const qTxt = Number(q).toLocaleString(lang() === 'en' ? 'en-US' : 'fr-FR', { maximumFractionDigits: 2 });
        const text = L.message(s ? s.name : '', qTxt, it.unit, it.name, note);
        const po = recordQuickOrder(it, s, q, note);
        closeTopModal();
        if (po) { try { rerenderTabBody(); } catch (_) {} }
        if (s && phoneOk(s.contact)) {
          window.open(`https://wa.me/${waNum(s.contact)}?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
          window.Kiwi.toast(L.toastWa(s.name), { type: 'info', desc: po ? `${L.toastWaDesc} ${L.poSaved(po.number)}` : L.toastWaDesc, duration: 5200 });
        } else {
          Promise.resolve(navigator.clipboard?.writeText?.(text)).then(
            () => window.Kiwi.toast(L.toastCopied, { type: 'info', desc: s ? L.howNoPhone(s.name) : L.howNoSupplier, duration: 4200 }),
            () => window.Kiwi.toast(L.toastCopyFail, { type: 'warning', desc: text, duration: 6000 }),
          );
        }
      });
    });
  }

  function openOrderPicker() {
    const L = PICK_COPY[lang()] || PICK_COPY.fr;
    const items = getInv().slice().sort((a, b) => {
      const ra = a.parLevel > 0 ? currentStockFor(a) / a.parLevel : 9, rb = b.parLevel > 0 ? currentStockFor(b) / b.parLevel : 9;
      return ra - rb || String(a.name).localeCompare(String(b.name));
    });
    if (!items.length) { window.Kiwi.toast(L.empty, { type: 'info' }); return; }
    const m = window.Kiwi.modal({
      title: L.title, width: 480,
      body: `<p style="margin:0 0 12px; font-size:13px; color:var(--n-500);">${esc(L.intro)}</p>
        <div style="display:grid; gap:6px; max-height:56vh; overflow:auto;">${items.slice(0, 200).map((it) => `
          <button type="button" class="st-btn" data-pick-item="${esc(it.id)}" style="display:flex; justify-content:space-between; width:100%; text-align:start;">
            <span>${esc(it.name)}</span><span style="color:var(--n-500); font-size:12px;">${esc(fmtUnit(currentStockFor(it), it.unit))} ${esc(L.stock)}</span>
          </button>`).join('')}</div>`,
      foot: `<button class="st-btn" data-dismiss-modal>${esc(STR[lang()].btnCancel || 'Annuler')}</button>`,
    });
    requestAnimationFrame(() => {
      const scope = m?.el || topBackdrop();
      wireDismiss(scope);
      scope?.querySelectorAll('[data-pick-item]').forEach((b) => b.addEventListener('click', () => {
        const id = b.dataset.pickItem; closeTopModal(); openQuickOrder(id);
      }));
    });
  }

  function recordQuickOrder(it, supplier, qty, note) {
    const P = window.KiwiProcurement;
    if (!P?.createOrder || !it.retail || !supplier?.id || !(P.isUltra?.())) return null;
    const row = P.createOrder({ supplierId: supplier.id, note, lines: [{ itemId: it.id, name: it.name, qty, unit: it.unit, unitCost: it.costPerUnit }] });
    return row && !row.error ? row : null;
  }

  function openSupplierProfile(supplierId) {
    const s=getSup().find(x=>x.id===supplierId);if(!s)return;
    const history=supplierHistory(s),pcl=+s.priceChangeLast30d||0;
    const m=window.Kiwi.modal({title:s.name,desc:`${esc(s.location)} · ${esc(catLabel(s.category))}`,width:720,
      body:`<div class="st-md-stats"><div class="st-md-stat"><div class="l">${esc(t('colSupSpend'))}</div><div class="v">${esc(fmtMad(s.monthlySpend))}</div></div><div class="st-md-stat"><div class="l">${catalogLabel('recordedDeliveries','Livraisons enregistrées')}</div><div class="v">${history.length}</div></div><div class="st-md-stat"><div class="l">${esc(t('colSupPrice'))}</div><div class="v">${esc(fmtPct(pcl,1))}</div></div></div>
      <div class="st-md-section"><div class="st-md-section-t">${esc(t('colSupDeliv'))}</div><p>${esc(s.deliverySchedule||'')} · ${esc(s.paymentTerms||'')}</p></div>
      <div class="st-md-section"><div class="st-md-section-t">${esc(t('mSupHistory'))}</div><div class="st-md-list">${history.length?history.map(h=>`<div class="st-md-list-row"><div><span class="d">${esc(supplierDate(h.at))}</span><span class="n">${esc(h.reference)}</span></div><div class="v">${esc(fmtMad(h.total))}</div></div>`).join(''):`<div class="rmw-empty">${catalogLabel('noDeliveries','Aucune livraison enregistrée pour ce fournisseur.')}</div>`}</div></div>`,
      foot:`<div class="catalog-supplier-actions"><button class="st-btn" data-catalog-profile="stock-call-supplier" data-supplier-id="${esc(s.id)}" data-name="${esc(s.name)}" data-phone="${esc(s.contact)}">${svg('phone',14)}${esc(t('mSupCall'))}</button><button class="st-btn" data-catalog-profile="stock-wa-supplier" data-supplier-id="${esc(s.id)}" data-name="${esc(s.name)}" data-phone="${esc(s.contact)}">${esc(t('mSupWa'))}</button><button data-activation=write class="st-btn" data-catalog-profile="stock-edit-supplier" data-supplier-id="${esc(s.id)}">${esc(t('titleEdit'))}</button><button class="st-btn primary" data-catalog-profile="stock-new-po" data-supplier-id="${esc(s.id)}">${esc(t('mSupOrd'))}</button></div>`});
    m.el.querySelectorAll('[data-catalog-profile]').forEach(button=>button.onclick=()=>{m.close();window.Kiwi.handlers[button.dataset.catalogProfile]?.(button);});
    requestAnimationFrame(()=>wireDismiss(m?.el||topBackdrop()));
  }

  function renderMiniPriceChart(values) {
    const W = 600, H = 90, PAD = { l: 28, r: 8, t: 6, b: 16 };
    const innerW = W - PAD.l - PAD.r, innerH = H - PAD.t - PAD.b;
    const max = Math.max(...values), min = Math.min(...values);
    const range = max - min || 1;
    const labels = ['Déc', 'Jan', 'Fév', 'Mars', 'Avr', 'Mai'];
    const xAt = (i) => PAD.l + (i / (values.length - 1)) * innerW;
    const yAt = (v) => PAD.t + innerH - ((v - min) / range) * innerH * 0.85;
    const path = values.map((v, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i)} ${yAt(v)}`).join(' ');
    const points = values.map((v, i) => `<circle cx="${xAt(i)}" cy="${yAt(v)}" r="3" fill="var(--atlas)" />`).join('');
    const xLabels = labels.map((l, i) => `<text x="${xAt(i)}" y="${H - 4}" text-anchor="middle" font-size="9">${esc(l)}</text>`).join('');
    return `
      <svg class="st-md-mini-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">
        <path class="line" d="${path}" />
        ${points}
        <g class="axis">${xLabels}</g>
      </svg>
    `;
  }

  function openAddSupplier() { openSupplierForm(null); }

  function openEditSupplier(id) {
    const s = getSup().find(x => x.id === id);
    if (s) openSupplierForm(s);
  }

  function openSupplierForm(existing) {
    const isEdit = !!existing;
    const title = isEdit ? t('editSupTitle') : t('addSupTitle');
    const cta = isEdit ? t('editSupBtn') : t('addSupBtn');
    const catOptions = allCategories().map(c =>
      `<option value="${esc(c.id)}" ${existing?.category === c.id ? 'selected' : ''}>${esc(c.label)}</option>`
    ).join('');
    const m = window.Kiwi.modal({
      title,
      width: 600,
      body: `
        <div class="st-mb-row">
          <div class="st-mb-field">
            <label class="st-mb-label">${esc(t('supName'))}</label>
            <input class="st-mb-input" type="text" placeholder="Ex. Olives du Souss" value="${esc(existing?.name || '')}" data-stock-sup-name />
          </div>
          <div class="st-mb-field">
            <label class="st-mb-label">${esc(t('supCat'))}</label>
            <select class="st-mb-input" data-stock-sup-cat>${catOptions}</select>
          </div>
        </div>
        <div class="st-mb-row">
          <div class="st-mb-field">
            <label class="st-mb-label">${esc(t('supPhone'))}</label>
            <input class="st-mb-input mono" type="text" placeholder="+212 …" value="${esc(existing?.contact || '')}" data-stock-sup-phone />
          </div>
          <div class="st-mb-field">
            <label class="st-mb-label">${esc(t('supLoc'))}</label>
            <input class="st-mb-input" type="text" placeholder="Casablanca" value="${esc(existing?.location || '')}" data-stock-sup-loc />
          </div>
        </div>
        <div class="st-mb-row">
          <div class="st-mb-field">
            <label class="st-mb-label">${esc(t('supPay'))}</label>
            <select class="st-mb-input" data-stock-sup-pay>
              ${['Comptant','Net 7','Net 15','Net 30','Net 45'].map(p =>
                `<option ${existing?.paymentTerms === p ? 'selected' : ''}>${esc(p)}</option>`
              ).join('')}
            </select>
          </div>
          <div class="st-mb-field">
            <label class="st-mb-label">${esc(t('supDeliv'))}</label>
            <input class="st-mb-input" type="text" placeholder="hebdomadaire · mardi-vendredi…" value="${esc(existing?.deliverySchedule || '')}" data-stock-sup-deliv />
          </div>
        </div>
        <div class="st-mb-row">
          <div class="st-mb-field">
            <label class="st-mb-label">${esc(t('supRating'))}</label>
            <input class="st-mb-input mono" type="number" min="1" max="5" step="0.1" placeholder="·" value="${esc(existing?.rating != null ? existing.rating : '')}" data-stock-sup-rating />
          </div>
          <div class="st-mb-field">
            <label class="st-mb-label">${esc(t('supSpend'))}</label>
            <input class="st-mb-input mono" type="number" min="0" step="50" placeholder="0" value="${esc(existing?.monthlySpend ?? '')}" data-stock-sup-spend />
          </div>
        </div>
      `,
      foot: `<button class="st-btn" data-dismiss-modal>${esc(STR[lang()].btnCancel || 'Annuler')}</button><button class="st-btn primary" data-stock-sup-confirm>${esc(cta)}</button>`,
    });
    const scope = m?.el || topBackdrop();
    wireDismiss(scope);
    scope?.querySelector('[data-stock-sup-confirm]')?.addEventListener('click', () => {
      const name = (scope.querySelector('[data-stock-sup-name]')?.value || '').trim();
      if (!name) { scope.querySelector('[data-stock-sup-name]')?.focus(); return; }
      const category = scope.querySelector('[data-stock-sup-cat]')?.value || 'epicerie';
      const contact = (scope.querySelector('[data-stock-sup-phone]')?.value || '').trim();
      const location = (scope.querySelector('[data-stock-sup-loc]')?.value || '').trim();
      const paymentTerms = scope.querySelector('[data-stock-sup-pay]')?.value || 'Net 30';
      const deliverySchedule = (scope.querySelector('[data-stock-sup-deliv]')?.value || '·').trim();
      const ratingVal = (scope.querySelector('[data-stock-sup-rating]')?.value || '').trim();
      const ratingRaw = ratingVal ? parseFloat(ratingVal) : NaN;
      const rating = isNaN(ratingRaw) ? null : Math.min(5, Math.max(1, ratingRaw));
      const spendRaw = parseFloat(scope.querySelector('[data-stock-sup-spend]')?.value);
      const monthlySpend = isNaN(spendRaw) ? 0 : spendRaw;

      if (isEdit) {
        if (existing.retail && window.KiwiProcurement?.updateSupplier) {
          window.KiwiProcurement.updateSupplier(existing.id, {
            name, phone: contact, address: location, categories: category, paymentTerms,
            leadDays: parseInt(deliverySchedule, 10) || 0,
          });
          closeTopModal();
          window.Kiwi.toast(t('editSupToast', name), { type: 'success' });
          if (S.stPageActive) render();
          return;
        }
        if (existing.id.startsWith('usr-')) {
          const i = S.stUserSuppliers.findIndex(x => x.id === existing.id);
          if (i >= 0) { S.stUserSuppliers[i] = { ...S.stUserSuppliers[i], name, category, contact, location, paymentTerms, deliverySchedule, rating, monthlySpend }; stSaveOverlay(); }
        } else {
          stSupOverrides[existing.id] = { ...(stSupOverrides[existing.id] || {}), name, category, contact, location, paymentTerms, deliverySchedule, rating, monthlySpend };
          stSaveOverlay();
        }
        closeTopModal();
        window.Kiwi.toast(t('editSupToast', name) + stDemoNote(), { type: 'success' });
        if (S.stPageActive) render();
        return;
      }

      if (isRetailStock() && window.KiwiProcurement?.addSupplier) {
        window.KiwiProcurement.addSupplier({ name, phone: contact, address: location, categories: category, paymentTerms, leadDays: parseInt(deliverySchedule, 10) || 0 });
        closeTopModal();
        window.Kiwi.toast(t('addSupToast', name), { type: 'success' });
        if (S.stPageActive) render();
        return;
      }

      const sup = {
        id: 'usr-sup-' + Date.now().toString(36),
        name, location, category, contact,
        deliverySchedule,
        avgInvoice: monthlySpend > 0 ? Math.round(monthlySpend / 4) : 0,
        paymentTerms,
        rating,
        monthlySpend,
        priceChangeLast30d: 0,
      };
      S.stUserSuppliers.push(sup);
      stSaveOverlay();
      closeTopModal();
      window.Kiwi.toast(t('addSupToast', name) + stDemoNote(), { type: 'success' });
      if (S.stPageActive) render();
    });
  }

  function confirmDeleteSupplier(id) {
    const s = getSup().find(x => x.id === id);
    if (!s) return;
    const m = window.Kiwi.modal({
      title: t('deleteSupTitle'),
      width: 480,
      body: `<p style="margin:0; color:var(--n-700); line-height:1.55;">${esc(t('deleteSupBody', s.name))}</p>`,
      foot: `<button class="st-btn" data-dismiss-modal>${esc(STR[lang()].btnCancel || 'Annuler')}</button><button data-activation=write class="st-btn primary" style="background:#b32a2a; border-color:#9a1f1f;" data-stock-sup-delete-confirm>${esc(t('deleteSupBtn'))}</button>`,
    });
    const scope = m?.el || topBackdrop();
    wireDismiss(scope);
    scope?.querySelector('[data-stock-sup-delete-confirm]')?.addEventListener('click', () => {
      if (s.retail && window.KiwiProcurement?.updateSupplier) {
        window.KiwiProcurement.updateSupplier(s.id, { active: false });
        closeTopModal();
        window.Kiwi.toast(t('deleteSupToast', s.name), { type: 'info' });
        if (S.stPageActive) render();
        return;
      }
      if (s.id.startsWith('usr-')) {
        S.stUserSuppliers = S.stUserSuppliers.filter(x => x.id !== s.id);
      } else {
        stDeletedSups.add(s.id);
        stSaveOverlay();
      }
      closeTopModal();
      window.Kiwi.toast(t('deleteSupToast', s.name), { type: 'info' });
      if (S.stPageActive) render();
    });
  }

  function sendSuggestedOrder() {
    const btn = document.querySelector('[data-action="stock-send-suggested"]');
    if (btn) { btn.setAttribute('disabled', ''); btn.style.opacity = '0.65'; btn.innerHTML = 'Envoi en cours…'; }
    setTimeout(() => {
      window.Kiwi.toast('4 commandes envoyées · WhatsApp confirmé · 8 920 MAD', { type: 'success', duration: 4500 });
      if (btn) { btn.removeAttribute('disabled'); btn.style.opacity = '1'; btn.innerHTML = esc(t('btnSendSuggested')); }
    }, 1500);
  }

  return { computeRealSupplierPriceChanges, renderRealSupplierPriceChanges, renderSuppliers, supplierDate, supplierHistory, renderSupplierCard, renderSupRow, renderOrders, renderActiveOrders, renderHistoryTable, renderSuggestedOrder, openQuickOrder, openOrderPicker, recordQuickOrder, openSupplierProfile, renderMiniPriceChart, openAddSupplier, openEditSupplier, openSupplierForm, confirmDeleteSupplier, sendSuggestedOrder };
});
