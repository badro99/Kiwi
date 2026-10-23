/* Stock · loss. Fonctions privées, installées au premier usage. */
window.KiwiStockInternal.install('loss', (S) => {
  'use strict';
  const { ct, ctMad, ctNum, ctReason, ctUnit, ctWasteNote, ctWhen, ctWho, esc, getInv, render, stShowReal, stockLocationId, svg } = S;

  function getWasteMovements() {
    const I = window.KiwiInventory;
    if (!I || !I.history) return [];
    const all = I.history() || [];
    let wasteRows = all.filter(r => r && (r.refType === 'waste' || ['loss', 'expiry', 'gift', 'staff-meal'].includes(r.reason)));
    
    // Apply date range filter
    const now = Date.now();
    const dayStart = (window.KiwiDayReport && window.KiwiDayReport.dayBounds)
      ? window.KiwiDayReport.dayBounds(window.KiwiDayReport.businessDay(now)).from
      : new Date().setHours(5, 0, 0, 0);
    
    if (S.stWasteDateRange === 'aujourdhui') {
      wasteRows = wasteRows.filter(r => (+r.occurredTs || 0) >= dayStart);
    } else if (S.stWasteDateRange === '7j') {
      wasteRows = wasteRows.filter(r => (+r.occurredTs || 0) >= now - 7 * 864e5);
    } else if (S.stWasteDateRange === '30j') {
      wasteRows = wasteRows.filter(r => (+r.occurredTs || 0) >= now - 30 * 864e5);
    }
    
    // Reason filter
    if (S.stWasteFilterReason !== 'all') {
      wasteRows = wasteRows.filter(r => {
        const fine = r.meta && r.meta.wasteReason;
        if (fine === S.stWasteFilterReason) return true;
        if (S.stWasteFilterReason === 'expiry' && r.reason === 'expiry') return true;
        if (S.stWasteFilterReason === 'gift' && r.reason === 'gift') return true;
        if (S.stWasteFilterReason === 'staff-meal' && r.reason === 'staff-meal') return true;
        if (S.stWasteFilterReason === 'loss' && r.reason === 'loss') return true;
        return false;
      });
    }

    // Search filter
    if (S.stWasteSearch) {
      const q = S.stWasteSearch.toLowerCase();
      wasteRows = wasteRows.filter(r => {
        const it = getInv().find(x => x.id === r.itemId);
        const name = (it ? it.name : r.itemId).toLowerCase();
        const actor = `${r.actor || ''} ${ctWho(r.actor || '')}`.toLowerCase();
        const note = `${r.note || ''} ${ctWasteNote(r.note || '')}`.toLowerCase();
        return name.includes(q) || actor.includes(q) || note.includes(q);
      });
    }

    return wasteRows;
  }

  function renderWasteJournal() {
    const rows = getWasteMovements();
    const inv = getInv();
    const totalQty = rows.reduce((acc, r) => acc + Math.abs(+r.qty || 0), 0);
    const totalVal = rows.reduce((acc, r) => {
      const it = inv.find(x => x.id === r.itemId);
      const cost = r.unitCost != null ? r.unitCost : (it ? it.costPerUnit : 0);
      return acc + Math.abs(+r.qty || 0) * cost;
    }, 0);

    const rangePill = (id, label) => `<button class="st-cat-pill${S.stWasteDateRange === id ? ' on' : ''}" type="button" data-action="stock-waste-range" data-range="${id}">${esc(label)}</button>`;
    const reasonPill = (id, label) => `<button class="st-cat-pill${S.stWasteFilterReason === id ? ' on' : ''}" type="button" data-action="stock-waste-reason" data-reason="${id}">${esc(label)}</button>`;

    return `
      <div class="st-section">
        <div class="st-toolbar" style="margin-bottom:16px;">
          <div class="st-search-row">
            <div class="st-search-wrap">
              ${svg('search', 16)}
              <input class="st-search" type="text" placeholder="${esc(ct('wasteSearchPh'))}" value="${esc(S.stWasteSearch)}" data-stock-waste-search aria-label="${esc(ct('wasteSearchAria'))}" />
            </div>
            <button class="st-btn primary" type="button" data-action="stock-open-declare-waste" style="background:#b91c1c;border-color:#991b1b;color:#fff;display:flex;align-items:center;gap:6px;">
              ${svg('trash2', 14)}<span>${esc(ct('declareBtn'))}</span>
            </button>
            <button class="st-btn secondary" type="button" data-action="stock-export-waste-csv" style="display:flex;align-items:center;gap:6px;">
              ${svg('download', 14)}<span>${esc(ct('exportCsv'))}</span>
            </button>
          </div>
          <div class="st-filter-row" style="display:flex; gap:5px; background:var(--paper-soft); padding:4px; border-radius:999px; border:1px solid var(--n-200); width:fit-content; max-width:100%; flex-wrap:wrap;">
            ${rangePill('aujourdhui', ct('rangeToday'))}
            ${rangePill('7j', ct('range7'))}
            ${rangePill('30j', ct('range30'))}
            ${rangePill('tout', ct('rangeAll'))}
          </div>
          <div class="st-filter-row" style="display:flex; gap:5px; background:var(--paper-soft); padding:4px; border-radius:999px; border:1px solid var(--n-200); width:fit-content; max-width:100%; flex-wrap:wrap;">
            ${reasonPill('all', ct('reasonAll'))}
            ${reasonPill('perime', ct('rsPerime'))}
            ${reasonPill('casse', ct('rsCasse'))}
            ${reasonPill('avarie', ct('rsAvarieShort'))}
            ${reasonPill('offert', ct('rsOffert'))}
            ${reasonPill('repas-equipe', ct('rsStaff'))}
          </div>
        </div>

        <div class="st-kpis" style="display:grid;grid-template-columns:repeat(auto-fit, minmax(200px, 1fr));gap:12px;margin-bottom:16px;">
          <div class="st-kpi"><div class="st-kpi-l">${esc(ct('kpiLostValue'))}</div><div class="st-kpi-v" style="color:#b91c1c;">${ctMad(totalVal)}</div><div class="st-kpi-sub">${esc(ct('kpiLostRecords', rows.length))}</div></div>
          <div class="st-kpi"><div class="st-kpi-l">${esc(ct('kpiLostVolume'))}</div><div class="st-kpi-v">${ctNum(Math.round(totalQty * 10) / 10)}</div><div class="st-kpi-sub">${esc(ct('kpiLostVolumeSub'))}</div></div>
        </div>

        <div class="st-tbl-wrap">
          <table class="st-tbl">
            <thead>
              <tr>
                <th>${esc(ct('thDate'))}</th>
                <th>${esc(ct('thItem'))}</th>
                <th>${esc(ct('thQty'))}</th>
                <th>${esc(ct('thUnit'))}</th>
                <th>${esc(ct('thReason'))}</th>
                <th>${esc(ct('thValueMad'))}</th>
                <th>${esc(ct('thEmployee'))}</th>
                <th>${esc(ct('thNote'))}</th>
                <th style="text-align:right;">${esc(ct('thActions'))}</th>
              </tr>
            </thead>
            <tbody>
              ${rows.length ? rows.map(r => {
                const it = inv.find(x => x.id === r.itemId) || { name: r.itemId, unit: 'unité', costPerUnit: r.unitCost || 0 };
                const cost = r.unitCost != null ? r.unitCost : (it.costPerUnit || 0);
                const valMAD = Math.abs(+r.qty || 0) * cost;
                const when = ctWhen(r.occurredTs);
                const isReversal = !!r.reversalOf;
                const reasonLabel = ctReason((r.meta && r.meta.wasteReason) || r.reason, isReversal);
                const note = ctWasteNote(r.note || '');
                return `
                  <tr style="${isReversal ? 'opacity:0.6;' : ''}">
                    <td class="st-mono" style="font-size:12px;color:var(--n-600);white-space:nowrap;">${esc(when.date + ' ' + when.time)}</td>
                    <td><b>${esc(it.name)}</b>${r.meta?.lotId ? `<div style="font-size:11px;color:var(--n-500);">${esc(ct('lot', r.meta.lotId))}</div>` : ''}</td>
                    <td class="st-mono" style="color:${+r.qty < 0 ? '#b91c1c' : 'var(--atlas)'};font-weight:600;">${+r.qty < 0 ? '−' : '+'}${ctNum(Math.abs(+r.qty || 0))}</td>
                    <td>${esc(ctUnit(it.unit))}</td>
                    <td><span class="st-badge warn" style="font-size:11px;">${esc(reasonLabel)}</span></td>
                    <td class="st-mono">${ctMad(valMAD)}</td>
                    <td style="font-size:12.5px;">${esc(ctWho(r.actor || (r.meta && r.meta.actor) || '') || '·')}</td>
                    <td style="font-size:12px;color:var(--n-600);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${esc(note)}">${esc(note || '·')}</td>
                    <td style="text-align:right;">
                      ${stShowReal() && !isReversal ? `
                        <button class="st-btn small" type="button" data-action="stock-cancel-waste" data-movement-id="${esc(r.id)}" title="${esc(ct('cancelLossTitle'))}" style="color:#b91c1c;border-color:rgba(185,28,28,0.25);">
                          ${esc(ct('cancel'))}
                        </button>
                      ` : '·'}
                    </td>
                  </tr>
                `;
              }).join('') : `<tr><td colspan="9" style="text-align:center;padding:24px;color:var(--n-500);">${esc(ct('wasteEmpty'))}</td></tr>`}
            </tbody>
          </table>
        </div>
        <div class="st-tbl-foot">
          ${ct('wasteFoot', rows.length, ctMad(totalVal))}
        </div>
      </div>
    `;
  }

  function exportWasteCsv() {
    const rows = getWasteMovements();
    const inv = getInv();
    function csvSafe(v) {
      let s = String(v == null ? '' : v);
      if (/^[\t\r ]*[=+\-@]/.test(s)) s = "'" + s;
      return '"' + s.replace(/"/g, '""') + '"';
    }
    const header = ct('csvWaste');
    const lines = [header.join(';')];
    rows.forEach(r => {
      const it = inv.find(x => x.id === r.itemId) || { name: r.itemId, unit: 'unité', costPerUnit: r.unitCost || 0 };
      const cost = r.unitCost != null ? r.unitCost : (it.costPerUnit || 0);
      const valMAD = Math.abs(+r.qty || 0) * cost;
      const d = new Date(r.occurredTs).toISOString().slice(0, 19).replace('T', ' ');
      lines.push([
        d,
        csvSafe(it.name),
        Math.abs(+r.qty || 0),
        csvSafe(ctUnit(it.unit)),
        csvSafe(ctReason((r.meta && r.meta.wasteReason) || r.reason, !!r.reversalOf)),
        valMAD.toFixed(2),
        csvSafe(ctWho(r.actor || '')),
        csvSafe(ctWasteNote(r.note || '')),
        r.id
      ].join(';'));
    });
    const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${ct('csvWasteFile')}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
  }

  function openDeclareWasteModal(prefill) {
    prefill = prefill || {};
    const items = getInv();
    const prefillId = prefill.itemId || (items[0] && items[0].id) || '';
    const prefillQty = prefill.qty != null ? prefill.qty : 1;
    const prefillReason = prefill.reason || 'perime';

    const itemOptions = items.map(it => `
      <option value="${esc(it.id)}"${it.id === prefillId ? ' selected' : ''}>
        ${esc(it.name)} (${ctNum(it.currentStock)} ${esc(ctUnit(it.unit || 'unité'))})
      </option>
    `).join('');

    const html = `
      <div class="st-modal-head">
        <div>
          <h3>${esc(ct('declareTitle'))}</h3>
          <p style="margin:2px 0 0;font-size:12.5px;color:var(--n-500);">${esc(ct('declareSub'))}</p>
        </div>
        <button class="st-modal-x" type="button" data-action="stock-modal-close">${svg('x', 18)}</button>
      </div>
      <form class="st-form" id="st-waste-declare-form" style="padding:16px 20px;">
        <div class="st-field" style="margin-bottom:12px;">
          <label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px;color:var(--ink);">${esc(ct('declareItem'))}</label>
          <select class="st-select" id="st-wf-item" required style="width:100%;">
            ${itemOptions}
          </select>
        </div>
        <div style="display:flex;gap:10px;margin-bottom:12px;">
          <div class="st-field" style="flex:1;">
            <label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px;color:var(--ink);">${esc(ct('declareQty'))}</label>
            <input class="st-input" id="st-wf-qty" type="number" step="any" min="0.001" value="${prefillQty}" required style="width:100%;" />
          </div>
          <div class="st-field" style="flex:1.5;">
            <label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px;color:var(--ink);">${esc(ct('declareReason'))}</label>
            <select class="st-select" id="st-wf-reason" style="width:100%;">
              <option value="perime"${prefillReason === 'perime' || prefillReason === 'Péremption' || prefillReason === 'expiry' ? ' selected' : ''}>${esc(ct('optPerime'))}</option>
              <option value="casse"${prefillReason === 'casse' ? ' selected' : ''}>${esc(ct('optCasse'))}</option>
              <option value="avarie"${prefillReason === 'avarie' ? ' selected' : ''}>${esc(ct('optAvarie'))}</option>
              <option value="offert"${prefillReason === 'offert' ? ' selected' : ''}>${esc(ct('optOffert'))}</option>
              <option value="repas-equipe"${prefillReason === 'repas-equipe' ? ' selected' : ''}>${esc(ct('optStaff'))}</option>
              <option value="autre"${prefillReason === 'autre' ? ' selected' : ''}>${esc(ct('optOther'))}</option>
            </select>
          </div>
        </div>
        <div class="st-field" style="margin-bottom:16px;">
          <label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px;color:var(--ink);">${esc(ct('declareNote'))}</label>
          <input class="st-input" id="st-wf-note" type="text" placeholder="${esc(ct('declareNotePh'))}" style="width:100%;" />
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end;">
          <button class="st-btn secondary" type="button" data-action="stock-modal-close">${esc(ct('cancel'))}</button>
          <button class="st-btn primary" type="submit" style="background:#b91c1c;border-color:#991b1b;color:#fff;">
            ${svg('trash2', 14)}<span style="margin-left:4px;">${esc(ct('declareSave'))}</span>
          </button>
        </div>
      </form>
    `;

    openModal(html);

    const form = document.getElementById('st-waste-declare-form');
    if (form) {
      form.onsubmit = (e) => {
        e.preventDefault();
        const itemId = document.getElementById('st-wf-item')?.value;
        const qty = parseFloat(document.getElementById('st-wf-qty')?.value) || 0;
        const reason = document.getElementById('st-wf-reason')?.value || 'perime';
        const note = (document.getElementById('st-wf-note')?.value || '').trim();
        if (!itemId || !(qty > 0)) {
          window.Kiwi?.toast?.(ct('qtyInvalid'), { type: 'warn' });
          return;
        }
        if (window.KiwiInventory) {
          const it = items.find(x => x.id === itemId);
          const unitCost = it ? (it.costPerUnit || it.cost || null) : null;
          window.KiwiInventory.add({
            locationId: stockLocationId(),
            itemId,
            qty: -qty,
            /* « loss » : le motif que le serveur connaît. « waste » était refusé
               et bloquait la file de stock de l'appareil. */
            reason: 'loss',
            refType: 'waste',
            refId: 'waste-' + Date.now().toString(36),
            unitCost,
            note: note || `Déclaration perte · ${reason}`,
            meta: {
              wasteReason: reason,
              actor: 'Propriétaire',
              actorId: 'owner'
            }
          });
          window.KiwiInventory.sync();
          window.Kiwi?.toast?.(ct('lossSavedToast'), { type: 'success' });
          closeModal();
          if (S.stPageActive) render();
        }
      };
    }
  }

  return { getWasteMovements, renderWasteJournal, exportWasteCsv, openDeclareWasteModal };
});
