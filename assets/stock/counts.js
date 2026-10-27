/* Stock · counts. Fonctions privées, installées au premier usage. */
window.KiwiStockInternal.install('counts', (S) => {
  'use strict';
  const { allCategories, closeTopModal, countStock, ct, ctMad, ctNum, ctReviewNote, ctRole, ctStore, ctUnit, ctWhen, ctWho, currentStockFor, esc, fmtMad, fmtNum, fmtUnit, getInv, lang, moveStock, render, rerenderTabBody, stCountDate, stCountHistKey, stSaveOverlay, stShowReal, stockLocationId, svg, t, theoreticalUsageFor, topBackdrop, wireDismiss } = S;

  function fetchServerCounts(...args) { return S.stockState.fetchServerCounts(S, {  }).apply(this, args); }

  function getAllCounts() {
    const serverCounts = Array.isArray(S.stCountsCache) ? S.stCountsCache : [];
    const localHist = stCountHistory() || [];
    
    const localMapped = localHist.map((h, i) => {
      const gaps = Array.isArray(h.gaps) ? h.gaps : [];
      return {
        id: h.ref || `local_cnt_${h.ts || i}`,
        engine: 'ledger',
        status: 'applied',
        storeId: '',
        storeName: 'Magasin principal',
        employeeId: '',
        employeeName: 'Propriétaire',
        employeeRole: 'Admin',
        submittedAt: h.ts || Date.now(),
        reviewedAt: h.ts || Date.now(),
        reviewerName: 'Propriétaire',
        reviewDecision: 'approved',
        appliedAt: h.ts || Date.now(),
        totalLines: h.counted || gaps.length,
        totalDiff: gaps.reduce((acc, g) => acc + (g.diff || 0), 0),
        totalVarianceCostMAD: h.varMad || gaps.reduce((acc, g) => acc + (g.mad || 0), 0),
        absVarianceCostMAD: Math.abs(h.varMad || gaps.reduce((acc, g) => acc + Math.abs(g.mad || 0), 0)),
        lines: gaps.map(g => ({
          key: g.id,
          itemId: g.id,
          productName: g.name,
          color: '',
          size: '',
          sku: g.id,
          unit: g.unit || 'unité',
          unitCost: 0,
          systemQty: g.theo || 0,
          countedQty: g.counted || 0,
          diff: g.diff || 0,
          varianceCost: g.mad || 0,
          explanation: g.reason || '',
          note: ''
        }))
      };
    });

    const byId = new Map();
    serverCounts.forEach(c => byId.set(c.id, c));
    localMapped.forEach(c => { if (!byId.has(c.id)) byId.set(c.id, c); });
    
    return Array.from(byId.values()).sort((a, b) => (b.submittedAt || 0) - (a.submittedAt || 0));
  }

  function filterCounts(counts) {
    const now = Date.now();
    let rows = counts.slice();

    if (S.stCountDateFilter === 'aujourdhui') {
      const dayStart = (window.KiwiDayReport && window.KiwiDayReport.dayBounds)
        ? window.KiwiDayReport.dayBounds(window.KiwiDayReport.businessDay(now)).from
        : new Date().setHours(5, 0, 0, 0);
      rows = rows.filter(r => (r.submittedAt || 0) >= dayStart);
    } else if (S.stCountDateFilter === '7j') {
      rows = rows.filter(r => (r.submittedAt || 0) >= now - 7 * 864e5);
    } else if (S.stCountDateFilter === '30j') {
      rows = rows.filter(r => (r.submittedAt || 0) >= now - 30 * 864e5);
    }

    if (S.stCountStatusFilter !== 'all') {
      rows = rows.filter(r => r.status === S.stCountStatusFilter);
    }

    if (S.stCountSearch) {
      const q = S.stCountSearch.toLowerCase();
      rows = rows.filter(r => {
        const emp = `${r.employeeName || ''} ${ctWho(r.employeeName)}`.toLowerCase();
        const stn = `${r.storeName || ''} ${ctStore(r.storeName)}`.toLowerCase();
        const cid = (r.id || '').toLowerCase();
        return emp.includes(q) || stn.includes(q) || cid.includes(q);
      });
    }

    return rows;
  }

  function renderCountsHistory() {
    if (Date.now() - S.stCountsLastFetched > 30000) {
      fetchServerCounts().then(() => {
        if (S.stPageActive && S.stItemSubView === 'counts') rerenderTabBody();
      });
    }

    const allCounts = getAllCounts();
    const filtered = filterCounts(allCounts);

    const rangePill = (id, label) => `<button class="st-cat-pill${S.stCountDateFilter === id ? ' on' : ''}" type="button" data-action="stock-count-range" data-range="${id}">${esc(label)}</button>`;
    const statusPill = (id, label) => `<button class="st-cat-pill${S.stCountStatusFilter === id ? ' on' : ''}" type="button" data-action="stock-count-status" data-status="${id}">${esc(label)}</button>`;
    const tabBtn = (id, label) => `<button class="st-cat-pill${S.stCountSubTab === id ? ' on' : ''}" type="button" data-action="stock-count-tab" data-tab="${id}" style="font-weight:600;">${esc(label)}</button>`;

    const totalEcartsMad = filtered.reduce((acc, c) => acc + (c.totalVarianceCostMAD || 0), 0);
    const totalAbsEcartsMad = filtered.reduce((acc, c) => acc + (c.absVarianceCostMAD || 0), 0);
    const pendingCount = allCounts.filter(c => c.status === 'submitted').length;

    return `
      <div class="st-section">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:10px;">
          <div style="display:flex;gap:6px;">
            ${tabBtn('list', ct('tabList'))}
            ${tabBtn('rollup', ct('tabRollup'))}
          </div>
          <div style="display:flex;gap:8px;">
            <button data-activation=money class="st-btn secondary" type="button" data-action="stock-export-counts-csv" style="display:flex;align-items:center;gap:6px;">
              ${svg('download', 14)}<span>${esc(ct('exportCsv'))}</span>
            </button>
            <button class="st-btn primary" type="button" data-action="stock-physical-count">
              ${svg('plus', 14)}<span>${esc(ct('newCount'))}</span>
            </button>
          </div>
        </div>

        <div class="st-toolbar" style="margin-bottom:16px;">
          <div class="st-search-row">
            <div class="st-search-wrap">
              ${svg('search', 16)}
              <input class="st-search" type="text" placeholder="${esc(ct('countSearchPh'))}" value="${esc(S.stCountSearch)}" data-stock-count-search aria-label="${esc(ct('countSearchAria'))}" />
            </div>
          </div>
          <div class="st-filter-row" style="display:flex; gap:5px; background:var(--paper-soft); padding:4px; border-radius:999px; border:1px solid var(--n-200); width:fit-content; max-width:100%; flex-wrap:wrap;">
            ${rangePill('aujourdhui', ct('rangeToday'))}
            ${rangePill('7j', ct('range7'))}
            ${rangePill('30j', ct('range30'))}
            ${rangePill('tout', ct('rangeAll'))}
          </div>
          <div class="st-filter-row" style="display:flex; gap:5px; background:var(--paper-soft); padding:4px; border-radius:999px; border:1px solid var(--n-200); width:fit-content; max-width:100%; flex-wrap:wrap;">
            ${statusPill('all', ct('statusAll'))}
            ${statusPill('submitted', ct('statusPending', pendingCount))}
            ${statusPill('applied', ct('statusApplied'))}
            ${statusPill('rejected', ct('statusRejected'))}
          </div>
        </div>

        <div class="st-kpis" style="display:grid;grid-template-columns:repeat(auto-fit, minmax(200px, 1fr));gap:12px;margin-bottom:16px;">
          <div class="st-kpi"><div class="st-kpi-l">${esc(ct('kpiCounts'))}</div><div class="st-kpi-v">${filtered.length}</div><div class="st-kpi-sub">${esc(ct('kpiCountsSub', pendingCount))}</div></div>
          <div class="st-kpi"><div class="st-kpi-l">${esc(ct('kpiNet'))}</div><div class="st-kpi-v" style="color:${totalEcartsMad < 0 ? '#b91c1c' : 'var(--atlas)'};">${totalEcartsMad > 0 ? '+' : ''}${ctMad(totalEcartsMad)}</div><div class="st-kpi-sub">${esc(ct('kpiAbs', ctMad(totalAbsEcartsMad)))}</div></div>
        </div>

        ${S.stCountSubTab === 'rollup' ? renderCountsRollup(filtered) : `
          <div class="st-tbl-wrap">
            <table class="st-tbl">
              <thead>
                <tr>
                  <th>${esc(ct('thDate'))}</th>
                  <th>${esc(ct('thRef'))}</th>
                  <th>${esc(ct('thStore'))}</th>
                  <th>${esc(ct('thEmployee'))}</th>
                  <th style="text-align:center;">${esc(ct('thItems'))}</th>
                  <th style="text-align:right;">${esc(ct('thNetMad'))}</th>
                  <th style="text-align:center;">${esc(ct('thStatus'))}</th>
                  <th style="text-align:right;">${esc(ct('thActions'))}</th>
                </tr>
              </thead>
              <tbody>
                ${filtered.length ? filtered.map(c => {
                  const when = ctWhen(c.submittedAt);
                  const stLabel = c.status === 'submitted' ? ct('stPending') : (c.status === 'applied' || c.status === 'approved' ? ct('stApplied') : ct('stRejected'));
                  const stClass = c.status === 'submitted' ? 'warn' : (c.status === 'applied' || c.status === 'approved' ? 'ok' : 'bad');
                  const mad = c.totalVarianceCostMAD || 0;
                  return `
                    <tr>
                      <td class="st-mono" style="font-size:12px;color:var(--n-600);white-space:nowrap;">${esc(when.date + ' ' + when.time)}</td>
                      <td><b>${esc(c.id)}</b></td>
                      <td>${esc(ctStore(c.storeName))}</td>
                      <td>${esc(ctWho(c.employeeName) || '·')} <span style="font-size:11px;color:var(--n-500);">(${esc(ctRole(c.employeeRole) || '·')})</span></td>
                      <td style="text-align:center;" class="st-mono">${c.totalLines || 0}</td>
                      <td style="text-align:right;font-weight:600;color:${mad < 0 ? '#b91c1c' : mad > 0 ? 'var(--atlas)' : 'inherit'};" class="st-mono">
                        ${mad > 0 ? '+' : ''}${ctMad(mad)}
                      </td>
                      <td style="text-align:center;">
                        <span class="st-badge ${stClass}" style="font-size:11px;">${esc(stLabel)}</span>
                      </td>
                      <td style="text-align:right;">
                        <button class="st-btn small" type="button" data-action="stock-count-detail" data-count-id="${esc(c.id)}" style="${c.status === 'submitted' ? 'background:#059669;color:#fff;border-color:#047857;' : ''}">
                          ${esc(c.status === 'submitted' ? ct('btnReview') : ct('btnDetails'))}
                        </button>
                      </td>
                    </tr>
                  `;
                }).join('') : `<tr><td colspan="8" style="text-align:center;padding:28px;color:var(--n-500);">${esc(ct('countsEmpty'))}</td></tr>`}
              </tbody>
            </table>
          </div>
          <div class="st-tbl-foot">
            ${esc(ct('countsFoot', filtered.length))}
          </div>
        `}
      </div>
    `;
  }

  function renderCountsRollup(counts) {
    const variantMap = new Map();
    const employeeMap = new Map();
    const storeMap = new Map();

    counts.forEach(c => {
      const lines = Array.isArray(c.lines) ? c.lines : [];
      lines.forEach(l => {
        const vKey = l.variantId || l.itemId || l.key;
        const vLabel = l.productName ? `${l.productName}${l.color ? ' · ' + l.color : ''}${l.size ? ' · ' + l.size : ''}` : (l.name || vKey);
        const curV = variantMap.get(vKey) || { key: vKey, label: vLabel, sku: l.sku || '', countTimes: 0, absDiffSum: 0, absCostSum: 0, netDiffSum: 0, unit: l.unit || 'unité' };
        curV.countTimes++;
        curV.absDiffSum += Math.abs(Number(l.diff) || 0);
        curV.absCostSum += Math.abs(Number(l.varianceCost) || 0);
        curV.netDiffSum += Number(l.diff) || 0;
        variantMap.set(vKey, curV);
      });

      const empKey = c.employeeId || c.employeeName || 'Inconnu';
      const curE = employeeMap.get(empKey) || { id: empKey, name: c.employeeName || empKey, countTimes: 0, absCostSum: 0, netCostSum: 0 };
      curE.countTimes++;
      curE.absCostSum += Number(c.absVarianceCostMAD) || Math.abs(Number(c.totalVarianceCostMAD) || 0);
      curE.netCostSum += Number(c.totalVarianceCostMAD) || 0;
      employeeMap.set(empKey, curE);

      const stKey = c.storeId || c.storeName || 'Principal';
      const curS = storeMap.get(stKey) || { id: stKey, name: c.storeName || stKey, countTimes: 0, absCostSum: 0, netCostSum: 0 };
      curS.countTimes++;
      curS.absCostSum += Number(c.absVarianceCostMAD) || Math.abs(Number(c.totalVarianceCostMAD) || 0);
      curS.netCostSum += Number(c.totalVarianceCostMAD) || 0;
      storeMap.set(stKey, curS);
    });

    const topVariants = Array.from(variantMap.values()).sort((a, b) => b.absCostSum - a.absCostSum).slice(0, 15);
    const topEmployees = Array.from(employeeMap.values()).sort((a, b) => b.absCostSum - a.absCostSum).slice(0, 8);
    const stores = Array.from(storeMap.values());

    return `
      <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(320px, 1fr));gap:16px;">
        <div style="background:var(--paper);border:1px solid var(--n-200);border-radius:14px;padding:16px;">
          <h4 style="margin:0 0 12px;font-size:15px;">${esc(ct('rollTopItems'))}</h4>
          <div class="st-tbl-wrap">
            <table class="st-tbl" style="font-size:12.5px;">
              <thead><tr><th>${esc(ct('thItem'))}</th><th>${esc(ct('thCountTimes'))}</th><th style="text-align:right;">${esc(ct('thCumDiff'))}</th><th style="text-align:right;">${esc(ct('thImpactMad'))}</th></tr></thead>
              <tbody>
                ${topVariants.length ? topVariants.map(v => `
                  <tr>
                    <td><b>${esc(v.label)}</b>${v.sku ? `<div style="font-size:11px;color:var(--n-500);">${esc(ct('sku', v.sku))}</div>` : ''}</td>
                    <td class="st-mono">${v.countTimes}</td>
                    <td style="text-align:right;" class="st-mono">${v.netDiffSum > 0 ? '+' : ''}${ctNum(Math.round(v.netDiffSum * 10) / 10)} ${esc(ctUnit(v.unit))}</td>
                    <td style="text-align:right;font-weight:600;color:#b91c1c;" class="st-mono">${ctMad(v.absCostSum)}</td>
                  </tr>
                `).join('') : `<tr><td colspan="4" style="text-align:center;padding:16px;color:var(--n-500);">${esc(ct('rollNoVariance'))}</td></tr>`}
              </tbody>
            </table>
          </div>
        </div>

        <div style="display:grid;gap:16px;">
          <div style="background:var(--paper);border:1px solid var(--n-200);border-radius:14px;padding:16px;">
            <h4 style="margin:0 0 12px;font-size:15px;">${esc(ct('rollByEmployee'))}</h4>
            <div class="st-tbl-wrap">
              <table class="st-tbl" style="font-size:12.5px;">
                <thead><tr><th>${esc(ct('thEmployee'))}</th><th>${esc(ct('thCountsN'))}</th><th style="text-align:right;">${esc(ct('thAbsCum'))}</th></tr></thead>
                <tbody>
                  ${topEmployees.length ? topEmployees.map(e => `
                    <tr>
                      <td><b>${esc(ctWho(e.name))}</b></td>
                      <td class="st-mono">${e.countTimes}</td>
                      <td style="text-align:right;font-weight:600;" class="st-mono">${ctMad(e.absCostSum)}</td>
                    </tr>
                  `).join('') : `<tr><td colspan="3" style="text-align:center;padding:16px;color:var(--n-500);">${esc(ct('rollNoCount'))}</td></tr>`}
                </tbody>
              </table>
            </div>
          </div>

          <div style="background:var(--paper);border:1px solid var(--n-200);border-radius:14px;padding:16px;">
            <h4 style="margin:0 0 12px;font-size:15px;">${esc(ct('rollByStore'))}</h4>
            <div class="st-tbl-wrap">
              <table class="st-tbl" style="font-size:12.5px;">
                <thead><tr><th>${esc(ct('thVenue'))}</th><th>${esc(ct('thCountsN'))}</th><th style="text-align:right;">${esc(ct('thNet'))}</th><th style="text-align:right;">${esc(ct('thAbs'))}</th></tr></thead>
                <tbody>
                  ${stores.length ? stores.map(s => `
                    <tr>
                      <td><b>${esc(ctStore(s.name))}</b></td>
                      <td class="st-mono">${s.countTimes}</td>
                      <td style="text-align:right;" class="st-mono">${s.netCostSum > 0 ? '+' : ''}${ctMad(s.netCostSum)}</td>
                      <td style="text-align:right;font-weight:600;" class="st-mono">${ctMad(s.absCostSum)}</td>
                    </tr>
                  `).join('') : `<tr><td colspan="4" style="text-align:center;padding:16px;color:var(--n-500);">${esc(ct('rollNoCount'))}</td></tr>`}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  async function openCountDetailModal(countId) {
    if (!countId) return;
    let count = getAllCounts().find(c => c.id === countId);
    
    // Fetch full frozen details from server if missing lines
    if (!count || !count.lines || !count.lines.length) {
      try {
        const resp = await fetch(`/api/inventory/counts?id=${encodeURIComponent(countId)}`);
        const data = await resp.json();
        if (data && data.count) count = data.count;
      } catch (_) {}
    }

    if (!count) {
      window.Kiwi?.toast?.(ct('countNotFound'), { type: 'warn' });
      return;
    }

    const lines = Array.isArray(count.lines) ? count.lines : [];
    const submitted = ctWhen(count.submittedAt);
    const isSubmitted = count.status === 'submitted';
    const isApproved = count.status === 'applied' || count.status === 'approved';
    const isRejected = count.status === 'rejected';

    const modal = window.Kiwi.modal({
      title: ct('dTitle', count.id),
      desc: esc(ct('dDesc', ctStore(count.storeName), ctWho(count.employeeName || 'Employé'), submitted.date, submitted.time)),
      width: 820,
      body: `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:8px;">
          <div style="display:flex;align-items:center;gap:10px;">
            <span class="st-badge ${isSubmitted ? 'warn' : isApproved ? 'ok' : 'bad'}" style="font-size:13px;padding:4px 10px;">
              ${esc(isSubmitted ? ct('dPending') : isApproved ? ct('dApplied') : ct('stRejected'))}
            </span>
            <span style="font-size:13px;color:var(--n-600);">${esc(ct('dLines', lines.length))}</span>
          </div>
          <div style="font-size:14px;">
            ${esc(ct('dTotal'))} <b style="color:${(count.totalVarianceCostMAD || 0) < 0 ? '#b91c1c' : (count.totalVarianceCostMAD || 0) > 0 ? 'var(--atlas)' : 'inherit'};">${(count.totalVarianceCostMAD || 0) > 0 ? '+' : ''}${ctMad(count.totalVarianceCostMAD || 0)}</b>
          </div>
        </div>

        ${count.reviewNote ? `
          <div class="st-notice ${isApproved ? 'ok' : 'warn'}" style="margin-bottom:14px;">
            ${svg(isApproved ? 'checkCircle' : 'alertTriangle', 14)}
            <div><b>${esc(ct('dReviewNote'))}</b> ${esc(ctReviewNote(count.reviewNote))} ${count.reviewerName ? `<span style="font-size:11px;color:var(--n-500);">${esc(ct('dBy', ctWho(count.reviewerName)))}</span>` : ''}</div>
          </div>
        ` : ''}

        <div class="st-tbl-wrap" tabindex="0" role="region" aria-label="${esc(ct('thItemVariant'))}" style="max-height:360px;overflow-y:auto;border:1px solid var(--n-200);border-radius:12px;margin-bottom:16px;">
          <table class="st-tbl" style="font-size:12.5px;">
            <thead>
              <tr>
                <th>${esc(ct('thItemVariant'))}</th>
                <th style="text-align:right;">${esc(ct('thBefore'))}</th>
                <th style="text-align:right;">${esc(ct('thCounted'))}</th>
                <th style="text-align:right;">${esc(ct('thDiff'))}</th>
                <th style="text-align:right;">${esc(ct('thValueMad'))}</th>
                <th>${esc(ct('thRemark'))}</th>
              </tr>
            </thead>
            <tbody>
              ${lines.length ? lines.map(l => {
                const label = l.productName ? `${l.productName}${l.color ? ' · ' + l.color : ''}${l.size ? ' · ' + l.size : ''}` : (l.name || l.itemId);
                const diff = Number(l.diff) || 0;
                const cost = Number(l.varianceCost) || 0;
                const diffColor = diff < 0 ? '#b91c1c' : diff > 0 ? 'var(--atlas)' : 'inherit';
                return `
                  <tr>
                    <td>
                      <b>${esc(label)}</b>
                      ${l.sku ? `<div style="font-size:11px;color:var(--n-500);">${esc(ct('sku', l.sku))}</div>` : ''}
                    </td>
                    <td style="text-align:right;" class="st-mono">${ctNum(l.systemQty)} ${esc(ctUnit(l.unit))}</td>
                    <td style="text-align:right;font-weight:700;" class="st-mono">${ctNum(l.countedQty)} ${esc(ctUnit(l.unit))}</td>
                    <td style="text-align:right;font-weight:600;color:${diffColor};" class="st-mono">${diff > 0 ? '+' : ''}${ctNum(diff)} ${esc(ctUnit(l.unit))}</td>
                    <td style="text-align:right;font-weight:600;color:${diffColor};" class="st-mono">${cost > 0 ? '+' : ''}${ctMad(cost)}</td>
                    <td style="color:var(--n-600);font-size:11.5px;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${esc(l.explanation || l.note || '')}">
                      ${esc(l.explanation || l.note || '·')}
                    </td>
                  </tr>
                `;
              }).join('') : `<tr><td colspan="6" style="text-align:center;padding:20px;color:var(--n-500);">${esc(ct('dNoLines'))}</td></tr>`}
            </tbody>
          </table>
        </div>

        ${isSubmitted ? `
          <div style="background:var(--paper-soft);border:1px solid var(--n-200);border-radius:12px;padding:12px;margin-bottom:12px;">
            <label style="font-size:12px;font-weight:600;color:var(--n-600);display:block;margin-bottom:4px;">${esc(ct('dNoteLabel'))}</label>
            <input class="st-search" id="st-cnt-review-note" placeholder="${esc(ct('dNotePh'))}" style="width:100%;">
          </div>
        ` : ''}
      `,
      foot: `
        <button class="st-btn" data-dismiss-modal>${esc(ct('dClose'))}</button>
        ${isSubmitted ? `
          <button class="st-btn" id="st-cnt-reject-btn" style="color:#b91c1c;border-color:rgba(185,28,28,0.3);">${esc(ct('dReject'))}</button>
          <button class="st-btn primary" id="st-cnt-approve-btn" style="background:#059669;border-color:#047857;">${esc(ct('dApprove'))}</button>
        ` : ''}
      `
    });

    const scope = modal?.el || topBackdrop();
    wireDismiss(scope);

    scope?.querySelector('#st-cnt-approve-btn')?.addEventListener('click', () => {
      const note = scope?.querySelector('#st-cnt-review-note')?.value || '';
      reviewCount(count.id, 'approved', note);
    });

    scope?.querySelector('#st-cnt-reject-btn')?.addEventListener('click', () => {
      const note = scope?.querySelector('#st-cnt-review-note')?.value || '';
      reviewCount(count.id, 'rejected', note);
    });
  }

  function stReviewBusyTake(btns, root) {
    if (S.stReviewBusy) return false;
    S.stReviewBusy = true;
    (btns || []).forEach((b) => { try { if (b) b.setAttribute('disabled', ''); } catch (_) {} });
    try { if (root && root.setAttribute) root.setAttribute('aria-busy', 'true'); } catch (_) {}
    return true;
  }

  function stReviewBusyRelease(btns, root) {
    S.stReviewBusy = false;
    (btns || []).forEach((b) => { try { if (b && b.removeAttribute) b.removeAttribute('disabled'); } catch (_) {} });
    try { if (root && root.removeAttribute) root.removeAttribute('aria-busy'); } catch (_) {}
  }

  async function stReviewCountSend({ countId, decision, note, fetchFn }) {
    const F = fetchFn || fetch;
    const res = await F('/api/inventory/counts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'review',
        id: countId,
        decision: decision,
        reviewNote: note || '',
        reviewerName: 'Propriétaire'
      })
    });
    let data = null;
    try { data = await res.json(); } catch (_) { data = null; }
    return { ok: !!res.ok, status: res.status, data };
  }

  function stReviewCountErr(send) {
    if (!send) return 'mCountErrGeneric';
    if (send.network) return 'mCountErrOffline';
    const code = send.data && send.data.error;
    if (send.status === 403 || code === 'forbidden') return 'mCountErrDenied';
    if (send.status === 404 || code === 'not_found') return 'mCountErrGone';
    if (send.status === 409 || code === 'catalog-conflict') return 'mCountErrConflict';
    return 'mCountErrGeneric';
  }

  function stReviewCountPlan(decision, isReal, send) {
    if (!send || !send.ok || !(send.data && send.data.success)) {
      return { ok: false, err: stReviewCountErr(send), setStatus: null, overlay: false, close: false, sync: false };
    }
    const approved = decision === 'approved';
    return {
      ok: true, err: null,
      setStatus: approved ? 'applied' : 'rejected',
      overlay: !isReal && approved,
      close: true,
      sync: isReal && approved,
    };
  }

  async function reviewCount(countId, decision, note) {
    if (!countId) return;
    const scope = topBackdrop() || document;
    const approveBtn = scope.querySelector('#st-cnt-approve-btn');
    const rejectBtn = scope.querySelector('#st-cnt-reject-btn');
    if (!stReviewBusyTake([approveBtn, rejectBtn], scope)) return;
    const release = () => stReviewBusyRelease([approveBtn, rejectBtn], scope);
    try {
      const count = getAllCounts().find(c => c.id === countId);
      // Idempotence locale : un compte déjà tranché ne repasse jamais —
      // couvre le second clic mis en file après fermeture (boutons détachés
      // mais écouteurs vivants). Seul un échec (jamais muté) peut rejouer.
      if (count && count.reviewDecision && (count.status === 'applied' || count.status === 'rejected')) {
        release();
        return;
      }
      let real = false;
      try { real = stShowReal(); } catch (_) { real = false; }
      let send;
      if (!real) {
        // Démo / hors-ligne local : pas d'appel serveur, comportement
        // historique (surcouche locale), jamais présenté comme une écriture.
        send = { ok: true, status: 200, data: { success: true, demo: true } };
      } else {
        try {
          send = await stReviewCountSend({ countId, decision, note });
        } catch (_) {
          send = { ok: false, network: true };
        }
      }
      const plan = stReviewCountPlan(decision, real, send);
      if (!plan.ok) {
        window.Kiwi?.toast?.(t(plan.err), { type: 'error' });
        release();
        return; // modale ouverte, contrôles réactivés, RIEN d'appliqué
      }

      if (count) {
        count.status = plan.setStatus;
        count.reviewDecision = decision;
        count.reviewedAt = Date.now();
        count.reviewerName = 'Propriétaire';
        count.reviewNote = note || '';
        if (decision === 'approved') count.appliedAt = Date.now();
      }

      // Surcouche locale : démo uniquement, jamais après un succès serveur.
      if (plan.overlay && count && Array.isArray(count.lines)) {
        count.lines.forEach(l => {
          if (l.diff) {
            moveStock({ id: l.itemId, costPerUnit: l.unitCost }, l.diff, 'count', 'count', countId,
              l.explanation || 'Inventaire physique validé', null,
              { locationId: l.locationId || stockLocationId(), unitId: count.storeId || '' });
          }
        });
        stSaveOverlay();
      }

      if (decision === 'approved') {
        try {
          if (window.KiwiBoutiqueCatalog?.sync) window.KiwiBoutiqueCatalog.sync();
        } catch (_) {}
      }
      if (plan.sync) {
        // Succès réel : on tire l'état faisant foi, on ne reposte rien.
        try { await window.KiwiInventory?.sync?.(); } catch (_) {}
      }

      try { closeTopModal(); } catch (_) {}
      release();
      window.Kiwi?.toast?.(decision === 'approved' ? ct('toastApproved') : ct('toastRejected'), { type: decision === 'approved' ? 'success' : 'info' });
      if (S.stPageActive) render();
    } catch (_) {
      release();
      try { window.Kiwi?.toast?.(t('mCountErrGeneric'), { type: 'error' }); } catch (_) {}
    }
  }

  function exportCountsCsv() {
    const counts = filterCounts(getAllCounts());
    function csvSafe(v) {
      let s = String(v == null ? '' : v);
      if (/^[\t\r ]*[=+\-@]/.test(s)) s = "'" + s;
      return '"' + s.replace(/"/g, '""') + '"';
    }
    const header = ct('csvCounts');
    const lines = [header.join(';')];
    counts.forEach(c => {
      const d = new Date(c.submittedAt || Date.now()).toISOString().slice(0, 19).replace('T', ' ');
      lines.push([
        csvSafe(c.id),
        d,
        csvSafe(ctStore(c.storeName || 'Principal')),
        csvSafe(ctWho(c.employeeName) || '·'),
        csvSafe(ctRole(c.employeeRole) || '·'),
        csvSafe(c.status),
        c.totalLines || 0,
        (c.totalVarianceCostMAD || 0).toFixed(2),
        (c.absVarianceCostMAD || 0).toFixed(2),
        csvSafe(ctWho(c.reviewerName) || '·'),
        csvSafe(c.reviewDecision || '·'),
        csvSafe(ctReviewNote(c.reviewNote) || '·')
      ].join(';'));
    });
    const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${ct('csvCountsFile')}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
  }

  function stCountReason(ctx) {
    const diff = +ctx.diff || 0;
    if (!diff) return '';
    const expected = +ctx.expected || 0;
    const counted = +ctx.counted || 0;
    const theoUsage = +ctx.theoUsage || 0;
    const moves = Array.isArray(ctx.moves) ? ctx.moves : [];
    const now = +ctx.now || Date.now();
    if (counted === 0 && expected > 0) return 'reasonZero';
    if (diff > 0 && expected > 0 && counted >= expected * 20) return 'reasonUnit';
    if (diff < 0) {
      if (moves.some((m) => m && (m.reason === 'loss' || m.reason === 'waste'))) return 'reasonWaste';
      if (theoUsage > 0 && Math.abs(diff) <= theoUsage * 1.25) return 'reasonRecipes';
      if (['viandes', 'poissons', 'legumes', 'laitiers'].indexOf(String(ctx.cat)) !== -1) return 'reasonPerish';
      return 'reasonLoss';
    }
    if (moves.some((m) => m && +m.qty > 0 && /receipt|procurement|delivery|invoice/.test(String(m.refType || '')) && now - (+m.occurredTs || 0) < 48 * 3600 * 1000)) return 'reasonDeliv';
    return 'reasonExtra';
  }

  function stRecentMoves(itemId) {
    try {
      const L = window.KiwiInventory;
      if (!L || !L.isReal || !L.isReal()) return [];
      const since = Date.now() - 7 * 24 * 3600 * 1000;
      return (L.history(itemId) || []).filter((m) => (+m.occurredTs || 0) >= since && m.reason !== 'count');
    } catch (_) { return []; }
  }

  function stCountHistory() {
    try {
      const a = JSON.parse(localStorage.getItem(stCountHistKey()) || '[]');
      return Array.isArray(a) ? a : [];
    } catch (_) { return []; }
  }

  function stSaveCountHistory(ref, lines) {
    const gaps = lines.filter((l) => l.diff);
    const entry = {
      ref: String(ref), ts: Date.now(), counted: lines.length,
      varMad: Math.round(gaps.reduce((s, l) => s + (+l.costDiff || 0), 0)),
      gaps: gaps.slice(0, 200).map((l) => ({
        id: l.it.id, name: l.it.name, unit: l.it.unit,
        theo: l.theo, counted: l.counted, diff: l.diff,
        mad: Math.round(+l.costDiff || 0), reason: l.reasonKey || '',
      })),
    };
    try { localStorage.setItem(stCountHistKey(), JSON.stringify([entry, ...stCountHistory()].slice(0, 24))); } catch (_) {}
    return entry;
  }

  function stSheetHtml(showTheo) {
    const items = getInv();
    const cats = allCategories();
    const catName = (id) => { const c = cats.find((x) => x.id === id); return c ? c.label : id; };
    const groups = new Map();
    items.forEach((it) => {
      const id = String(it.category || it.cat || 'epicerie');
      if (!groups.has(id)) groups.set(id, []);
      groups.get(id).push(it);
    });
    let venueName = '';
    try { venueName = window.KiwiVenue?.getCurrentVenueData?.()?.name || ''; } catch (_) {}
    const last = stCountHistory()[0];
    const rtl = lang() === 'ar';
    const sections = Array.from(groups.entries()).map(([id, rows]) => `
      <section>
        <h2>${esc(catName(id))}</h2>
        <table>
          <thead><tr><th class="w-name">${esc(t('sheetColItem'))}</th><th>${esc(t('sheetColUnit'))}</th>${showTheo ? `<th>${esc(t('mCountColTheo'))}</th>` : ''}<th class="w-count">${esc(t('mCountColReal'))}</th><th class="w-note">${esc(t('sheetColNotes'))}</th></tr></thead>
          <tbody>${rows.map((it) => `<tr><td class="w-name">${esc(it.name)}</td><td>${esc(it.unit)}</td>${showTheo ? `<td class="mono">${esc(fmtUnit(currentStockFor(it), it.unit))}</td>` : ''}<td class="w-count"></td><td class="w-note"></td></tr>`).join('')}</tbody>
        </table>
      </section>`).join('');
    return `<!doctype html><html dir="${rtl ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><title>${esc(t('mSheetTitle'))}</title><style>
      @page { margin: 12mm; }
      html, body { background: #fff; color: #0A0F0D; color-scheme: light; }
      body { margin: 0; font: 12px/1.5 Arial, sans-serif; }
      header { border-bottom: 2px solid #0B6E4F; padding-bottom: 10px; }
      header h1 { margin: 0; font-size: 20px; }
      header p { margin: 3px 0 0; color: #555; }
      .meta { display: flex; gap: 26px; margin: 12px 0 4px; font-size: 12px; }
      .meta span { display: inline-block; border-bottom: 1px solid #999; min-width: 150px; padding: 0 4px 2px; }
      section { break-inside: avoid-page; }
      h2 { font-size: 13px; margin: 16px 0 6px; color: #0B6E4F; text-transform: uppercase; letter-spacing: 0.06em; }
      table { width: 100%; border-collapse: collapse; }
      th, td { border: 1px solid #bbb; padding: 6px 8px; text-align: ${rtl ? 'right' : 'left'}; font-size: 11.5px; }
      th { background: #F7F5F0; text-transform: uppercase; font-size: 11px; letter-spacing: 0.05em; color: #444; }
      td { height: 18px; }
      .w-count { width: 110px; } .w-note { width: 170px; } .mono { font-family: monospace; }
      footer { margin-top: 18px; font-size: 11px; color: #666; }
    </style></head><body>
      <header>
        <h1>${esc(t('mSheetTitle'))}${venueName ? ' · ' + esc(venueName) : ''}</h1>
        <p>${esc(stCountDate(Date.now()))}${last ? ' · ' + esc(t('mCountLast', stCountDate(last.ts), fmtMad(last.varMad))) : ''}</p>
      </header>
      <div class="meta">
        <div>${esc(t('sheetCounter'))} : <span>&nbsp;</span></div>
        <div>${esc(t('sheetSign'))} : <span>&nbsp;</span></div>
      </div>
      ${sections}
      <footer>${esc(t('sheetFoot'))}</footer>
    </body></html>`;
  }

  function printCountSheet(showTheo) {
    const frame = document.createElement('iframe');
    frame.setAttribute('title', t('mSheetTitle'));
    frame.style.cssText = 'position:fixed;width:1px;height:1px;right:0;bottom:0;opacity:0;';
    document.body.appendChild(frame);
    const doc = frame.contentDocument;
    doc.open(); doc.write(stSheetHtml(showTheo)); doc.close();
    setTimeout(() => {
      try { frame.contentWindow.focus(); frame.contentWindow.print(); } catch (_) {}
      setTimeout(() => frame.remove(), 1500);
    }, 120);
  }

  function openCountSheet() {
    const n = getInv().length;
    const m = window.Kiwi.modal({
      title: t('mSheetTitle'),
      desc: t('mSheetSub'),
      width: 520,
      body: `
        <label class="st-pc-blindrow">
          <input type="checkbox" data-sheet-theo />
          <span><b>${esc(t('mSheetTheo'))}</b> · ${esc(t('mSheetTheoTip'))}</span>
        </label>
        <p style="font-size:12px;color:var(--n-600);margin:10px 2px 0;">${esc(t('mSheetCount', n))}</p>
      `,
      foot: `<button class="st-btn" data-dismiss-modal>${esc(t('mRevBack'))}</button><button data-activation=write class="st-btn primary" data-stock-sheet-print>${esc(t('mSheetPrint'))}</button>`,
    });
    requestAnimationFrame(() => {
      const scope = m?.el || topBackdrop();
      wireDismiss(scope);
      scope?.querySelector('[data-stock-sheet-print]')?.addEventListener('click', () => {
        printCountSheet(!!scope.querySelector('[data-sheet-theo]')?.checked);
        closeTopModal();
      }, { once: true });
    });
  }

  function openCountReview(lines, countBack) {
    const countRef = 'count-' + Date.now().toString(36);
    const gaps = lines.filter((l) => l.diff);
    gaps.forEach((l) => {
      l.reasonKey = stCountReason({
        diff: l.diff, expected: l.theo, counted: l.counted,
        cat: String(l.it.category || l.it.cat || ''),
        theoUsage: theoreticalUsageFor(l.it),
        moves: stRecentMoves(l.it.id),
      });
    });
    const totalVar = gaps.reduce((s, l) => s + l.costDiff, 0);
    const m = window.Kiwi.modal({
      title: t('mRevTitle'),
      desc: t('mRevSub', lines.length),
      width: 860,
      body: gaps.length ? `
        <div class="st-pc-wrap">
          <table class="st-pc-tbl">
            <thead><tr>
              <th>${esc(t('colArticle'))}</th>
              <th class="r">${esc(t('mCountColTheo'))}</th>
              <th class="r">${esc(t('mCountColReal'))}</th>
              <th class="r">${esc(t('mCountColVar'))}</th>
              <th class="r">${esc(t('mCountColCost'))}</th>
              <th>${esc(t('mRevColReason'))}</th>
            </tr></thead>
            <tbody>
              ${gaps.map((l) => {
                const pct = l.theo > 0 ? Math.abs(l.diff / l.theo) * 100 : 100;
                const cls = pct < 2 ? 'ok' : pct < 10 ? 'warn' : 'bad';
                return `<tr>
                  <td><b>${esc(l.it.name)}</b> <span style="color:var(--n-500); font-size:11px;">· ${esc(l.it.unit)}</span></td>
                  <td class="r mono">${esc(fmtUnit(l.theo, l.it.unit))}</td>
                  <td class="r mono">${esc(fmtUnit(l.counted, l.it.unit))}</td>
                  <td class="r"><span class="st-pc-var ${cls}">${l.diff > 0 ? '+' : ''}${fmtNum(l.diff, Math.abs(l.diff) < 10 ? 1 : 0)} ${esc(l.it.unit)}</span></td>
                  <td class="r"><span class="st-pc-var ${cls}">${l.costDiff > 0 ? '+' : ''}${esc(fmtMad(l.costDiff))}</span></td>
                  <td class="st-rev-reason">${esc(t(l.reasonKey))}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
        <div class="st-pc-prog"><span class="st-pc-prog-l">${esc(t('mRevTotal', gaps.length, fmtMad(totalVar)))}</span></div>
      ` : `<div class="st-notice"><b>${esc(t('mRevNoneT'))}</b>${esc(t('mRevNone'))}</div>`,
      foot: `<button class="st-btn" data-dismiss-modal>${esc(t('mRevBack'))}</button><button class="st-btn primary" data-stock-rev-apply>${esc(t('mRevApply'))}</button>`,
    });
    requestAnimationFrame(() => {
      const scope = m?.el || topBackdrop();
      wireDismiss(scope);
      scope?.querySelector('[data-stock-rev-apply]')?.addEventListener('click', () => {
        lines.forEach((l) => countStock(l.it, l.counted, countRef));
        stSaveOverlay();
        stSaveCountHistory(countRef, lines);
        closeTopModal();
        try { countBack?.querySelector('.kiwi-modal-close')?.click(); } catch (_) {}
        window.Kiwi.toast(t('mCountToast', fmtMad(totalVar)), { type: 'success', duration: 4200 });
        if (S.stPageActive) render();
      }, { once: true });
    });
  }

  function openPhysicalCount() {
    const items = getInv();
    const last = stCountHistory()[0];
    const m = window.Kiwi.modal({
      title: t('mCountTitle'),
      desc: (last ? t('mCountLast', stCountDate(last.ts), fmtMad(last.varMad)) + ' · ' : '') + t('mCountSub'),
      width: 760,
      body: `
        <label class="st-pc-blindrow">
          <input type="checkbox" data-pc-blind checked />
          <span><b>${esc(t('mCountBlind'))}</b> · ${esc(t('mCountBlindTip'))}</span>
        </label>
        <div class="st-pc-wrap st-pc-blind">
          <table class="st-pc-tbl">
            <thead>
              <tr>
                <th>${esc(t('colArticle'))}</th>
                <th class="r">${esc(t('mCountColTheo'))}</th>
                <th class="r">${esc(t('mCountColReal'))}</th>
                <th class="r">${esc(t('mCountColVar'))}</th>
                <th class="r">${esc(t('mCountColCost'))}</th>
              </tr>
            </thead>
            <tbody>
              ${items.map(it => {
                const cur = currentStockFor(it);
                return `
                  <tr data-stock-pc-row="${esc(it.id)}">
                    <td><b>${esc(it.name)}</b> <span style="color:var(--n-500); font-size:11px;">${esc(it.unit)}</span></td>
                    <td class="r mono"><span data-pc-theo>${esc(fmtUnit(cur, it.unit))}</span></td>
                    <td class="r"><input class="st-pc-input" type="number" inputmode="decimal" step="0.1" min="0" aria-label="${esc(t('mCountColReal'))}: ${esc(it.name)}" data-pc-real="${esc(it.id)}" data-pc-theo-val="${cur}" data-pc-cost="${it.costPerUnit}" data-pc-unit="${esc(it.unit)}" /></td>
                    <td class="r"><span class="st-pc-var" data-pc-var></span></td>
                    <td class="r"><span class="st-pc-var" data-pc-cost-out></span></td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
        <div class="st-pc-prog">
          <div class="st-pc-prog-bar"><div class="st-pc-prog-fill" data-pc-prog></div></div>
          <span class="st-pc-prog-l" data-pc-prog-l>${esc(t('mCountProg', 0, items.length))}</span>
        </div>
      `,
      foot: `<button data-activation=write class="st-btn" data-dismiss-modal>${esc(t('mCountSave'))}</button><button data-activation=write class="st-btn primary" data-stock-pc-validate disabled>${esc(t('mCountValidate'))}</button>`,
    });
    requestAnimationFrame(() => { wireDismiss(m?.el || topBackdrop()); wirePhysicalCount(items); });
  }

  function wirePhysicalCount(items) {
    const recomputeProgress = () => {
      const inputs = document.querySelectorAll('[data-pc-real]');
      let counted = 0;
      inputs.forEach(inp => {
        const val = parseFloat(inp.value);
        if (!isNaN(val) && inp.value !== '') {
          counted++;
          const theo = parseFloat(inp.dataset.pcTheoVal);
          const cost = parseFloat(inp.dataset.pcCost);
          const unit = inp.dataset.pcUnit;
          const diff = val - theo;
          const costDiff = diff * cost;
          const varCell = inp.closest('tr').querySelector('[data-pc-var]');
          const costCell = inp.closest('tr').querySelector('[data-pc-cost-out]');
          inp.closest('tr').classList.add('has-count');
          const absDiff = Math.abs(diff);
          const pctDiff = theo > 0 ? Math.abs(diff / theo) * 100 : 0;
          const cls = pctDiff < 2 ? 'ok' : pctDiff < 10 ? 'warn' : 'bad';
          varCell.className = `st-pc-var ${cls}`;
          varCell.textContent = `${diff > 0 ? '+' : ''}${fmtNum(diff, Math.abs(diff) < 10 ? 1 : 0)} ${unit}`;
          costCell.className = `st-pc-var ${cls}`;
          costCell.textContent = `${costDiff > 0 ? '+' : ''}${fmtMad(costDiff)}`;
        } else {
          const tr = inp.closest('tr');
          tr.classList.remove('has-count');
          tr.querySelector('[data-pc-var]').textContent = '';
          tr.querySelector('[data-pc-var]').className = 'st-pc-var';
          tr.querySelector('[data-pc-cost-out]').textContent = '';
          tr.querySelector('[data-pc-cost-out]').className = 'st-pc-var';
        }
      });
      const fill = document.querySelector('[data-pc-prog]');
      const lbl = document.querySelector('[data-pc-prog-l]');
      const validateBtn = document.querySelector('[data-stock-pc-validate]');
      if (fill) fill.style.width = `${(counted / items.length) * 100}%`;
      if (lbl) lbl.textContent = t('mCountProg', counted, items.length);
      if (validateBtn) {
        if (counted === items.length) validateBtn.removeAttribute('disabled');
        else validateBtn.setAttribute('disabled', '');
      }
    };
    document.querySelectorAll('[data-pc-real]').forEach(inp => inp.addEventListener('input', recomputeProgress));
    /* À l'aveugle par défaut : les colonnes théorique / écart / valeur restent
     * masquées pendant la saisie (CSS), le propriétaire peut les révéler. */
    const blindBox = document.querySelector('[data-pc-blind]');
    blindBox?.addEventListener('change', () => {
      document.querySelector('.st-pc-wrap')?.classList.toggle('st-pc-blind', blindBox.checked);
    });
    /* Valider n'écrit plus directement : on passe par la revue des écarts
     * (cause probable + valeur MAD), qui seule applique via countStock. */
    document.querySelector('[data-stock-pc-validate]')?.addEventListener('click', () => {
      const lines = [];
      document.querySelectorAll('[data-pc-real]').forEach(inp => {
        const v = parseFloat(inp.value);
        const it = items.find((x) => x.id === inp.dataset.pcReal);
        if (isNaN(v) || inp.value === '' || !it) return;
        const theo = parseFloat(inp.dataset.pcTheoVal) || 0;
        const diff = Math.round((v - theo) * 1000) / 1000;
        lines.push({ it, theo, counted: v, diff, costDiff: diff * (+it.costPerUnit || 0) });
      });
      /* La revue s'empile SUR la grille de comptage : Annuler doit rendre les
       * 40 saisies intactes (corriger une erreur d'unité), pas une page vide. */
      openCountReview(lines, topBackdrop());
    });
  }

  return { fetchServerCounts, getAllCounts, filterCounts, renderCountsHistory, renderCountsRollup, openCountDetailModal, stReviewBusyTake, stReviewBusyRelease, stReviewCountSend, stReviewCountErr, stReviewCountPlan, reviewCount, exportCountsCsv, stCountReason, stRecentMoves, stCountHistory, stSaveCountHistory, stSheetHtml, printCountSheet, openCountSheet, openCountReview, openPhysicalCount, wirePhysicalCount };
});
