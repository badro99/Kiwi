/* Stock movement journal. Reads only injected helpers and declared browser services. */
window.KiwiStockInternal.install('movements', (S) => {
  'use strict';
  const { esc, fmtMad, fmtUnit, lang, stOverlayRaw, stShowReal, svg, t } = S;

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

  return { movementLabel, itemHistory, renderRealItemMovementSummary, renderRealItemHistory };
});
