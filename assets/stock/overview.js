/* Stock overview. Reads only the listed bridge dependencies and declared browser services. */
window.KiwiStockInternal.install('overview', (S) => {
  'use strict';
  const { esc, fmtDateShort, fmtMad, fmtPct, foodCostMonth, getInv, getSup, isFusion, isRetailStock, monthlyRevenue, overviewAlertRows, renderAlertCard, retailProcurementDoc, stShowReal, statusOf, stockBusinessDateDate, stockCalendarDates, svg, t, totalValue, weeklyRevenue } = S;

  function renderOverview() {
    const items = getInv();
    const { out, low, tierLow, alerts, totalAlertCount } = overviewAlertRows(items);
    if (isRetailStock()) {
      const d = retailProcurementDoc();
      const since = Date.now() - 30 * 86400000;
      const spend = (d.receipts || []).filter((r) => (+r.receivedAt || +r.createdAt || 0) >= since)
        .reduce((sum, r) => sum + (r.lines || []).reduce((s, line) => s + (+line.qty || 0) * (+line.unitCost || 0), 0), 0);
      const activeOrders = (d.orders || []).filter((o) => !['received', 'cancelled'].includes(o.status)).length;
      return `
        <div class="st-kpis">
          <div class="st-kpi"><div class="st-kpi-l">${esc(t('kpiValueL'))}<span class="st-kpi-ico">${svg('wallet', 14)}</span></div><div class="st-kpi-v">${esc(fmtMad(totalValue(items)))}</div><div class="st-kpi-sub">${esc(t('kpiValueSub', items.length))}</div></div>
          <div class="st-kpi"><div class="st-kpi-l">${esc(t('kpiAlertL'))}<span class="st-kpi-ico ${totalAlertCount ? 'warn' : 'ok'}">${svg('alertTriangle', 14)}</span></div><div class="st-kpi-v ${totalAlertCount ? 'warn' : 'ok'}">${totalAlertCount}</div><div class="st-kpi-sub">${esc(totalAlertCount ? t('kpiAlertSub', out.length, low.length + tierLow.length) : t('kpiAlertOk'))}</div></div>
          <div class="st-kpi"><div class="st-kpi-l">ACHATS · 30 JOURS<span class="st-kpi-ico">${svg('receipt', 14)}</span></div><div class="st-kpi-v">${esc(fmtMad(spend))}</div><div class="st-kpi-sub">${(d.receipts || []).length} réception(s) enregistrée(s)</div></div>
          <div class="st-kpi"><div class="st-kpi-l">COMMANDES EN COURS<span class="st-kpi-ico">${svg('truck', 14)}</span></div><div class="st-kpi-v">${activeOrders}</div><div class="st-kpi-sub">${getSup().length} fournisseur(s) actif(s)</div></div>
        </div>
        <div class="st-section"><div class="st-section-head"><h3>${esc(t('alertsT'))}</h3>${totalAlertCount ? `<span class="st-count-badge warn">${totalAlertCount}</span>` : ''}</div><div class="st-alerts">${alerts.length ? alerts.map(renderAlertCard).join('') : `<div style="padding:28px 16px;text-align:center;color:var(--n-500);font-size:13px;background:var(--paper-soft);border-radius:12px;border:1px solid var(--n-200);">${esc(t('alertsEmpty'))}</div>`}</div></div>`;
    }
    const ok  = items.filter(it => statusOf(it) === 'ok');
    const totalVal = totalValue(items);
    const costMonth = foodCostMonth(items);
    /* Chez un vrai commerçant, un coût nul n'est pas un coût bas : c'est
       qu'aucun article ne porte encore de consommation chiffrée. « 0 MAD ·
       ratio 0,0 % » s'affichait face à de vraies ventes. */
    const costKnown = !stShowReal() || costMonth > 0;
    /* Chez un vrai commerçant, coût et ventes sur la MÊME semaine. L'ancien
       calcul extrapolait la semaine à un mois (× 4,33), la redivisait par 4
       pour l'afficher, puis la comparait aux ventes RÉELLES de 30 jours : un
       commerce ouvert depuis huit jours lisait 15,7 % pour 3,6 % réels. */
    const costWeek = !costKnown ? null : stShowReal() ? costMonth / 4.33 : costMonth / 4;
    const wRev = stShowReal() ? weeklyRevenue() : null;
    const mRev = stShowReal() ? null : monthlyRevenue();
    const ratio = !costKnown ? null
      : stShowReal() ? (wRev > 0 ? (costWeek / wRev) * 100 : null)
      : (mRev > 0 ? (costMonth / mRev) * 100 : null);
    const ratioClass = ratio == null ? '' : ratio < 30 ? 'ok' : ratio < 35 ? '' : 'warn';

    // Next delivery — pick the supplier with the soonest scheduled day
    const nextDelivery = computeNextDelivery();

    // Demo only: no stock-value history is recorded, so a real store draws no trend.
    const trendBars = stShowReal() ? '' : [62, 70, 66, 74].map(h => `<i style="height:${h}%;"></i>`).join('');

    // Alerts sorted: out first, then low (by daysOfStock asc), then tierLow
    return `
      ${renderKpiCards({ totalVal, items, out, low, tierLow, costWeek, ratio, ratioClass, nextDelivery, trendBars })}

      ${(function() {
        const expiringLots = (window.KiwiInventoryConsumption?.expiring && window.KiwiInventoryConsumption.expiring({ horizonDays: 7 })) || [];
        if (!expiringLots.length) return '';
        return `
          <div class="st-section" style="margin-bottom:20px;">
            <div class="st-section-head">
              <div style="display:flex;align-items:center;gap:8px;">
                <div style="width:24px;height:24px;border-radius:6px;background:rgba(239,68,68,0.12);color:#dc2626;display:grid;place-items:center;">
                  ${svg('alertTriangle', 14)}
                </div>
                <h3 style="color:#b91c1c;">Alertes péremptions (DLC / DDM)</h3>
              </div>
              <span class="st-count-badge warn">${expiringLots.length}</span>
            </div>
            <div class="st-alerts" style="display:grid;gap:8px;">
              ${expiringLots.map(l => {
                const isExp = l.status === 'expired';
                const badgeStyle = isExp ? 'background:#fef2f2;color:#b91c1c;border:1px solid rgba(185,28,28,0.25);' : 'background:#fffbeb;color:#b45309;border:1px solid rgba(180,83,9,0.25);';
                const dateStr = new Date(l.expiresAt).toLocaleDateString('fr-FR');
                const statusLabel = isExp ? `Périmé (${dateStr})` : (l.daysLeft === 0 ? `Périme aujourd'hui` : `Expire dans ${l.daysLeft} j (${dateStr})`);
                return `
                  <div class="st-alert-card" style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:var(--paper-soft);border:1px solid var(--n-200);border-radius:10px;">
                    <div style="display:flex;align-items:center;gap:10px;">
                      <span style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:999px;${badgeStyle}">${statusLabel}</span>
                      <div>
                        <b style="font-size:13.5px;color:var(--ink);">${esc(l.name)}</b>
                        <div style="font-size:11.5px;color:var(--n-500);">${l.remainingQty} ${esc(l.unit)} restant${l.supplierName ? ` · Fournisseur : ${esc(l.supplierName)}` : ''}${l.totalCostMAD ? ` · Valeur : ${fmtMad(l.totalCostMAD)}` : ''}</div>
                      </div>
                    </div>
                    <button class="st-btn small" type="button" data-action="stock-declare-waste-prefill" data-item-id="${esc(l.itemId)}" data-qty="${l.remainingQty}" data-reason="perime" style="color:#b91c1c;border-color:rgba(185,28,28,0.3);white-space:nowrap;">
                      ${svg('trash2', 12)}<span style="margin-left:4px;">Déclarer en perte</span>
                    </button>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        `;
      })()}

      <div class="st-section">
        <div class="st-section-head">
          <h3>${esc(t('alertsT'))}</h3>
          ${totalAlertCount > 0 ? `<span class="st-count-badge warn">${totalAlertCount}</span>` : ''}
        </div>
        <div class="st-alerts">
          ${alerts.length === 0 ? `<div style="padding:28px 16px; text-align:center; color:var(--n-500); font-size:13px; background:var(--paper-soft); border-radius:12px; border:1px solid var(--n-200); display:flex; align-items:center; justify-content:center; gap:10px;">
            <div style="width:28px; height:28px; border-radius:8px; background:rgba(11,110,79,0.10); color:var(--atlas); display:grid; place-items:center;">
              <svg width="16" height="16" viewBox="0 -960 960 960" fill="currentColor"><path d="M382-240 154-468l57-57 171 171 367-367 57 57-424 424Z"/></svg>
            </div>
            <span style="font-weight:500; color:var(--ink);">${esc(t(items.length ? 'alertsEmpty' : 'alertsNone'))}</span>
          </div>` :
            alerts.map(renderAlertCard).join('')}
        </div>
      </div>

      ${stShowReal() ? '' : `<div class="st-section">
        <div class="st-section-head">
          <h3>${t(isFusion() ? 'aiSectionPortfolio' : 'aiSectionKitchen')}</h3>
        </div>
        ${renderAiCard(t('aiVarianceT'), t('aiVarianceB'), t('aiVarianceA'))}
        ${renderAiCard(t('aiPriceT'), t('aiPriceB'), t('aiPriceA'))}
      </div>`}

      <div class="st-section">
        <div class="st-section-head">
          <h3>${esc(t('calT'))}</h3>
        </div>
        ${renderDeliveryStrip()}
      </div>
    `;
  }

  function renderKpiCards({ totalVal, items, out, low, tierLow = [], costWeek, ratio, ratioClass, nextDelivery, trendBars }) {
    const alertCount = out.length + low.length + tierLow.length;
    const alertColor = alertCount > 0 ? 'warn' : 'ok';
    return `
      <div class="st-kpis">
        <div class="st-kpi">
          <div class="st-kpi-l">${esc(t('kpiValueL'))}<span class="st-kpi-ico">${svg('wallet', 14)}</span></div>
          <div class="st-kpi-v">${esc(fmtMad(totalVal))}</div>
          <div class="st-kpi-sub">${esc(t('kpiValueSub', items.length))}</div>
          ${trendBars ? `<div class="st-kpi-trend" aria-hidden="true">${trendBars}</div>` : ''}
        </div>
        <div class="st-kpi">
          <div class="st-kpi-l">${esc(t('kpiAlertL'))}<span class="st-kpi-ico ${alertColor}">${svg('alertTriangle', 14)}</span></div>
          <div class="st-kpi-v ${alertColor}">${alertCount}</div>
          <div class="st-kpi-sub">${esc(alertCount === 0 ? t(items.length ? 'kpiAlertOk' : 'kpiAlertNone') : t('kpiAlertSub', out.length, low.length + tierLow.length))}</div>
        </div>
        <div class="st-kpi">
          <div class="st-kpi-l">${esc(t('kpiCostL'))}<span class="st-kpi-ico">${svg('receipt', 14)}</span></div>
          <div class="st-kpi-v" data-stock-live-foodcost>${costWeek == null ? '·' : esc(fmtMad(costWeek))}</div>
          <div class="st-kpi-sub st-kpi-tip">
            <span class="${ratioClass === 'ok' ? '' : ratioClass === 'warn' ? '' : ''}" style="color: var(--${ratioClass === 'ok' ? 'success' : ratioClass === 'warn' ? 'warning' : 'n-600'}); font-weight: 600;">${ratio == null ? (costWeek == null ? esc(t('kpiCostNone')) : '') : esc(t('kpiCostSub', fmtPct(ratio, 1).replace('+', '')))}</span>
            ${svg('info', 11)}
            <div class="st-tt">${esc(t('kpiCostTip'))}</div>
          </div>
        </div>
        <div class="st-kpi">
          <div class="st-kpi-l">${esc(t('kpiDelivL'))}<span class="st-kpi-ico">${svg('truck', 14)}</span></div>
          <div class="st-kpi-v" style="font-size:22px;">${esc(nextDelivery.when)}</div>
          <div class="st-kpi-sub">${esc(nextDelivery.supplier)}${nextDelivery.cost == null ? '' : ' · ' + esc(fmtMad(nextDelivery.cost))}</div>
        </div>
      </div>
    `;
  }

  function renderAiCard(title, body, action) {
    return `
      <div class="st-ai">
        <div class="st-ai-eyebrow">KIWI AI</div>
        <div class="st-ai-t">${esc(title)}</div>
        <div class="st-ai-b">${esc(body)}</div>
        <div class="st-ai-a">${esc(action)}</div>
      </div>
    `;
  }

  function renderDeliveryStrip() {
    const items = [];
    const dayNames = [t('daySun'), t('dayMon'), t('dayTue'), t('dayWed'), t('dayThu'), t('dayFri'), t('daySat')];
    const dates = stockCalendarDates();
    for (let i = 0; i < dates.length; i++) {
      const d = dates[i];
      const dow = d.getDay();
      const monthLabel = fmtDateShort(d.toISOString().slice(0, 10));
      const isToday = i === 0;
      const sups = computeDeliveriesForDay(dow);
      items.push(`
        <div class="st-cal-day ${isToday ? 'today' : ''}" data-action="stock-day-detail" data-day="${dow}" data-day-name="${esc(dayNames[dow])}">
          <div class="st-cal-day-d">${esc(isToday ? t('today') : dayNames[dow])}</div>
          <div class="st-cal-day-date">${esc(monthLabel)}</div>
          ${sups.length === 0
            ? `<div class="st-cal-day-empty">${esc(t('calEmpty'))}</div>`
            : sups.map(s => `<div class="st-cal-day-item"><b>${esc(s.name)}</b><span class="h">${esc(s.time)} · ${esc(fmtMad(s.cost))}</span></div>`).join('')}
        </div>
      `);
    }
    return `<div class="st-cal-strip">${items.join('')}</div>`;
  }

  function computeDeliveriesForDay(dow) {
    // Real / custom store → no demo supplier deliveries (this is the single
    // source for both the delivery strip and the "next delivery" KPI).
    if (stShowReal()) return [];
    const wkdayMap = {
      0: [], // Sun — most closed
      1: [{ name: 'Centrale Danone', time: '07h', cost: 1240 }, { name: 'Avicole Atlas', time: '08h', cost: 480 }, { name: 'Marché Inezgane', time: '06h', cost: 1840 }], // Mon
      2: [{ name: 'Boucherie Errazi', time: '09h', cost: 3840 }, { name: 'Marché Central · Port', time: '06h', cost: 820 }, { name: 'Fruits Premium', time: '11h', cost: 1240 }], // Tue
      3: [{ name: 'Marché Inezgane', time: '06h', cost: 1840 }, { name: 'Bakery El Ouafy', time: '07h', cost: 320 }], // Wed
      4: [{ name: 'Métro Casablanca', time: '14h', cost: 4620 }, { name: 'Centrale Danone', time: '07h', cost: 1240 }, { name: 'Avicole Atlas', time: '08h', cost: 480 }, { name: 'Minoterie Lazaar', time: '10h', cost: 480 }], // Thu
      5: [{ name: 'Boucherie Errazi', time: '09h', cost: 3840 }, { name: 'Fruits Premium', time: '11h', cost: 1240 }, { name: 'Marché Inezgane', time: '06h', cost: 1840 }, { name: 'NABC', time: '13h', cost: 2160 }, { name: 'Bakery El Ouafy', time: '07h', cost: 320 }], // Fri
      6: [{ name: 'Marché Central · Port', time: '06h', cost: 820 }, { name: 'Sidi Ali · Distributeur', time: '11h', cost: 1080 }], // Sat
    };
    return wkdayMap[dow] || [];
  }

  function computeNextDelivery() {
    const today = stockBusinessDateDate();
    for (let i = 1; i <= 7; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const sups = computeDeliveriesForDay(d.getDay());
      if (sups.length > 0) {
        const dayNames = [t('daySun'), t('dayMon'), t('dayTue'), t('dayWed'), t('dayThu'), t('dayFri'), t('daySat')];
        return {
          when: i === 1 ? `${t('ramTomorrow')} · ${sups[0].time}` : `${dayNames[d.getDay()]} · ${sups[0].time}`,
          supplier: sups[0].name,
          cost: sups[0].cost,
        };
      }
    }
    return { when: t('noDeliveryPlanned'), supplier: t('noDeliveryHint'), cost: null };
  }

  function openDayDetail(dow, dayName) {
    const sups = computeDeliveriesForDay(+dow);
    window.Kiwi.modal({
      title: t('mDayTitle', dayName),
      width: 560,
      body: sups.length === 0
        ? `<div style="padding:24px; text-align:center; color:var(--n-500);">${esc(t('calEmpty'))}</div>`
        : `
          <div class="st-md-list">
            ${sups.map(s => `
              <div class="st-md-list-row">
                <div><span class="n">${esc(s.name)}</span> <span class="d" style="margin-left:6px;">${esc(s.time)}</span></div>
                <div class="v">${esc(fmtMad(s.cost))}</div>
                <div class="status-ok" style="font-size:11px;">Confirmée</div>
              </div>
            `).join('')}
          </div>
        `,
      foot: `<button class="st-btn" data-dismiss-modal>${esc(t('mItClose'))}</button>`,
    });
  }

  return { renderOverview, renderKpiCards, renderAiCard, renderDeliveryStrip, computeDeliveriesForDay, computeNextDelivery, openDayDetail };
});
