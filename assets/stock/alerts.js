/* Stock alerts. Reads only the listed bridge dependencies and declared browser services. */
window.KiwiStockInternal.install('alerts', (S) => {
  'use strict';
  const { IGNORE_KEY, M86_COPY, TIER_LOW, actualLastDelivery, catLabel, closeTopModal, currentStockFor, currentVenueId, daysOfStock, esc, fmtDateShort, fmtMad, fmtUnit, getInv, isAlertIgnored, lang, stMarked86, stOverlayRaw, statusOf, svg, t, topBackdrop, wireDismiss } = S;

  function stockConfiguredSupplierName(value) {
    const name = String(value || '').trim();
    if (!name) return '';
    if (/^(?:fournisseur principal|primary supplier|supplier|nosupplier|no supplier|none|null|n\/a|-)$/i.test(name)) return '';
    return name;
  }

  function stockSupplierEvidence(it) {
    const supplier = stockConfiguredSupplierName(it?.supplier);
    if (supplier) return { kind: 'supplier', name: supplier };
    try {
      const lots = it?.id && window.KiwiInventoryConsumption?.deriveLots?.(it.id);
      const lot = (lots || []).find(l => Number(l?.remainingQty) > 0 && Number(l?.rank) < 999);
      if (lot) return { kind: 'lot', name: stockConfiguredSupplierName(lot.supplierName) };
    } catch (_) {}
    return null;
  }

  function stockAlertState(it, stock) {
    const s = Number(stock);
    const threshold = Number(it?.reorderLevel);
    const hasThreshold = Number.isFinite(threshold) && threshold > 0;
    const status = !Number.isFinite(s) || s <= 0
      ? 'out'
      : (hasThreshold && s < threshold ? 'low' : 'ok');
    return {
      status,
      threshold: hasThreshold ? threshold : null,
      supplierEvidence: status === 'low' ? stockSupplierEvidence(it) : null,
    };
  }

  function computeTier1LowAlerts(items) {
    if (!window.KiwiInventoryConsumption?.deriveLots) return [];
    const raw = stOverlayRaw();
    const subMap = new Map((raw.subcategories || []).map(s => [s.id, s]));
    const list = [];
    (items || []).forEach(it => {
      if (!it || !it.id) return;
      if (statusOf(it) === 'out' || statusOf(it) === 'low') return;
      const lots = window.KiwiInventoryConsumption.deriveLots(it.id) || [];
      if (!lots.length) return;
      const r1Lots = lots.filter(l => l.rank === 1 && l.remainingQty > 0);
      // Opening stock is rank 999 and is not a supplier tier. Without a real
      // rank-1 lot/card this path fabricated a "principal vs next lot"
      // alert for every newly-created item.
      const r1Qty = Math.round(r1Lots.reduce((sum, l) => sum + l.remainingQty, 0) * 1000) / 1000;
      const sub = subMap.get(it.id);
      const cards = sub && Array.isArray(sub.suppliers) ? sub.suppliers : [];
      const primaryCard = cards.find(c => c.rank === 1);
      const secondaryCard = cards.find(c => c.rank === 2);
      const secondaryLot = lots.find(l => l.rank > 1 && l.rank < 999 && l.remainingQty > 0);
      const primarySupplier = stockConfiguredSupplierName(primaryCard?.supplierName);
      const hasRankedSupplierLot = r1Lots.some(l => stockConfiguredSupplierName(l.supplierName));
      const secondarySupplier = stockConfiguredSupplierName(secondaryCard?.supplierName);
      if (!primarySupplier && !hasRankedSupplierLot) return;
      
      const threshold = (primaryCard && primaryCard.lowBuffer > 0)
        ? primaryCard.lowBuffer
        : Math.max(1, Math.round(((it.usageThisWeek || 0) / 7) * 3 * 10) / 10);
      
      if (r1Qty <= threshold && (secondaryLot || (secondarySupplier && secondaryCard.defaultPrice > (primaryCard ? primaryCard.defaultPrice : it.costPerUnit)))) {
        list.push(Object.assign({}, it, {
          alertKind: 'tierLow',
          r1Qty: r1Qty,
          t1Threshold: threshold,
          p1Cost: (primaryCard && primaryCard.defaultPrice != null) ? primaryCard.defaultPrice : it.costPerUnit,
          p2Cost: secondaryLot ? secondaryLot.unitCost : (secondaryCard ? secondaryCard.defaultPrice : null),
          p2SupName: secondaryLot ? (secondaryLot.supplierName || 'Fournisseur secondaire') : (secondaryCard ? secondaryCard.supplierName : 'Fournisseur secondaire'),
        }));
      }
    });
    return list;
  }

  function overviewAlertRows(items) {
    const rows = items || [];
    const out = rows.filter(it => statusOf(it) === 'out');
    const low = rows.filter(it => statusOf(it) === 'low');
    const tierLow = computeTier1LowAlerts(rows);
    const alerts = [
      ...out,
      ...low.filter(it => !isAlertIgnored(it.name)).sort((a, b) => (daysOfStock(a) ?? Number.MAX_SAFE_INTEGER) - (daysOfStock(b) ?? Number.MAX_SAFE_INTEGER)),
      ...tierLow,
    ].slice(0, 12);
    return { out, low, tierLow, alerts, totalAlertCount: out.length + low.length + tierLow.length };
  }

  function ignoredAlerts() {
    try {
      const raw = JSON.parse(localStorage.getItem(IGNORE_KEY()) || '{}');
      const now = Date.now(), live = {};
      Object.keys(raw).forEach((k) => { if (+raw[k] > now) live[k] = +raw[k]; });
      return live;
    } catch (_) { return {}; }
  }

  function ignoreAlert(name) {
    const live = ignoredAlerts();
    live[String(name || '')] = Date.now() + 24 * 3600000;
    try { localStorage.setItem(IGNORE_KEY(), JSON.stringify(live)); } catch (_) {}
  }

  function openMark86(ingredientName) {
    const L = M86_COPY[lang()] || M86_COPY.fr;
    const vid = currentVenueId();
    const inv = getInv().find((x) => x.name === ingredientName);
    const dishes = (window.KiwiMenuStore?.items?.(vid) || []).filter((d) => d && d.id && !d.archived && !d.formulaOnly && d.avail !== false);
    if (!dishes.length) { window.Kiwi.toast(L.none, { type: 'info', desc: L.noneDesc }); return; }
    const norm = (v) => String(v || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    const target = norm(ingredientName);
    const uses = new Set();
    (window.KiwiRestaurantRecipes?.all?.(vid) || []).forEach((r) => {
      if ((r.ingredients || []).some((ing) => (inv && ing.stockId && String(ing.stockId) === String(inv.id)) || (target && norm(ing.name) === target))) uses.add(String(r.itemId));
    });
    const sorted = dishes.slice().sort((a, b) => (uses.has(String(b.id)) - uses.has(String(a.id))) || String(a.name).localeCompare(String(b.name)));
    const m = window.Kiwi.modal({
      title: L.title(ingredientName), width: 520,
      body: `<p style="margin:0 0 12px; font-size:13px; color:var(--n-500); line-height:1.5;">${esc(L.intro)}</p>
        <div style="display:grid; gap:6px; max-height:52vh; overflow:auto;">${sorted.map((d) => `
          <label style="display:flex; align-items:center; gap:10px; padding:9px 12px; border:1px solid var(--n-200); border-radius:10px; cursor:pointer;">
            <input type="checkbox" data-m86-dish="${esc(d.id)}" ${uses.has(String(d.id)) ? 'checked' : ''} />
            <span style="flex:1; font-size:13.5px;">${esc(d.name || d.id)}</span>
            ${uses.has(String(d.id)) ? `<span style="font-size:11px; color:var(--n-500);">${esc(L.fromRecipe)}</span>` : ''}
          </label>`).join('')}</div>`,
      foot: `<button class="st-btn" data-dismiss-modal>${esc(L.cancel)}</button><button class="st-btn primary" data-m86-apply>${esc(L.apply)}</button>`,
    });
    requestAnimationFrame(() => {
      const scope = m?.el || topBackdrop();
      wireDismiss(scope);
      scope?.querySelector('[data-m86-apply]')?.addEventListener('click', async (e) => {
        const ids = [...scope.querySelectorAll('[data-m86-dish]:checked')].map((x) => x.dataset.m86Dish);
        if (!ids.length) { window.Kiwi.toast(L.pick, { type: 'info' }); return; }
        let slug = '';
        try { slug = window.KiwiCloudDoc?.currentSlug?.() || ''; } catch (_) {}
        const real = !!(window.KiwiEnv?.isReal?.() || window.KiwiVenue?.isCustom?.());
        if (!slug || !real) { stMarked86.add(ingredientName); closeTopModal(); window.Kiwi.toast(L.done(ids.length), { type: 'info', desc: L.demo }); return; }
        e.currentTarget.disabled = true;
        const results = await Promise.all(ids.map((itemId) => fetch('/api/menu/availability', {
          method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ merchant: slug, itemId, available: false }),
        }).then((r) => r.json().then((j) => !!(r.ok && j && j.ok)), () => false).catch(() => false)));
        const ok = results.filter(Boolean).length, ko = results.length - ok;
        closeTopModal();
        if (ok) {
          stMarked86.add(ingredientName);
          try { document.dispatchEvent(new CustomEvent('kiwi-menu-availability', { detail: { itemIds: ids, available: false } })); } catch (_) {}
        }
        if (!ok) window.Kiwi.toast(L.fail, { type: 'warning', desc: L.failDesc });
        else if (ko) window.Kiwi.toast(L.partial(ok, ko), { type: 'warning', desc: L.failDesc });
        else window.Kiwi.toast(L.done(ok), { type: 'success', desc: L.doneDesc });
      });
    });
  }

  function renderAlertCard(it) {
    if (it.alertKind === 'tierLow') {
      const priceDiff = it.p2Cost != null ? (it.p2Cost - it.p1Cost) : null;
      const L = TIER_LOW[lang()] || TIER_LOW.fr;
      return `
        <div class="st-alert tier-low">
          <div class="st-alert-ico" style="color:var(--warning);">${svg('alertTriangle', 18)}</div>
          <div class="st-alert-body">
            <div class="st-alert-top">
              <span class="st-alert-name">${esc(it.name)}</span>
              <span class="st-alert-cat">${esc(catLabel(it.category))}</span>
              <span class="st-alert-status low">${esc(L.status(fmtUnit(it.r1Qty, it.unit)))}</span>
            </div>
            <div class="st-alert-meta">
              ${esc(L.main)} : ${esc(fmtMad(it.p1Cost))}/${esc(it.unit)}${it.p2Cost != null ? ` · ${esc(L.next)} : ${esc(it.p2SupName)} (${esc(fmtMad(it.p2Cost))}/${esc(it.unit)}${priceDiff > 0 ? ` +${esc(fmtMad(priceDiff))}` : ''})` : ''}
            </div>
            <div class="st-alert-impact">
              ${esc(L.buffer)} : <b>${esc(fmtUnit(it.t1Threshold, it.unit))}</b> (${esc(L.basis)}) · ${esc(L.trans)}
            </div>
          </div>
          <div class="st-alert-acts">
            <button data-activation=write class="st-btn primary" type="button" data-action="stock-reorder" data-item-id="${esc(it.id)}">${esc(L.order)}</button>
          </div>
        </div>
      `;
    }
    const st = statusOf(it);
    const isOut = st === 'out';
    const days = isOut ? 0 : daysOfStock(it);
    const cur = currentStockFor(it);
    /* Une rupture se dit par ce qu'elle bloque, pas par un chiffre inventé :
     * l'ancien « manque à gagner » multipliait le coût d'achat par 3,2, une
     * marge supposée. On nomme les plats dont la fiche technique utilise
     * l'article, et la consommation réelle de la semaine quand elle existe. */
    const blocked = isOut ? dishesUsing(it) : null;
    const dailyUse = +it.usageThisWeek > 0 ? it.usageThisWeek / 7 : 0;
    const parPct = it.parLevel > 0 ? (cur / it.parLevel) * 100 : 0;
    const state = stockAlertState(it, cur);
    const supplierMeta = state.supplierEvidence
      ? `${esc(t('supplier'))}${lang() === 'fr' ? ' : ' : ': '}${esc(state.supplierEvidence.name || t('lotRecorded'))}`
      : '';
    const deliveryDate = actualLastDelivery(it);
    const deliveryMeta = deliveryDate ? `${esc(t('lastDeliv'))} : ${esc(fmtDateShort(deliveryDate))}` : '';
    const alertMeta = [deliveryMeta, supplierMeta].filter(Boolean).join('<span class="sep">·</span>');
    const lowLabel = days == null ? t('statusLow') : `${t('statusLow')} · ${t('daysLeft', days)}`;

    return `
      <div class="st-alert ${isOut ? 'out' : ''}">
        <div class="st-alert-ico">${svg(isOut ? 'alertCircle' : 'alertTriangle', 18)}</div>
        <div class="st-alert-body">
          <div class="st-alert-top">
            <span class="st-alert-name">${esc(it.name)}</span>
            <span class="st-alert-cat">${esc(catLabel(it.category))}</span>
            <span class="st-alert-status ${isOut ? 'out' : 'low'}">${esc(isOut ? t('statusOut') : lowLabel)}</span>
          </div>
          ${alertMeta ? `<div class="st-alert-meta">${alertMeta}</div>` : ''}
          ${isOut
            ? `<div class="st-alert-impact">${[blocked == null ? '' : blocked.length ? `<b>${esc(t('impactBlocks', blocked.length, blocked.slice(0, 3).join(', ') + (blocked.length > 3 ? '…' : '')))}</b>` : esc(t('impactNone')), dailyUse ? esc(t('impactUsage', fmtUnit(dailyUse, it.unit))) : ''].filter(Boolean).join('<span class="sep">·</span>')}</div>`
            : `<div class="st-alert-impact">${esc(t('level'))} : <b>${esc(fmtUnit(cur, it.unit))}</b> · ${esc(t('par'))} : <b>${esc(fmtUnit(it.parLevel, it.unit))}</b></div>
               <div class="st-alert-bar-wrap"><div class="st-alert-bar"><div class="st-alert-bar-fill" data-stock-bar="${Math.min(100, parPct)}"></div></div></div>`}
        </div>
        <div class="st-alert-acts">
          ${isOut
            ? `<button data-activation=write class="st-btn primary" type="button" data-action="stock-urgent-order" data-item-id="${esc(it.id)}">${esc(t('btnUrgentOrder'))}</button>
               <button class="st-btn" type="button" data-action="stock-mark-86" data-item-name="${esc(it.name)}">${esc(t('btnMark86'))}</button>`
            : `<button data-activation=write class="st-btn primary" type="button" data-action="stock-reorder" data-item-id="${esc(it.id)}">${esc(t('btnReorder'))}</button>
               <button class="st-btn" type="button" data-action="stock-ignore-24h" data-item-name="${esc(it.name)}">${esc(t('btnIgnore'))}</button>`}
        </div>
      </div>
    `;
  }

  function dishesUsing(it) {
    try {
      const R = window.KiwiRestaurantRecipes;
      if (!R?.all || !R?.stockFor || !it?.id) return null;
      const recipes = R.all() || [];
      if (!recipes.length) return null; // pas de fiches techniques : rien à affirmer
      const names = [];
      recipes.forEach((r) => {
        if ((r.ingredients || []).some((line) => { const s = R.stockFor(line); return s && String(s.id) === String(it.id); })) names.push(r.itemName);
      });
      return [...new Set(names.filter(Boolean))];
    } catch (_) { return null; }
  }

  return { stockConfiguredSupplierName, stockSupplierEvidence, stockAlertState, computeTier1LowAlerts, overviewAlertRows, ignoredAlerts, ignoreAlert, openMark86, renderAlertCard, dishesUsing };
});
