/* Stock · catalog. Fonctions privées, installées au premier usage. */
window.KiwiStockInternal.install('catalog', (S) => {
  'use strict';
  const { STR, allCategories, allergenKeys, catLabel, countStock, currentStockFor, daysOfStock, esc, fmtMad, fmtPct, fmtUnit, getInv, getSup, lang, moveStock, nutritionKeys, openMark86, openQuickOrder, render, retailCatalog, retailSetProductStock, stCategoryOverrides, stDeletedCategories, stDeletedItems, stDemoNote, stItemOverrides, stOverlayRaw, stOverlayScope, stSaveOverlay, stShowReal, stStockOverrides, statusOf, stockBusinessDate, stockLocationId, stockUnit, stockUnitOptions, svg, t, theoreticalUsageFor, variance } = S;

  function movementLabel(reason) {
    return ({
      opening: 'Solde initial', receipt: 'Réception', 'supplier-return': 'Retour fournisseur',
      sale: 'Vente', 'sale-reversal': 'Annulation de vente', 'production-input': 'Matière consommée',
      'production-output': 'Production', 'transfer-out': 'Transfert sortant', 'transfer-in': 'Transfert entrant',
      loss: 'Perte', expiry: 'Périmé', gift: 'Offert', 'staff-meal': 'Consommation équipe',
      count: 'Écart de comptage', return: 'Retour client', manual: 'Ajustement manuel',
    })[reason] || reason || 'Mouvement';
  }

  function itemHistory(it) {
    try { return window.KiwiInventory?.history?.(it.id) || []; } catch (_) { return []; }
  }

  function renderRealItemMovementSummary(it) {
    const rows = itemHistory(it);
    const received = rows.filter(r => r.reason === 'receipt').reduce((n, r) => n + Math.max(0, +r.qty || 0), 0);
    const consumed = rows.filter(r => (+r.qty || 0) < 0).reduce((n, r) => n + Math.abs(+r.qty || 0), 0);
    return `
      <div class="st-md-col-t">Activité enregistrée</div>
      <div class="st-md-pair"><span class="l">Entrées fournisseur</span><span class="v">${esc(fmtUnit(received, it.unit))}</span></div>
      <div class="st-md-pair"><span class="l">Sorties enregistrées</span><span class="v">${esc(fmtUnit(consumed, it.unit))}</span></div>
      <div class="st-md-pair"><span class="l">Mouvements</span><span class="v">${rows.length}</span></div>
      <div class="st-notice ${rows.length ? 'ok' : 'warn'}" style="margin-top:12px;">
        ${svg(rows.length ? 'checkCircle' : 'alertTriangle', 14)}
        <div>${rows.length ? 'Le stock affiché est reconstruit depuis le registre de mouvements.' : 'Aucun mouvement n’a encore été enregistré pour cet article.'}</div>
      </div>`;
  }

  function swapSupplierRanks(itemId) {
    if (!itemId) return;
    const raw = stOverlayRaw();
    const sub = (raw.subcategories || []).find(s => s.id === itemId);
    if (!sub || !Array.isArray(sub.suppliers) || sub.suppliers.length < 2) return;
    const s0 = sub.suppliers[0];
    const s1 = sub.suppliers[1];
    s0.rank = 2;
    s1.rank = 1;
    sub.suppliers = [s1, s0, ...sub.suppliers.slice(2)];
    sub.updatedAt = Date.now();
    stItemOverrides[itemId] = Object.assign({}, stItemOverrides[itemId] || {}, {
      suppliers: sub.suppliers,
      supplier: s1.supplierName,
      updatedAt: Date.now(),
    });
    stSaveOverlay();
    window.Kiwi?.toast?.(`Fournisseur principal défini sur ${s1.supplierName} (s'applique aux prochaines livraisons)`, { type: 'success' });
    closeTopModal();
    if (S.stPageActive) render();
  }

  function renderRealItemHistory(it) {
    const raw = stOverlayRaw();
    const sub = (raw.subcategories || []).find(s => s.id === it.id);
    const cards = sub && Array.isArray(sub.suppliers) ? sub.suppliers : [];
    let advisoryHtml = '';
    if (cards.length >= 2) {
      const c1 = cards[0];
      const c2 = cards[1];
      if (c2.defaultPrice != null && c1.defaultPrice != null && c2.defaultPrice < c1.defaultPrice) {
        advisoryHtml = `
          <div class="st-notice info" style="margin:10px 0; display:flex; align-items:flex-start; gap:8px;">
            ${svg('info', 16)}
            <div style="flex:1;">
              <div><b>Opportunité tarifaire :</b> ${esc(c2.supplierName)} propose <b>${esc(fmtMad(c2.defaultPrice))}/${esc(sub.unit)}</b> (vs ${esc(fmtMad(c1.defaultPrice))}/${esc(sub.unit)} chez ${esc(c1.supplierName)}).</div>
              <button class="st-btn small" type="button" data-stock-swap-ranks data-item-id="${esc(it.id)}" style="margin-top:6px;">
                Définir en fournisseur principal (s'applique aux prochaines livraisons)
              </button>
            </div>
          </div>
        `;
      }
    }
    const rows = itemHistory(it).slice(0, 12);
    return `
      ${advisoryHtml}
      <div class="st-md-section">
        <div class="st-md-section-t">${esc(t('mItSuppliersT'))}</div>
        <div class="st-md-list">
          ${cards.length ? cards.map(c => `
            <div class="st-md-list-row">
              <div>
                <span class="n">${esc(c.supplierName)}</span>
                <span class="${c.rank === 1 ? 'status-ok' : 'status-warn'}" style="margin-left:8px; font-size:11px; padding:2px 6px; border-radius:4px;">
                  ${c.rank === 1 ? esc(t('supRankPrincipal')) : `${esc(t('supRankBackup'))} ${c.rank - 1}`}
                </span>
              </div>
              <div class="v">${c.defaultPrice != null ? `${esc(fmtMad(c.defaultPrice))} / ${esc(sub?.unit || it.unit || 'unité')}` : '·'}</div>
            </div>`).join('') : `<div style="padding:9px 4px; font-size:12.5px; color:var(--n-500);">${esc(t('mItNoSuppliers'))}</div>`}
        </div>
        <button data-activation=write class="st-btn small" type="button" data-stock-add-backup-supplier data-item-id="${esc(it.id)}" style="margin-top:8px;">
          ${svg('plus', 12)}<span>${esc(t('mItAddBackupSup'))}</span>
        </button>
      </div>
      <div class="st-md-section">
        <div class="st-md-section-t">Historique des mouvements</div>
        <div class="st-md-list">
          ${rows.length ? rows.map(r => `
            <div class="st-md-list-row">
              <div><span class="n">${esc(movementLabel(r.reason))}</span><span class="d" style="margin-left:6px;">${esc(r.note || r.refId || '')}</span></div>
              <div class="v" style="color:${(+r.qty || 0) >= 0 ? 'var(--atlas)' : 'var(--danger)'};">${(+r.qty || 0) > 0 ? '+' : ''}${esc(fmtUnit(+r.qty || 0, it.unit))}</div>
              <div class="d">${esc(new Date(r.occurredTs || Date.now()).toLocaleDateString(lang() === 'ar' ? 'ar-MA' : lang() === 'en' ? 'en-GB' : 'fr-MA'))}</div>
            </div>`).join('') : `<div style="padding:12px 4px; font-size:12.5px; color:var(--n-500);">Aucun mouvement enregistré.</div>`}
        </div>
      </div>
      ${(function(){
        const wasteMoves = rows.filter(r => r && (r.refType === 'waste' || ['loss', 'expiry', 'gift', 'staff-meal'].includes(r.reason)));
        if (!wasteMoves.length) return '';
        return `
          <div class="st-md-section" style="margin-top:16px;">
            <div class="st-md-section-t" style="display:flex;justify-content:space-between;align-items:center;">
              <span>Pertes &amp; sorties exceptionnelles</span>
              <span style="font-size:11.5px;color:#b91c1c;font-weight:600;">${wasteMoves.length} déclaration${wasteMoves.length > 1 ? 's' : ''}</span>
            </div>
            <div class="st-md-list">
              ${wasteMoves.map(r => {
                const d = new Date(r.occurredTs || Date.now());
                const dateStr = d.toLocaleDateString('fr-FR') + ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
                const fine = (r.meta && r.meta.wasteReason) || r.reason;
                const reasonLabel = (function(why){
                  if (why === 'perime' || r.reason === 'expiry') return 'Périmé';
                  if (why === 'casse') return 'Casse';
                  if (why === 'avarie') return 'Avarié';
                  if (why === 'offert' || r.reason === 'gift') return 'Offert';
                  if (why === 'repas-equipe' || r.reason === 'staff-meal') return 'Repas équipe';
                  return 'Perte';
                })(fine);
                const isReversal = !!r.reversalOf;
                return `
                  <div class="st-md-list-row" style="${isReversal ? 'opacity:0.5;' : ''}">
                    <div>
                      <span class="n" style="color:#b91c1c;">${esc(reasonLabel)}</span>
                      <span class="d" style="margin-left:6px;">${esc(r.actor || '·')} ${r.note ? `· ${esc(r.note)}` : ''}</span>
                    </div>
                    <div class="v" style="color:#b91c1c;font-weight:600;">−${Math.abs(+r.qty || 0)} ${esc(it.unit)}</div>
                    <div class="d" style="display:flex;align-items:center;gap:6px;">
                      <span>${dateStr}</span>
                      ${stShowReal() && !isReversal ? `
                        <button class="st-btn small" type="button" data-action="stock-cancel-waste" data-movement-id="${esc(r.id)}" title="Annuler cette perte" style="color:#b91c1c;padding:1px 6px;font-size:11px;">
                          Annuler
                        </button>
                      ` : ''}
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        `;
      })()}`;
  }

  function openAddBackupSupplier(itemId) {
    const it = getInv().find(x => x.id === itemId);
    if (!it) return;
    const raw = stOverlayRaw();
    const sub = (raw.subcategories || []).find(s => s.id === itemId);
    const unit = (sub && sub.unit) || it.unit || 'unité';

    const m = window.Kiwi.modal({
      title: t('addBackupSupTitle'),
      desc: `${esc(it.name)} · ${esc(catLabel(it.category))}`,
      width: 520,
      body: `
        <div class="st-mb-field" style="margin-bottom:12px;">
          <label class="st-mb-label">${esc(t('addBackupSupLabel'))}</label>
          <select class="st-mb-input" data-stock-backup-sup>
            ${renderSupOptions()}
            <option value="__new__">${esc(t('addBackupSupOptNew'))}</option>
          </select>
          <div data-stock-newsup-wrap style="display:none; margin-top:8px;">
            <input class="st-mb-input" type="text" placeholder="${esc(t('addBackupSupNewName'))}" data-stock-newsup-name />
          </div>
        </div>
        <div class="st-mb-field">
          <label class="st-mb-label">${esc(t('addBackupSupPrice'))} (MAD / ${esc(unit)})</label>
          <input class="st-mb-input mono" type="number" min="0" step="0.01" placeholder="0.00" data-stock-backup-price />
        </div>
        <div class="st-notice ok" style="margin-top:12px;">
          ${svg('checkCircle', 14)}
          <div>${esc(t('addBackupSupHelp'))}</div>
        </div>
      `,
      foot: `<button class="st-btn" data-dismiss-modal>${esc(STR[lang()]?.btnCancel || 'Annuler')}</button><button data-activation=write class="st-btn primary" data-stock-backup-save>${esc(t('addBackupSupConfirm'))}</button>`,
    });

    const scope = m?.el || topBackdrop();
    wireDismiss(scope);

    const supSel = scope?.querySelector('[data-stock-backup-sup]');
    const newsupWrap = scope?.querySelector('[data-stock-newsup-wrap]');
    const newsupInput = scope?.querySelector('[data-stock-newsup-name]');

    supSel?.addEventListener('change', () => {
      if (supSel.value === '__new__') {
        if (newsupWrap) newsupWrap.style.display = '';
        newsupInput?.focus();
      } else {
        if (newsupWrap) newsupWrap.style.display = 'none';
      }
    });

    scope?.querySelector('[data-stock-backup-save]')?.addEventListener('click', () => {
      let rawSup = '';
      if (supSel?.value === '__new__') {
        rawSup = (newsupInput?.value || '').trim();
        if (!rawSup) { newsupInput?.focus(); return; }
      } else {
        rawSup = (supSel?.value || '').trim();
      }
      if (!rawSup) return;

      const foundSup = getSup().find(s => s.name === rawSup || `${s.name} · ${s.location || ''}`.trim().replace(/ ·\s*$/, '') === rawSup);
      const supplierName = foundSup ? foundSup.name : rawSup;

      if (window.KiwiProcurement?.addSupplier) {
        const known = window.KiwiProcurement.doc?.()?.suppliers?.find(s => String(s.name || '').trim().toLowerCase() === supplierName.toLowerCase());
        if (!known) {
          try { window.KiwiProcurement.addSupplier({ name: supplierName }); } catch (_) {}
        }
      }

      const priceVal = parseFloat(scope.querySelector('[data-stock-backup-price]')?.value);
      const defaultPrice = (Number.isFinite(priceVal) && priceVal >= 0) ? Math.round(priceVal * 100) / 100 : (+it.costPerUnit || 0);

      const rawDoc = stOverlayRaw();
      let subcat = (rawDoc.subcategories || []).find(s => s.id === itemId);
      if (!subcat) {
        subcat = {
          id: itemId,
          categoryId: it.category || 'legumes',
          name: it.name,
          unit: unit,
          defaultCost: +it.costPerUnit || 0,
          suppliers: [],
          currentStock: currentStockFor(it),
          parLevel: it.parLevel,
          reorderLevel: it.reorderLevel,
          usageThisWeek: it.usageThisWeek || 0,
          theoreticalUsage: it.theoreticalUsage || 0,
          updatedAt: Date.now(),
        };
        if (!Array.isArray(rawDoc.subcategories)) rawDoc.subcategories = [];
        rawDoc.subcategories.push(subcat);
      }

      const cards = Array.isArray(subcat.suppliers) ? subcat.suppliers.slice() : [];
      if (!cards.length && it.supplier) {
        cards.push({
          id: 'sup-' + Date.now().toString(36) + '-main',
          supplierName: it.supplier,
          defaultPrice: +it.costPerUnit || 0,
          purchaseUnit: unit,
          factor: 1,
          rank: 1,
        });
      }

      const normName = supplierName.trim().toLowerCase();
      const existingCard = cards.find(s => String(s.supplierName || '').trim().toLowerCase() === normName);

      let toastMsg = '';
      if (existingCard) {
        existingCard.defaultPrice = defaultPrice;
        toastMsg = t('backupSupUpdatedToast', existingCard.supplierName, defaultPrice);
      } else {
        const rank = cards.length + 1;
        const newCard = {
          id: 'sup-' + Date.now().toString(36),
          supplierName: supplierName,
          defaultPrice: defaultPrice,
          purchaseUnit: unit,
          factor: 1,
          rank: rank,
        };
        cards.push(newCard);
        toastMsg = t('backupSupAddedToast', supplierName);
      }

      subcat.suppliers = cards;
      subcat.updatedAt = Date.now();

      stItemOverrides[itemId] = Object.assign({}, stItemOverrides[itemId] || {}, {
        suppliers: cards,
        updatedAt: Date.now(),
      });

      stSaveOverlay();
      closeTopModal();
      window.Kiwi?.toast?.(toastMsg, { type: 'success' });
      if (S.stPageActive) render();
    });
  }

  function openItemMovement(itemId) {
    const it = getInv().find(x => x.id === itemId); if (!it) return;
    const m = window.Kiwi.modal({
      title: `Mouvement · ${it.name}`,
      desc: `Stock actuel : ${esc(fmtUnit(currentStockFor(it), it.unit))}`,
      width: 560,
      body: `
        <div class="st-mb-row two">
          <div class="st-mb-field"><label class="st-mb-label">Motif</label>
            <select class="st-mb-input" data-stock-move-reason>
              <option value="receipt">Réception fournisseur</option>
              <option value="return">Retour client</option>
              <option value="loss">Perte / casse</option>
              <option value="expiry">Périmé</option>
              <option value="gift">Offert</option>
              <option value="staff-meal">Consommation équipe</option>
              <option value="count">Comptage physique</option>
              <option value="manual">Correction manuelle</option>
            </select>
          </div>
          <div class="st-mb-field"><label class="st-mb-label" data-stock-move-qty-label>Quantité</label><input class="st-mb-input mono" data-stock-move-qty type="number" min="0" step="0.001" placeholder="0" /></div>
        </div>
        <div class="st-mb-field"><label class="st-mb-label">Référence / note</label><input class="st-mb-input" data-stock-move-note placeholder="Motif, document ou responsable" /></div>
        <div class="st-mb-field" data-stock-move-dlc-wrap><label class="st-mb-label">DLC / DDM (optionnel)</label><input class="st-mb-input mono" data-stock-move-dlc type="date" /></div>
        <div class="st-notice ok" data-stock-move-help>${svg('checkCircle', 14)}<div>Une entrée augmente le stock. Le registre conserve la trace de l’opération.</div></div>`,
      foot: `<button class="st-btn" data-dismiss-modal>Annuler</button><button data-activation=write class="st-btn primary" data-stock-move-save>Enregistrer</button>`,
    });
    const scope = m?.el || topBackdrop();
    const reason = scope?.querySelector('[data-stock-move-reason]');
    const label = scope?.querySelector('[data-stock-move-qty-label]');
    const help = scope?.querySelector('[data-stock-move-help] div');
    const dlcWrap = scope?.querySelector('[data-stock-move-dlc-wrap]');
    const updateHelp = () => {
      const isCount = reason?.value === 'count';
      if (dlcWrap) dlcWrap.style.display = reason?.value === 'receipt' ? '' : 'none';
      if (label) label.textContent = isCount ? `Quantité réellement comptée (${it.unit})` : `Quantité (${it.unit})`;
      if (help) help.textContent = isCount
        ? 'Kiwi calcule et enregistre uniquement l’écart entre le stock théorique et le comptage.'
        : ['receipt', 'return'].includes(reason?.value) ? 'Cette entrée augmente le stock et reste traçable.' : 'Cette sortie diminue le stock et reste traçable.';
    };
    reason?.addEventListener('change', updateHelp); updateHelp();
    scope?.querySelector('[data-stock-move-save]')?.addEventListener('click', () => {
      const value = Math.max(0, +(scope.querySelector('[data-stock-move-qty]')?.value || 0));
      const why = reason?.value || 'manual';
      const note = scope.querySelector('[data-stock-move-note]')?.value.trim() || '';
      if (!(value >= 0) || (why !== 'count' && value <= 0)) {
        window.Kiwi.toast('Indiquez une quantité valide.', { type: 'warning' }); return;
      }
      const ref = `manual-${Date.now().toString(36)}`;
      if (why === 'count') countStock(it, value, ref);
      else {
        const dlc = why === 'receipt' ? (scope.querySelector('[data-stock-move-dlc]')?.value || '') : '';
        moveStock(it, ['receipt', 'return'].includes(why) ? value : -value, why, 'manual', ref, note, null,
          dlc ? { expiresAt: new Date(dlc + 'T23:59:59').getTime() } : null);
      }
      closeTopModal(); window.Kiwi.toast('Mouvement de stock enregistré.', { type: 'success' });
      if (S.stPageActive) render();
    });
    wireDismiss(scope);
  }

  function openItemDetail(itemId) {
    const it = getInv().find(x => x.id === itemId);
    if (!it) return;
    const cur = currentStockFor(it);
    const st = statusOf(it);
    const v = variance(it);
    const days = daysOfStock(it);
    const altSups = getSup().filter(s => s.category === it.category && !it.supplier.toLowerCase().includes(s.name.toLowerCase())).slice(0, 3);

    const m = window.Kiwi.modal({
      title: it.name,
      desc: `${esc(catLabel(it.category))} · ${st === 'ok' ? t('stOk') : st === 'low' ? t('stLow') : t('stOut')}`,
      width: 720,
      body: `
        <div class="st-md-2col">
          <div>
            <div class="st-md-col-t">État actuel</div>
            <div class="st-md-pair"><span class="l">${esc(t('mItStockActual'))}</span><span class="v">${esc(fmtUnit(cur, it.unit))}</span></div>
            <div class="st-md-pair"><span class="l">${esc(t('mItParR'))}</span><span class="v">${esc(fmtUnit(it.parLevel, it.unit))}</span></div>
            <div class="st-md-pair"><span class="l">${esc(t('mItReorderR'))}</span><span class="v">${esc(fmtUnit(it.reorderLevel, it.unit))}</span></div>
            <div class="st-md-pair"><span class="l">${esc(t('mItValue'))}</span><span class="v">${esc(fmtMad(cur * it.costPerUnit))}</span></div>
            <div class="st-md-pair"><span class="l">${esc(t('mItCost'))}</span><span class="v">${esc(fmtMad(it.costPerUnit))} / ${esc(it.unit)}</span></div>
            <div class="st-md-pair"><span class="l">${esc(t('mItVarW'))}</span><span class="v" style="color:var(--${Math.abs(v) <= 5 ? 'n-600' : Math.abs(v) <= 15 ? 'warning' : 'danger'});">${esc(fmtPct(v))}</span></div>
            <div class="st-md-pair"><span class="l">${esc(t('mItDaysL'))}</span><span class="v">${days >= 999 ? '·' : Math.round(days) + ' j'}</span></div>
          </div>
          <div>
            ${stShowReal() ? renderRealItemMovementSummary(it) : `
              <div class="st-md-col-t">${esc(t('mItUsageT'))}</div>
              ${renderItemUsageChart(it)}
              <div style="display:flex; gap:14px; margin-top:8px; font-size:11.5px; color:var(--n-500);">
                <span style="display:inline-flex; align-items:center; gap:6px;"><span style="display:inline-block; width:14px; height:2px; background:var(--atlas);"></span>${esc(t('mItUsageL'))}</span>
                <span style="display:inline-flex; align-items:center; gap:6px;"><span style="display:inline-block; width:14px; height:2px; background:var(--n-400); border-top:1.5px dashed var(--n-400);"></span>${esc(t('mItUsageTheo'))}</span>
              </div>`}
          </div>
        </div>
        ${stShowReal() ? renderRealItemHistory(it) : `<div class="st-md-section">
          <div class="st-md-section-t">${esc(t('mItPricesT'))}</div>
          <div class="st-md-list">
            ${[0.92, 0.95, 0.97, 1.0, 1.02].map((m, i) => `
              <div class="st-md-list-row">
                <div><span class="d">${esc(['Janv','Févr','Mars','Avr','Mai'][i])}</span></div>
                <div class="v">${esc(fmtMad(it.costPerUnit * m))} / ${esc(it.unit)}</div>
                <div class="${m > 1 ? 'status-warn' : m < 1 ? 'status-ok' : 'status-bad'}" style="font-size:11px;">${fmtPct((m - 1) * 100, 1)}</div>
              </div>
            `).join('')}
          </div>
        </div>
        <div class="st-md-section">
          <div class="st-md-section-t">${esc(t('mItAltT'))}</div>
          <div class="st-md-list">
            ${altSups.length > 0 ? altSups.map(s => `
              <div class="st-md-list-row">
                <div><span class="n">${esc(s.name)}</span> <span class="d" style="margin-left:6px;">${esc(s.location)}</span></div>
                <div class="v">${esc(fmtMad(it.costPerUnit * (0.92 + Math.random() * 0.15)))} / ${esc(it.unit)}</div>
                <div style="font-size:11px; color:var(--n-500);">★ ${s.rating.toFixed(1)}</div>
              </div>
            `).join('') : `<div style="padding:9px 4px; font-size:12.5px; color:var(--n-500);">Aucun fournisseur alternatif identifié dans cette catégorie.</div>`}
          </div>
        </div>`}
      `,
      foot: `
        <button class="st-btn" data-stock-mark-86 data-item-name="${esc(it.name)}">${esc(t('mItMark'))}</button>
        ${stShowReal() ? `<button class="st-btn" data-stock-detail-move data-item-id="${esc(it.id)}">${svg('swap', 12)}<span>Mouvement</span></button>` : ''}
        <button data-activation=write class="st-btn" data-stock-detail-edit data-item-id="${esc(it.id)}">${svg('edit', 12)}<span>${esc(t('mItEdit'))}</span></button>
        <button data-activation=write class="st-btn" data-stock-detail-delete data-item-id="${esc(it.id)}" style="color:#9a1f1f; border-color:rgba(154,31,31,0.35);">${esc(t('mItDelete'))}</button>
        <button class="st-btn" data-dismiss-modal>${esc(t('mItClose'))}</button>
        <button data-activation=write class="st-btn primary" data-stock-reorder data-item-id="${esc(it.id)}">${esc(t('mItOrder'))}</button>
      `,
    });
    const scope = m?.el || topBackdrop();
    scope?.querySelector('[data-stock-mark-86]')?.addEventListener('click', (e) => {
      const name = e.currentTarget.dataset.itemName;
      closeTopModal();
      openMark86(name);
    });
    scope?.querySelector('[data-stock-reorder]')?.addEventListener('click', (e) => {
      closeTopModal();
      openQuickOrder(e.currentTarget.dataset.itemId);
    });
    scope?.querySelector('[data-stock-detail-edit]')?.addEventListener('click', (e) => {
      const id = e.currentTarget.dataset.itemId;
      closeTopModal();
      openEditItem(id);
    });
    scope?.querySelector('[data-stock-detail-move]')?.addEventListener('click', (e) => {
      const id = e.currentTarget.dataset.itemId;
      closeTopModal(); openItemMovement(id);
    });
    scope?.querySelector('[data-stock-swap-ranks]')?.addEventListener('click', (e) => {
      swapSupplierRanks(e.currentTarget.dataset.itemId);
    });
    scope?.querySelector('[data-stock-add-backup-supplier]')?.addEventListener('click', (e) => {
      const id = e.currentTarget.dataset.itemId;
      closeTopModal();
      openAddBackupSupplier(id);
    });
    scope?.querySelector('[data-stock-detail-delete]')?.addEventListener('click', (e) => {
      const id = e.currentTarget.dataset.itemId;
      closeTopModal();
      confirmDeleteItem(id);
    });
  }

  function renderItemUsageChart(it) {
    const W = 320, H = 130, PAD = { l: 24, r: 8, t: 10, b: 20 };
    const innerW = W - PAD.l - PAD.r, innerH = H - PAD.t - PAD.b;
    const daily = (it.usageThisWeek / 7);
    const theoDaily = (theoreticalUsageFor(it) / 7);
    // Generate 14 days of mock data around the daily average
    const actual = Array.from({ length: 14 }, (_, i) => daily * (0.85 + Math.random() * 0.3));
    const theo = Array.from({ length: 14 }, () => theoDaily);
    const max = Math.max(...actual, ...theo) * 1.15;
    const xAt = (i) => PAD.l + (i / 13) * innerW;
    const yAt = (v) => PAD.t + innerH - (v / max) * innerH;
    const pathActual = actual.map((v, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i)} ${yAt(v)}`).join(' ');
    const pathTheo = theo.map((v, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i)} ${yAt(v)}`).join(' ');
    return `
      <svg class="st-md-mini-chart" style="height:140px;" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">
        <path class="line-dashed" d="${pathTheo}" />
        <path class="line" d="${pathActual}" />
        <g class="axis">
          <text x="${PAD.l}" y="${H - 4}" font-size="9">−14j</text>
          <text x="${PAD.l + innerW}" y="${H - 4}" text-anchor="end" font-size="9">${t('today').toLowerCase()}</text>
        </g>
      </svg>
    `;
  }

  function renderCatOptions(selectedId) {
    const opts = allCategories().map(c =>
      `<option value="${esc(c.id)}" ${c.id === selectedId ? 'selected' : ''}>${esc(c.label)}</option>`
    ).join('');
    return `${opts}<option value="__new__">${esc(t('addCatOpt'))}</option>`;
  }

  function renderSupOptions(selectedSupplierName) {
    return getSup().map(s => {
      const label = `${s.name} · ${s.location || ''}`.trim().replace(/ ·\s*$/, '');
      const sel = selectedSupplierName && (selectedSupplierName === s.name || selectedSupplierName.startsWith(s.name)) ? 'selected' : '';
      return `<option value="${esc(label)}" ${sel}>${esc(label)}</option>`;
    }).join('');
  }

  function topBackdrop() {
    const all = document.querySelectorAll('.kiwi-backdrop');
    return all.length ? all[all.length - 1] : null;
  }

  function wireDismiss(scope) {
    if (!scope) return;
    scope.querySelectorAll('[data-dismiss-modal]').forEach(b => {
      b.addEventListener('click', () => scope.querySelector('.kiwi-modal-close')?.click());
    });
  }

  function closeTopModal() {
    (topBackdrop() || document).querySelector('.kiwi-modal-close')?.click();
  }

  function wireCatNewToggle(scope) {
    const root = scope || topBackdrop() || document;
    const sel = root.querySelector('[data-stock-add-cat]');
    const inlineWrap = root.querySelector('[data-stock-newcat-wrap]');
    const inlineInput = root.querySelector('[data-stock-newcat-name]');
    const inlineBtn = root.querySelector('[data-stock-newcat-confirm]');
    if (!sel || !inlineWrap) return;
    sel.addEventListener('change', () => {
      if (sel.value === '__new__') {
        inlineWrap.hidden = false;
        inlineInput?.focus();
      } else {
        inlineWrap.hidden = true;
      }
    });
    inlineBtn?.addEventListener('click', () => {
      const raw = (inlineInput?.value || '').trim();
      if (!raw) { inlineInput?.focus(); return; }
      let id;
      if (retailCatalog()) {
        const created = retailCatalog().addCategory(raw, 'atlas');
        id = created?.id;
      } else {
        id = 'usr-cat-' + raw.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').slice(0, 20) + '-' + Date.now().toString(36).slice(-4);
        S.stUserCategories.push({ id, label: raw });
        stSaveOverlay();
      }
      if (!id) return;
      // Rebuild the select preserving "+ Nouvelle…" option last, select new id.
      sel.innerHTML = renderCatOptions(id);
      sel.value = id;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      inlineWrap.hidden = true;
      inlineInput.value = '';
      window.Kiwi.toast(t('addCatToast', raw), { type: 'success' });
    });
  }

  function loadCiqual() {
    if (!S.ciqualPromise) {
      S.ciqualPromise = fetch('assets/data/ciqual-lite.json?v=4', { credentials: 'same-origin' })
        .then((response) => { if (!response.ok) throw new Error('ciqual ' + response.status); return response.json(); })
        .then((payload) => ({
          foods: Array.isArray(payload?.foods) ? payload.foods : [],
          aliases: payload?.aliases && typeof payload.aliases === 'object' ? payload.aliases : {},
          portionSuggestions: payload?.portionSuggestions && typeof payload.portionSuggestions === 'object' ? payload.portionSuggestions : {},
        }))
        .catch(() => ({ foods: [], aliases: {}, portionSuggestions: {} }));
    }
    return S.ciqualPromise;
  }

  function searchKey(value) {
    return String(value || '').toLocaleLowerCase('fr').replace(/œ/g, 'oe').replace(/æ/g, 'ae').normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  }

  function nutrientLabel(key) {
    return t({ kcal: 'nutriKcal', protein: 'nutriProtein', carbs: 'nutriCarbs', fat: 'nutriFat', sugars: 'nutriSugars', salt: 'nutriSalt' }[key]);
  }

  function nutrientSection(existing) {
    const per100g = existing?.nutrition?.per100g || {};
    const selected = new Set(Array.isArray(existing?.allergens) ? existing.allergens : []);
    const source = ['ciqual', 'off', 'manual'].includes(existing?.nutrition?.source) ? existing.nutrition.source : 'manual';
    return `<details class="st-nutrition" data-stock-nutrition data-source="${esc(source)}" data-ref="${esc(existing?.nutrition?.ref || '')}">
      <summary><span><b>${esc(t('nutriTitle'))}</b><small>${esc(t('nutriSummary'))}</small></span></summary>
      <div class="st-nutrition-body">
        <div class="st-ciqual-search">
          <label class="st-mb-label">${esc(t('nutriSearch'))}</label>
          <input class="st-mb-input" type="search" autocomplete="off" placeholder="${esc(t('nutriSearchPh'))}" data-ciqual-search />
          <div class="st-ciqual-results" data-ciqual-results hidden></div>
        </div>
        <div class="st-nutrition-meta"><span>${esc(t('nutriSource'))}</span><b data-nutri-source-label>${esc(source === 'ciqual' ? t('nutriCiqual') : t('nutriManual'))}</b></div>
        <div class="st-mb-label st-nutrition-kicker">${esc(t('nutriPer100'))}</div>
        <div class="st-nutrient-grid">${nutritionKeys.map((key) => `<label><span>${esc(nutrientLabel(key))}</span><input class="st-mb-input mono" type="number" min="0" step="${key === 'kcal' ? '1' : '0.01'}" value="${esc(per100g[key] ?? '')}" data-stock-nutrient="${key}" /></label>`).join('')}</div>
        <div class="st-mb-field st-grams-field" data-grams-wrap hidden>
          <label class="st-mb-label" data-grams-label>${esc(t('nutriGramsPiece'))}</label>
          <input class="st-mb-input mono" type="number" min="0.001" step="0.001" value="${esc(existing?.gramsPerUnit ?? '')}" data-stock-grams />
          <small>${esc(t('nutriGramsHint'))}</small>
          <div class="st-portion-prefill" data-portion-prefill hidden><span data-portion-copy></span><button type="button" data-apply-grams>${esc(t('nutriPortionApply'))}</button></div>
        </div>
        <div class="st-mb-label st-nutrition-kicker">${esc(t('allergenTitle'))}</div>
        <div class="st-allergen-chips">${allergenKeys().map((key) => `<button type="button" data-allergen="${key}" aria-pressed="${selected.has(key) ? 'true' : 'false'}">${esc(t('allergen.' + key))}</button>`).join('')}</div>
        <p class="st-allergen-help">${esc(t('allergenSuggested'))}</p>
        <label class="st-allergen-confirm"><input type="checkbox" data-allergen-confirm${Array.isArray(existing?.allergens) ? ' checked' : ''}/><span>${esc(t('allergenConfirm'))}</span></label>
      </div>
    </details>`;
  }

  function wireNutrition(scope, existing) {
    const section = scope?.querySelector('[data-stock-nutrition]');
    const unitSelect = scope?.querySelector('[data-stock-add-unit]');
    if (!section || !unitSelect) return;
    const sourceLabel = section.querySelector('[data-nutri-source-label]');
    const gramsWrap = section.querySelector('[data-grams-wrap]');
    const gramsInput = section.querySelector('[data-stock-grams]');
    const gramsLabel = section.querySelector('[data-grams-label]');
    const portionPrefill = section.querySelector('[data-portion-prefill]');
    const portionCopy = section.querySelector('[data-portion-copy]');
    const nameInput = scope.querySelector('[data-stock-add-name]');
    let portionSuggestions = {};
    const updateGrams = () => {
      const unit = stockUnit(unitSelect.value), visible = ['unité', 'ml', 'cl', 'L'].includes(unit);
      gramsWrap.hidden = !visible;
      gramsLabel.textContent = t(unit === 'unité' ? 'nutriGramsPiece' : 'nutriGramsMl');
      gramsInput.placeholder = ['ml', 'cl', 'L'].includes(unit) ? '1' : '';
      const suggestion = unit === 'unité' ? portionSuggestions[section.dataset.portionCategory || ''] : null;
      portionPrefill.hidden = !suggestion || !!gramsInput.value;
      if (suggestion) portionCopy.textContent = t('nutriPortionPrefill', suggestion.grams, suggestion['label' + (lang() === 'en' ? 'En' : lang() === 'ar' ? 'Ar' : 'Fr')]);
    };
    updateGrams();
    unitSelect.addEventListener('change', updateGrams);
    nameInput?.addEventListener('input', updateGrams);
    section.addEventListener('toggle', () => {
      if (!section.open || section.dataset.loaded) return;
      section.dataset.loaded = '1';
      const results = section.querySelector('[data-ciqual-results]');
      results.hidden = false; results.textContent = t('nutriLoading');
      loadCiqual().then((ciqual) => {
        portionSuggestions = ciqual.portionSuggestions;
        const food = ciqual.foods.find((row) => String(row.id) === String(section.dataset.ref || ''));
        section.dataset.portionCategory = food?.portionCategory || '';
        updateGrams(); results.hidden = true; results.textContent = '';
      });
    });
    const results = section.querySelector('[data-ciqual-results]');
    const search = section.querySelector('[data-ciqual-search]');
    search.addEventListener('input', async () => {
      const query = searchKey(search.value);
      if (query.length < 2) { results.hidden = true; results.textContent = ''; return; }
      const ciqual = await loadCiqual();
      /* Classement (alias exact, premier mot, début de nom, mot entier, préfixe de
       * mot, sous-chaîne ; FR avant EN ; le plus court d'abord) : dans
       * assets/menu-nutrition.js · searchFoods. Sans lui, « oeuf » ne montrait
       * jamais l'œuf : un biscuit et sept « Boeuf » remplissaient les huit places. */
      const N = window.KiwiMenuNutrition;
      const hits = N && N.searchFoods ? N.searchFoods(ciqual, search.value, 8) : (() => {
        const aliasHits = Object.entries(ciqual.aliases)
          .filter(([alias]) => searchKey(alias).includes(query))
          .map(([alias, id]) => ({ alias, food: ciqual.foods.find((row) => String(row.id) === String(id)) }))
          .filter((entry) => entry.food);
        const canonicalHits = ciqual.foods
          .filter((food) => searchKey(food.nameFr + ' ' + food.nameEn).includes(query))
          .map((food) => ({ alias: '', food }));
        const seen = new Set();
        return [...aliasHits, ...canonicalHits].filter((entry) => {
          const id = String(entry.food.id);
          if (seen.has(id)) return false;
          seen.add(id); return true;
        }).slice(0, 8);
      })();
      results.hidden = false;
      results.innerHTML = hits.length ? hits.map(({ food, alias }) => `<button type="button" data-ciqual-id="${esc(food.id)}"><b>${esc(lang() === 'en' ? food.nameEn : food.nameFr)}</b><span>${alias ? esc(alias) + ' · ' : ''}${esc(lang() === 'en' ? food.nameFr : food.nameEn)} · ${esc(food.kcal)} kcal</span></button>`).join('') : `<span>${esc(t('nutriNoMatch'))}</span>`;
    });
    results.addEventListener('click', async (event) => {
      const button = event.target.closest('[data-ciqual-id]'); if (!button) return;
      const food = (await loadCiqual()).foods.find((row) => String(row.id) === button.dataset.ciqualId); if (!food) return;
      nutritionKeys.forEach((key) => { const input = section.querySelector(`[data-stock-nutrient="${key}"]`); if (input) input.value = food[key]; });
      section.dataset.source = 'ciqual'; section.dataset.ref = String(food.id); sourceLabel.textContent = t('nutriCiqual');
      portionSuggestions = (await loadCiqual()).portionSuggestions;
      section.dataset.portionCategory = food.portionCategory || '';
      search.value = lang() === 'en' ? food.nameEn : food.nameFr; results.hidden = true;
      const hints = new Set(food.allergenHints || []);
      section.querySelectorAll('[data-allergen]').forEach((chip) => chip.setAttribute('aria-pressed', hints.has(chip.dataset.allergen) ? 'true' : 'false'));
      section.dataset.allergensTouched = '1';
      const confirm = section.querySelector('[data-allergen-confirm]'); if (confirm) confirm.checked = false;
      updateGrams();
    });
    section.querySelector('[data-apply-grams]')?.addEventListener('click', () => {
      const suggestion = portionSuggestions[section.dataset.portionCategory || ''];
      if (!suggestion || gramsInput.value) return;
      gramsInput.value = String(suggestion.grams);
      updateGrams();
    });
    gramsInput.addEventListener('input', updateGrams);
    section.querySelectorAll('[data-stock-nutrient]').forEach((input) => input.addEventListener('input', () => {
      section.dataset.source = 'manual'; sourceLabel.textContent = t('nutriManual');
    }));
    section.querySelector('.st-allergen-chips')?.addEventListener('click', (event) => {
      const chip = event.target.closest('[data-allergen]'); if (!chip) return;
      chip.setAttribute('aria-pressed', chip.getAttribute('aria-pressed') === 'true' ? 'false' : 'true');
      section.dataset.allergensTouched = '1';
      const confirm = section.querySelector('[data-allergen-confirm]'); if (confirm) confirm.checked = true;
    });
    section.querySelector('[data-allergen-confirm]')?.addEventListener('change', () => { section.dataset.allergensTouched = '1'; });
  }

  function readNutrition(scope) {
    const section = scope.querySelector('[data-stock-nutrition]'), per100g = {};
    let hasNutrition = false;
    nutritionKeys.forEach((key) => {
      const raw = section.querySelector(`[data-stock-nutrient="${key}"]`)?.value.trim();
      if (raw === '') return;
      const value = Number(raw);
      if (Number.isFinite(value) && value >= 0) { per100g[key] = value; hasNutrition = true; }
    });
    const grams = Number(section.querySelector('[data-stock-grams]')?.value);
    const confirm = section.querySelector('[data-allergen-confirm]');
    let allergens;
    if (confirm?.checked) allergens = [...section.querySelectorAll('[data-allergen][aria-pressed="true"]')].map((chip) => chip.dataset.allergen);
    else if (section.dataset.allergensTouched) allergens = null;
    return {
      nutrition: hasNutrition ? { per100g, source: section.dataset.source || 'manual', ref: section.dataset.ref || '' } : null,
      gramsPerUnit: Number.isFinite(grams) && grams > 0 ? grams : null,
      allergens,
    };
  }

  function openAddItem() { openItemForm(null); }

  function openEditItem(itemId) {
    const it = getInv().find(x => x.id === itemId);
    if (it) openItemForm(it);
  }

  function stItemNum(raw) {
    let s = String(raw == null ? '' : raw)
      .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
      .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06F0))
      .replace(/\u066B/g, '.')
      .replace(/[\s\u00a0\u202F\u066C]/g, '');
    if (!s) return { empty: true };
    if (/^\d+,\d{1,3}$/.test(s)) s = s.replace(',', '.');
    if (!/^\d+(\.\d{1,3})?$/.test(s)) return { bad: true };
    return { n: Math.round(parseFloat(s) * 1000) / 1000 };
  }

  function stItemVal(n) {
    if (n == null || n === '' || !Number.isFinite(+n)) return '';
    const s = String(Math.round(+n * 1000) / 1000);
    return lang() === 'en' ? s : s.replace('.', ',');
  }

  function stItemCss() {
    if (document.getElementById('st-if-css')) return;
    const st = document.createElement('style');
    st.id = 'st-if-css';
    st.textContent = `
      .kiwi-backdrop.st-if-modal .kiwi-modal.kiwi-modal { --if-bg: var(--paper); --if-card: color-mix(in srgb, var(--paper) 55%, #fff); --if-field: var(--paper); background: var(--if-bg) !important; -webkit-backdrop-filter: none !important; backdrop-filter: none !important; border: 1px solid var(--n-200); }
      html[data-theme="dark"] .kiwi-backdrop.st-if-modal .kiwi-modal.kiwi-modal,
      body[data-vexel-mode="dark"] .kiwi-backdrop.st-if-modal .kiwi-modal.kiwi-modal { --if-bg: #0F1512; --if-card: #151C18; --if-field: #0B100E; }
      .kiwi-backdrop.st-if-modal .kiwi-modal-foot.kiwi-modal-foot { background: var(--if-bg) !important; -webkit-backdrop-filter: none !important; backdrop-filter: none !important; border-top: 1px solid var(--n-200); }
      .st-if { display: grid; gap: 14px; color: var(--ink); }
      .st-if [hidden] { display: none !important; }
      .st-if-sec { min-width: 0; padding: 16px 18px 2px; border: 1px solid var(--n-200); border-radius: 14px; background: var(--if-card); }
      .st-if-sec > h4 { margin: 0 0 12px; font: 600 14.5px var(--sans); letter-spacing: -0.01em; color: var(--ink); }
      .st-if-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 0 12px; align-items: start; }
      .st-if-grid.three { grid-template-columns: repeat(3, minmax(0, 1fr)); }
      .st-if .st-if-f { display: grid; grid-template-columns: minmax(0, 1fr); gap: 5px; align-content: start; min-width: 0; margin: 0 0 14px; }
      .st-if-l { display: flex; align-items: baseline; flex-wrap: wrap; gap: 0 6px; font-size: 12px; font-weight: 600; color: var(--n-600); }
      .st-if-tag { font-size: 11px; font-weight: 500; color: var(--n-400, var(--n-500)); }
      .st-if-in { box-sizing: border-box; width: 100%; height: 40px; padding: 0 12px; border: 1px solid var(--n-200); border-radius: 10px; background: var(--if-field); color: var(--ink); font: 500 13.5px var(--sans); transition: border-color 140ms, box-shadow 140ms; }
      .st-if-in::placeholder { color: var(--n-400, var(--n-500)); font-weight: 400; }
      .st-if-in:focus { outline: 0; border-color: var(--atlas); box-shadow: 0 0 0 3px color-mix(in srgb, var(--atlas) 16%, transparent); }
      .st-if-in[aria-invalid="true"] { border-color: var(--danger, #cb5238); box-shadow: 0 0 0 3px color-mix(in srgb, var(--danger, #cb5238) 14%, transparent); }
      .kiwi-backdrop.st-if-modal .st-if .kiwi-select-trigger { min-height: 40px; padding-inline: 12px 10px; border: 1px solid var(--n-200); border-radius: 10px; background: var(--if-field); box-shadow: none; font: 500 13.5px var(--sans); }
      .st-if-num { position: relative; display: block; }
      .st-if-num .st-if-in { padding-inline-end: 64px; font-variant-numeric: tabular-nums; }
      .st-if-num.wide .st-if-in { padding-inline-end: 96px; }
      .st-if-unit { position: absolute; inset-inline-end: 12px; top: 50%; max-width: 56%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; transform: translateY(-50%); font: 500 12px var(--sans); color: var(--n-500); pointer-events: none; }
      .st-if-hint { font-size: 11.5px; line-height: 1.45; color: var(--n-500); }
      .st-if-use { justify-self: start; align-self: start; margin-top: 2px; padding: 5px 10px; border: 1px solid var(--n-200); border-radius: 8px; background: transparent; color: var(--atlas); font: 600 12px var(--sans); cursor: pointer; }
      .st-if-use:hover { background: color-mix(in srgb, var(--atlas) 8%, transparent); }
      .st-if-use:focus-visible { outline: 2px solid var(--atlas); outline-offset: 2px; }
      .st-if-err { font-size: 11.5px; font-weight: 600; line-height: 1.35; color: var(--danger, #cb5238); }
      .st-if-note { display: block; padding: 10px 12px; border-radius: 10px; background: color-mix(in srgb, var(--ink) 5%, var(--if-field)); font-size: 12.5px; line-height: 1.45; color: var(--n-600); }
      .st-if-newcat { display: flex; gap: 6px; margin-top: 2px; }
      .st-if-newcat .st-if-in { flex: 1; min-width: 0; }
      .st-if-btn { flex: none; height: 40px; padding: 0 14px; border: 1px solid var(--atlas); border-radius: 10px; background: var(--atlas); color: var(--paper); font: 600 13px var(--sans); cursor: pointer; }
      .st-if-btn:focus-visible { outline: 2px solid var(--atlas); outline-offset: 2px; }
      .st-if .st-nutrition { margin-top: 0; border-color: var(--n-200); border-radius: 14px; background: var(--if-card); }
      .st-if .st-nutrition > summary { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 18px; list-style: none; }
      .st-if .st-nutrition > summary::-webkit-details-marker { display: none; }
      .st-if .st-nutrition > summary::after { content: ''; flex: none; width: 8px; height: 8px; border-inline-end: 1.6px solid var(--n-500); border-bottom: 1.6px solid var(--n-500); transform: rotate(45deg) translateY(-2px); transition: transform 160ms; }
      .st-if .st-nutrition[open] > summary::after { transform: rotate(-135deg) translateY(-2px); }
      .st-if .st-nutrition > summary b { font: 600 14.5px var(--sans); letter-spacing: -0.01em; }
      .st-if .st-nutrition-body { padding: 0 18px 16px; }
      @media (max-width: 640px) {
        .st-if-grid.three { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
        .st-if-grid.three > :first-child { grid-column: 1 / -1; }
      }
      @media (max-width: 480px) {
        .st-if-grid, .st-if-grid.three { grid-template-columns: minmax(0, 1fr); }
        .st-if-in, .kiwi-backdrop.st-if-modal .st-if .kiwi-select-trigger { font-size: 16px; }
        .st-if-sec { padding: 14px 14px 2px; }
      }
    `;
    document.head.appendChild(st);
  }

  function reorderFromHistory(perDay, receiptDays) {
    const days = [...new Set((receiptDays || []).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)))].sort().slice(-4);
    if (!(perDay > 0) || days.length < 3) return null;
    let sum = 0;
    for (let i = 1; i < days.length; i++) sum += (Date.parse(days[i] + 'T12:00:00Z') - Date.parse(days[i - 1] + 'T12:00:00Z')) / 864e5;
    const gap = sum / (days.length - 1);
    if (!(gap >= 1)) return null;
    return { perDay, gap: Math.round(gap * 10) / 10, deliveries: days.length, qty: Math.ceil(perDay * gap * 10) / 10 };
  }

  function reorderSuggestionFor(it) {
    if (!it) return null;
    let rows = [];
    try { rows = itemHistory(it).filter((r) => (+r.qty || 0) > 0 && r.reason === 'receipt' && +r.occurredTs > 0); } catch (_) { rows = []; }
    return reorderFromHistory(+it.usageThisWeek > 0 ? it.usageThisWeek / 7 : 0, rows.map((r) => stockBusinessDate(+r.occurredTs)));
  }

  function openItemForm(existing) {
    const isEdit = !!existing;
    const reorderSugg = isEdit ? reorderSuggestionFor(existing) : null;
    const title = isEdit ? t('editItemTitle') : t('addItemTitle');
    const cta = isEdit ? t('editItemBtn') : t('addItemBtn');
    const unitOptions = stockUnitOptions(existing?.unit || 'unité');
    stItemCss();
    /* The supplier list starts with « Aucun »: nothing is chosen for the
       merchant. A supplier already on the article that is no longer in the
       list stays selected rather than being swapped for another. */
    const sups = getSup();
    const supLabel = (s) => `${s.name} · ${s.location || ''}`.trim().replace(/ ·\s*$/, '');
    const curSup = existing?.supplier || '';
    const supHit = curSup ? sups.find((s) => curSup === s.name || curSup.startsWith(s.name)) : null;
    const supOpts = `<option value="">${esc(t('itemNoSupplierOpt'))}</option>`
      + (curSup && !supHit ? `<option value="${esc(curSup)}" selected>${esc(curSup)}</option>` : '')
      + sups.map((s) => { const l = supLabel(s); return `<option value="${esc(l)}"${s === supHit ? ' selected' : ''}>${esc(l)}</option>`; }).join('');
    const opt = `<span class="st-if-tag">${esc(t('itemOptional'))}</span>`;
    const num = (key, value, extra) => `<span class="st-if-num${extra || ''}"><input class="st-if-in" inputmode="decimal" autocomplete="off" value="${esc(value)}" data-stock-add-${key} aria-describedby="st-if-e-${key}" /><span class="st-if-unit" data-st-if-unit="${key}" aria-hidden="true"></span></span>
      <span class="st-if-err" id="st-if-e-${key}" data-st-if-err="${key}" hidden></span>`;
    const m = window.Kiwi.modal({
      title,
      width: 720,
      body: `
        <div class="st-if" data-st-if>
          <section class="st-if-sec">
            <h4>${esc(t('itemSecItem'))}</h4>
            <label class="st-if-f">
              <span class="st-if-l">${esc(t('addItemName'))}</span>
              <input class="st-if-in" type="text" maxlength="120" required autocomplete="off" placeholder="${esc(t('itemNamePh'))}" value="${esc(existing?.name || '')}" data-stock-add-name aria-describedby="st-if-e-name" />
              <span class="st-if-err" id="st-if-e-name" data-st-if-err="name" hidden>${esc(t('itemNameErr'))}</span>
            </label>
            <div class="st-if-grid">
              <div class="st-if-f">
                <label class="st-if-l" for="st-if-cat">${esc(t('addItemCat'))}</label>
                <select class="st-if-in" id="st-if-cat" data-stock-add-cat>
                  ${renderCatOptions(existing?.category || 'legumes')}
                </select>
                <div class="st-if-newcat" data-stock-newcat-wrap hidden>
                  <input class="st-if-in" type="text" placeholder="${esc(t('addCatName'))}" data-stock-newcat-name aria-describedby="st-if-e-newcat" />
                  <button data-activation=write class="st-if-btn" type="button" data-stock-newcat-confirm>${esc(t('addCatInline'))}</button>
                </div>
                <span class="st-if-err" id="st-if-e-newcat" data-st-if-err="newcat" hidden>${esc(t('itemNewCatErr'))}</span>
              </div>
              <label class="st-if-f">
                <span class="st-if-l">${esc(t('addItemUnit'))}</span>
                <select class="st-if-in" data-stock-add-unit>${unitOptions}</select>
              </label>
            </div>
            <label class="st-if-f">
              <span class="st-if-l">${esc(t('addItemSupplier'))}${opt}</span>
              <select class="st-if-in" data-stock-add-sup>${supOpts}</select>
              ${sups.length ? '' : `<span class="st-if-hint">${esc(t('itemNoSupplier'))}</span>`}
            </label>
          </section>
          <section class="st-if-sec">
            <h4>${esc(t('itemSecStock'))}</h4>
            <div class="st-if-grid three">
              <label class="st-if-f">
                <span class="st-if-l">${esc(t('addItemStock'))}</span>
                ${num('current', existing != null ? stItemVal(currentStockFor(existing)) : '')}
                ${isEdit ? '' : `<span class="st-if-hint">${esc(t('itemStockHint'))}</span>`}
              </label>
              <label class="st-if-f">
                <span class="st-if-l">${esc(t('addItemPar'))}${opt}</span>
                ${num('par', stItemVal(existing?.parLevel))}
                <span class="st-if-hint">${esc(t('itemParHint'))}</span>
              </label>
              <label class="st-if-f">
                <span class="st-if-l">${esc(t('addItemReorder'))}${opt}</span>
                ${num('reorder', stItemVal(existing?.reorderLevel))}
                <span class="st-if-hint" data-st-if-reorder-hint></span>
                ${reorderSugg ? `<span class="st-if-hint" data-st-if-reorder-measured>${esc(t('itemReorderMeasured', fmtUnit(Math.round(reorderSugg.perDay * 10) / 10, existing.unit), stItemVal(reorderSugg.gap), reorderSugg.deliveries, fmtUnit(reorderSugg.qty, existing.unit)))}</span><button data-activation=write type="button" class="st-if-use" data-st-if-reorder-use="${esc(stItemVal(reorderSugg.qty))}">${esc(t('itemReorderUse', fmtUnit(reorderSugg.qty, existing.unit)))}</button>` : ''}
              </label>
            </div>
          </section>
          <section class="st-if-sec">
            <h4>${esc(t('itemSecCost'))}</h4>
            <label class="st-if-f">
              <span class="st-if-l">${esc(t('itemCostLabel'))}${opt}</span>
              ${num('cost', stItemVal(existing?.costPerUnit), ' wide')}
            </label>
          </section>
          ${nutrientSection(existing)}
        </div>
      `,
      foot: `<button class="st-btn" data-dismiss-modal>${esc(STR[lang()].btnCancel || 'Annuler')}</button><button data-activation=write class="st-btn primary" data-stock-add-confirm>${esc(cta)}</button>`,
    });
    const scope = m?.el || topBackdrop();
    scope?.classList.add('st-if-modal');
    wireDismiss(scope);
    /* Attach listeners synchronously — the modal markup is already in DOM by now
     * (interactive.js's modal() appendChild is synchronous) so we don't need rAF. */
    try { wireCatNewToggle(scope); wireNutrition(scope, existing); } catch (err) { console.error('wireItemForm failed', err); }
    const q = (sel) => scope?.querySelector(sel);
    const mark = (key, msg) => {
      const e = q(`[data-st-if-err="${key}"]`);
      const f = key === 'newcat' ? q('[data-stock-newcat-name]') : q(`[data-stock-add-${key}]`);
      if (e) { if (msg) e.textContent = msg; e.hidden = !msg; }
      if (f) { if (msg) f.setAttribute('aria-invalid', 'true'); else f.removeAttribute('aria-invalid'); }
    };
    /* The unit follows every quantity, and the reorder hint says what an
       empty field will mean before it is saved. */
    const paintUnits = () => {
      const u = stockUnit(q('[data-stock-add-unit]')?.value);
      scope?.querySelectorAll('[data-st-if-unit]').forEach((el) => { el.textContent = el.dataset.stIfUnit === 'cost' ? `MAD / ${u}` : u; });
      const hint = q('[data-st-if-reorder-hint]');
      if (!hint) return;
      const r = stItemNum(q('[data-stock-add-reorder]')?.value);
      const p = stItemNum(q('[data-stock-add-par]')?.value);
      if (!r.empty) { hint.textContent = t('itemReorderHint'); return; }
      const auto = Math.max(0, Math.round((p.n || 0) * 0.4));
      hint.textContent = auto > 0 ? t('itemReorderAuto', fmtUnit(auto, u)) : t('itemReorderNone');
    };
    q('[data-st-if-reorder-use]')?.addEventListener('click', (ev) => {
      ev.preventDefault();
      const f = q('[data-stock-add-reorder]');
      if (!f) return;
      f.value = ev.currentTarget.getAttribute('data-st-if-reorder-use') || '';
      f.dispatchEvent(new Event('input', { bubbles: true }));
      f.focus();
    });
    q('[data-stock-add-unit]')?.addEventListener('change', paintUnits);
    ['name', 'current', 'par', 'reorder', 'cost'].forEach((k) => q(`[data-stock-add-${k}]`)?.addEventListener('input', () => { mark(k, ''); paintUnits(); }));
    q('[data-stock-add-cat]')?.addEventListener('change', () => mark('newcat', ''));
    q('[data-stock-newcat-name]')?.addEventListener('input', () => mark('newcat', ''));
    paintUnits();
    scope?.querySelector('[data-stock-add-confirm]')?.addEventListener('click', () => {
        const name = (scope.querySelector('[data-stock-add-name]')?.value || '').trim();
        const nCur = stItemNum(q('[data-stock-add-current]')?.value);
        const nPar = stItemNum(q('[data-stock-add-par]')?.value);
        const nReorder = stItemNum(q('[data-stock-add-reorder]')?.value);
        const nCost = stItemNum(q('[data-stock-add-cost]')?.value);
        const catSel = scope.querySelector('[data-stock-add-cat]');
        mark('name', name ? '' : t('itemNameErr'));
        mark('newcat', catSel?.value === '__new__' ? t('itemNewCatErr') : '');
        mark('current', nCur.bad ? t('itemNumBad') : (nCur.empty && !isEdit) ? t('itemStockErr') : '');
        mark('par', nPar.bad ? t('itemNumBad') : '');
        mark('reorder', nReorder.bad ? t('itemNumBad') : '');
        mark('cost', nCost.bad ? t('itemNumBad') : '');
        const firstBad = scope.querySelector('.st-if [aria-invalid="true"]');
        if (firstBad) { firstBad.focus(); return; }
        const category = catSel?.value || existing?.category || 'legumes';
        const unit = stockUnit(scope.querySelector('[data-stock-add-unit]')?.value);
        const supSel = scope.querySelector('[data-stock-add-sup]');
        const supplier = supSel ? supSel.value : (existing?.supplier || '');
        const supplierRow = supplier ? getSup().find((s) => supplier === s.name || supplier.startsWith(`${s.name} ·`)) : null;
        const parLevel = nPar.empty ? 0 : nPar.n;
        /* Empty = the house rule, 40 % of the par level, which the hint under
           the field spelled out before the merchant pressed the button. */
        const reorderLevel = nReorder.empty ? Math.max(0, Math.round(parLevel * 0.4)) : nReorder.n;
        const costPerUnit = nCost.empty ? 0 : nCost.n;
        /* Never the par level any more: a new article has the stock the
           merchant typed (required), an edited one keeps its own if cleared. */
        const currentStock = nCur.empty ? (existing ? currentStockFor(existing) : 0) : nCur.n;
        const nutritionData = readNutrition(scope);
        const nutritionPatch = { nutrition: nutritionData.nutrition, gramsPerUnit: nutritionData.gramsPerUnit };
        if (nutritionData.allergens !== undefined) nutritionPatch.allergens = nutritionData.allergens;

        if (isEdit) {
          const before = currentStockFor(existing);
          if (existing.retail && retailCatalog()) {
            retailCatalog().updateProduct(existing.id, {
              name, categoryId: category, cost: costPerUnit, supplierId: supplierRow?.id || '',
              parLevel, reorderLevel,
            });
            retailSetProductStock(existing.id, currentStock, 'comptage');
            closeTopModal();
            window.Kiwi.toast(t('editItemToast', name), { type: 'success' });
            if (S.stPageActive) render();
            return;
          }
          // Edit path: update overlay (or user item directly)
          if (existing.id.startsWith('usr-')) {
            const i = S.stUserItems.findIndex(x => x.id === existing.id);
            if (i >= 0) {
              S.stUserItems[i] = {
                ...S.stUserItems[i],
                name, category, unit, supplier,
                parLevel, reorderLevel, costPerUnit, currentStock, ...nutritionPatch, updatedAt: Date.now(),
              };
              stItemOverrides[existing.id] = {
                ...(stItemOverrides[existing.id] || {}),
                name, category, unit, supplier, parLevel, reorderLevel, costPerUnit, ...nutritionPatch,
                updatedAt: Date.now(),
              };
              stSaveOverlay();   // article créé PAR le commerçant : sa correction compte autant
            }
          } else {
            stItemOverrides[existing.id] = {
              ...(stItemOverrides[existing.id] || {}),
              name, category, unit, supplier,
              parLevel, reorderLevel, costPerUnit, currentStock, ...nutritionPatch, updatedAt: Date.now(),
            };
            // Reflect current stock in stStockOverrides so statusOf/daysOfStock pick it up.
            stStockOverrides[existing.id] = currentStock;
            stSaveOverlay();
          }
          if (Math.abs(currentStock - before) > 0.0005) {
            countStock(existing, currentStock, 'manual-count-' + Date.now().toString(36));
          }
          window.KiwiRestaurantRecipes?.recomputeForStock?.(existing.id, stOverlayScope());
          closeTopModal();
          window.Kiwi.toast(t('editItemToast', name) + stDemoNote(), { type: 'success' });
          if (S.stPageActive) render();
          return;
        }

        if (retailCatalog()) {
          const product = retailCatalog().addProduct({
            name, categoryId: category, cost: costPerUnit, priceMAD: 0,
            supplierId: supplierRow?.id || '', parLevel, reorderLevel,
          });
          if (product) retailSetProductStock(product.id, currentStock, 'initial');
          closeTopModal();
          window.Kiwi.toast(t('addItemToast', name), { type: 'success' });
          if (S.stPageActive) render();
          return;
        }

        // Add path: build a real item that matches the venues.js shape so
        // currentStockFor / statusOf / variance / daysOfStock all behave.
        const status = currentStock <= 0 ? 'out' : (currentStock < reorderLevel ? 'low' : 'ok');
        const item = {
          id: 'usr-' + Date.now().toString(36),
          name, category, unit, supplier,
          currentStock,
          parLevel, reorderLevel, costPerUnit,
          ...nutritionPatch,
          // An opening balance is not a supplier delivery. Keep delivery
          // history unknown until a real receipt movement exists.
          lastDelivery: null,
          deliveryFrequency: '·',
          usageThisWeek: 0,
          theoreticalUsage: 0,
          status, updatedAt: Date.now(),
        };
        S.stUserItems.push(item);
        try {
          if (window.KiwiInventory && stShowReal()) {
            window.KiwiInventory.ensureOpening(item.id, currentStock, { unitCost: costPerUnit, locationId: stockLocationId() });
          }
        } catch (_) {}
        stSaveOverlay();
        window.KiwiRestaurantRecipes?.recomputeForStock?.(item.id, stOverlayScope());
        closeTopModal();
        window.Kiwi.toast(t('addItemToast', name) + stDemoNote(), { type: 'success' });
        if (S.stPageActive) render();
      });
  }

  function confirmDeleteItem(itemId) {
    const it = getInv().find(x => x.id === itemId);
    if (!it) return;
    const m = window.Kiwi.modal({
      title: t('deleteItemTitle'),
      width: 480,
      body: `<p style="margin:0; color:var(--n-700); line-height:1.55;">${esc(t('deleteItemBody', it.name) + stDemoNote())}</p>`,
      foot: `<button class="st-btn" data-dismiss-modal>${esc(STR[lang()].btnCancel || 'Annuler')}</button><button data-activation=write class="st-btn primary" style="background:#b32a2a; border-color:#9a1f1f;" data-stock-delete-confirm>${esc(t('deleteItemBtn'))}</button>`,
    });
    const scope = m?.el || topBackdrop();
    wireDismiss(scope);
    scope?.querySelector('[data-stock-delete-confirm]')?.addEventListener('click', () => {
      if (it.retail && retailCatalog()) {
        retailCatalog().archiveProduct(it.id, true);
        closeTopModal();
        window.Kiwi.toast(t('deleteItemToast', it.name), { type: 'info' });
        if (S.stPageActive) render();
        return;
      }
      if (it.id.startsWith('usr-')) {
        S.stUserItems = S.stUserItems.filter(x => x.id !== it.id);
      } else {
        stDeletedItems.add(it.id);
        stSaveOverlay();
      }
      closeTopModal();
      window.Kiwi.toast(t('deleteItemToast', it.name), { type: 'info' });
      if (S.stPageActive) render();
    });
  }

  function openAddCategory() {
    const m = window.Kiwi.modal({
      title: t('addCatTitle'),
      width: 440,
      body: `
        <div class="st-mb-field">
          <label class="st-mb-label">${esc(t('addCatName'))}</label>
          <input class="st-mb-input" type="text" placeholder="Ex. Surgelés" data-stock-cat-name />
        </div>
      `,
      foot: `<button class="st-btn" data-dismiss-modal>${esc(STR[lang()].btnCancel || 'Annuler')}</button><button data-activation=write class="st-btn primary" data-stock-cat-confirm>${esc(t('addCatBtn'))}</button>`,
    });
    const scope = m?.el || topBackdrop();
    wireDismiss(scope);
    const input = scope?.querySelector('[data-stock-cat-name]');
    input?.focus();
    const submit = () => {
      const raw = (input?.value || '').trim();
      if (!raw) { input?.focus(); return; }
      if (retailCatalog()) retailCatalog().addCategory(raw, 'atlas');
      else {
        const id = 'usr-cat-' + raw.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').slice(0, 20) + '-' + Date.now().toString(36).slice(-4);
        S.stUserCategories.push({ id, label: raw });
        stSaveOverlay();
      }
      scope?.remove();
      window.Kiwi.toast(t('addCatToast', raw), { type: 'success' });
      if (S.stPageActive) render();
    };
    scope?.querySelector('[data-stock-cat-confirm]')?.addEventListener('click', submit);
    input?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
  }

  function openManageCategory(categoryId) {
    const category = allCategories().find(c => c.id === categoryId);
    if (!category) return;
    const assigned = getInv().filter(item => item.category === categoryId);
    const alternatives = allCategories().filter(c => c.id !== categoryId);
    const replacement = alternatives[0]?.id || '';
    const m = window.Kiwi.modal({
      title: t('manageCatTitle'),
      width: 480,
      body: `
        <div class="st-mb-field">
          <label class="st-mb-label">${esc(t('renameCatLabel'))}</label>
          <div style="display:flex;gap:8px;">
            <input class="st-mb-input" type="text" maxlength="60" value="${esc(category.label)}" data-stock-cat-rename style="flex:1;" />
            <button class="st-btn primary" type="button" data-stock-cat-rename-confirm>${esc(t('renameCatBtn'))}</button>
          </div>
        </div>
        <div style="border-top:1px solid var(--n-200);margin:20px 0 14px;"></div>
        ${assigned.length ? `<div class="st-mb-field">
          <label class="st-mb-label">${esc(t('deleteCatMove'))} · ${assigned.length} article${assigned.length > 1 ? 's' : ''}</label>
          ${alternatives.length
            ? `<select class="st-mb-input" data-stock-cat-replacement>${alternatives.map(c => `<option value="${esc(c.id)}"${c.id === replacement ? ' selected' : ''}>${esc(c.label)}</option>`).join('')}</select>`
            : `<div class="st-notice warn">${esc(t('deleteCatBlocked'))}</div>`}
        </div>` : ''}
        <button data-activation=write class="st-btn" type="button" data-stock-cat-delete-confirm ${assigned.length && !alternatives.length ? 'disabled' : ''} style="color:#9a1f1f;border-color:rgba(154,31,31,.35);width:100%;">${esc(t('deleteCatBtn'))}</button>
      `,
      foot: `<button class="st-btn" data-dismiss-modal>${esc(STR[lang()].btnCancel || 'Annuler')}</button>`,
    });
    const scope = m?.el || topBackdrop();
    wireDismiss(scope);
    const renameInput = scope?.querySelector('[data-stock-cat-rename]');
    scope?.querySelector('[data-stock-cat-rename-confirm]')?.addEventListener('click', () => {
      const name = (renameInput?.value || '').trim();
      if (!name) { renameInput?.focus(); return; }
      if (allCategories().some(c => c.id !== categoryId && c.label.trim().toLocaleLowerCase() === name.toLocaleLowerCase())) {
        renameInput?.focus(); return;
      }
      if (retailCatalog()) {
        retailCatalog().renameCategory(categoryId, name);
        closeTopModal();
        window.Kiwi.toast(t('renameCatToast', name), { type: 'success' });
        if (S.stPageActive) render();
        return;
      }
      stCategoryOverrides[categoryId] = { label: name, updatedAt: Date.now() };
      stSaveOverlay();
      closeTopModal();
      window.Kiwi.toast(t('renameCatToast', name), { type: 'success' });
      if (S.stPageActive) render();
    });
    scope?.querySelector('[data-stock-cat-delete-confirm]')?.addEventListener('click', () => {
      const target = scope.querySelector('[data-stock-cat-replacement]')?.value || '';
      if (assigned.length && !target) return;
      if (retailCatalog()) {
        retailCatalog().deleteCategory(categoryId, { reassignTo: target || null });
        if (S.stCatFilter === categoryId) S.stCatFilter = target || 'all';
        closeTopModal();
        window.Kiwi.toast(t('deleteCatToast', category.label), { type: 'info' });
        if (S.stPageActive) render();
        return;
      }
      assigned.forEach((item) => {
        const userIndex = S.stUserItems.findIndex(candidate => candidate.id === item.id);
        if (userIndex >= 0) S.stUserItems[userIndex] = { ...S.stUserItems[userIndex], category: target, updatedAt: Date.now() };
        stItemOverrides[item.id] = { ...(stItemOverrides[item.id] || {}), category: target, updatedAt: Date.now() };
      });
      S.stUserCategories = S.stUserCategories.filter(c => c.id !== categoryId);
      delete stCategoryOverrides[categoryId];
      stDeletedCategories.add(categoryId);
      if (S.stCatFilter === categoryId) S.stCatFilter = target || 'all';
      stSaveOverlay();
      closeTopModal();
      window.Kiwi.toast(t('deleteCatToast', category.label), { type: 'info' });
      if (S.stPageActive) render();
    });
  }

  return { movementLabel, itemHistory, renderRealItemMovementSummary, swapSupplierRanks, renderRealItemHistory, openAddBackupSupplier, openItemMovement, openItemDetail, renderItemUsageChart, renderCatOptions, renderSupOptions, topBackdrop, wireDismiss, closeTopModal, wireCatNewToggle, loadCiqual, searchKey, nutrientLabel, nutrientSection, wireNutrition, readNutrition, openAddItem, openEditItem, stItemNum, stItemVal, stItemCss, reorderFromHistory, reorderSuggestionFor, openItemForm, confirmDeleteItem, openAddCategory, openManageCategory };
});
