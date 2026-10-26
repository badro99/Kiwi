/* Exports: getSaleInvoices, rowsFor, stats, paintStats, legacyDocs, paintNotices, tabsHtml, newLabel, visibleRows, paintRegister, paintAll, renderList, csvCell, exportCsv.
 * Reads: explicit dependencies passed per call; window APIs declared in split.json.
 * The entry owns screen state. No sibling module or private global is read. */
export function getSaleInvoices({dayIn, today}, self, args) {
function getSaleInvoices() {
    try {
      const cached = window.KiwiInvoice?.getCachedInvoices?.() || {};
      return Object.values(cached).map((doc) => {
        const id = String(doc.number || (doc.seq ? ('F-' + doc.seq) : 'Facture'));
        const customer = (doc.customer && doc.customer.name) || 'Client de passage';
        const contact = (doc.customer && doc.customer.ice) ? ('ICE ' + doc.customer.ice) : 'Vente comptoir';
        const issueDate = doc.issuedTs ? dayIn(doc.issuedTs) : today();
        const total = (doc.totals && Number(doc.totals.ttc)) || 0;
        return {id, customer, contact, issueDate, dueDate: issueDate, total, isSaleInvoice: true, rawDoc: doc};
      });
    } catch (_) { return []; }
  }
return getSaleInvoices.apply(self, args);
}
export function rowsFor({cache}, self, args) {
function rowsFor(ty) { return cache[ty] || []; }
return rowsFor.apply(self, args);
}
export function stats({rowsFor, today}, self, args) {
function stats() {
    let outstanding = 0, late = 0, paidMonth = 0, waiting = 0, lateCount = 0;
    const month = today().slice(0, 7);
    rowsFor('invoice').forEach(r => {
      const ds = r.displayStatus;
      if (ds === 'issued' || ds === 'partial' || ds === 'overdue') { outstanding += r.balanceCents; waiting += 1; }
      if (ds === 'overdue') { late += r.balanceCents; lateCount += 1; }
      if ((ds === 'paid' || ds === 'partial' || ds === 'overdue' || ds === 'issued') && String(r.issueDate).slice(0, 7) === month) paidMonth += Math.max(0, r.ttcCents - r.balanceCents);
    });
    return {outstanding, late, paidMonth, waiting, lateCount};
  }
return stats.apply(self, args);
}
export function paintStats({T, TYPES, esc, getSaleInvoices, money, overlay, rowsFor, stats}, self, args) {
function paintStats() {
    const box = overlay?.querySelector('[data-inv-stats]'); if (!box) return;
    const t = T(), s = stats();
    const total = TYPES.reduce((n, ty) => n + rowsFor(ty).length, 0) + getSaleInvoices().length;
    box.innerHTML = `<article class="inv-stat"><div class="inv-stat-label">${esc(t.outstanding)}</div><div class="inv-stat-value" data-stat="outstanding">${money(s.outstanding)} <small>MAD</small></div><div class="inv-stat-note">${s.waiting} ${esc(t.awaiting)}</div></article>
      <article class="inv-stat alert"><div class="inv-stat-label">${esc(t.overdue)}</div><div class="inv-stat-value" data-stat="overdue">${money(s.late)} <small>MAD</small></div><div class="inv-stat-note">${s.lateCount} ${esc(t.needsFollowup)}</div></article>
      <article class="inv-stat"><div class="inv-stat-label">${esc(t.paidMonth)}</div><div class="inv-stat-value" data-stat="paid">${money(s.paidMonth)} <small>MAD</small></div><div class="inv-stat-note">${esc(t.collected)}</div></article>
      <article class="inv-stat"><div class="inv-stat-label">${esc(t.documents)}</div><div class="inv-stat-value" data-stat="docs">${total}</div><div class="inv-stat-note">${esc(t.totalDocs)}</div></article>`;
  }
return paintStats.apply(self, args);
}
export function legacyDocs({lsGet, ownData, venueId}, self, args) {
function legacyDocs() {
    if (!ownData()) return [];
    try {
      const a = JSON.parse(lsGet('kiwi:invoices:v1:' + venueId()) || '[]');
      return Array.isArray(a) ? a.filter(x => x && x.id != null && Array.isArray(x.items)) : [];
    } catch (_) { return []; }
  }
return legacyDocs.apply(self, args);
}
export function paintNotices({T, authBlocked, esc, legacyDocs, offline, overlay, tpl}, self, args) {
function paintNotices() {
    const box = overlay?.querySelector('[data-inv-notices]'); if (!box) return;
    const t = T(), parts = [];
    const legacy = legacyDocs();
    if (legacy.length) {
      parts.push(`<div class="inv-banner" data-inv-legacy><div class="inv-banner-copy"><strong>${esc(legacy.length === 1 ? t.legacyOne : tpl(t.legacyBanner, {n: legacy.length}))}</strong><span>${esc(t.legacyHint)}</span></div><button data-activation=write class="inv-btn small primary" type="button" data-inv-act="import-legacy">${esc(t.legacyImport)}</button></div>`);
    }
    if (authBlocked) parts.push(`<div class="inv-banner warn" role="status" data-inv-auth>${esc(t.authError)}</div>`);
    else if (offline) parts.push(`<div class="inv-banner warn" role="status" data-inv-offline>${esc(t.offline)}</div>`);
    box.innerHTML = parts.join('');
  }
return paintNotices.apply(self, args);
}
export function tabsHtml({T, esc, tab}, self, args) {
function tabsHtml() {
    const t = T();
    return [['invoice', t.tabInvoices], ['quote', t.tabQuotes], ['credit_note', t.tabCredits], ['sales', t.sales]]
      .map(([k, l]) => `<button class="inv-tab${tab === k ? ' on' : ''}" type="button" role="tab" aria-selected="${tab === k}" data-lens-item data-inv-act="tab" data-v="${k}">${esc(l)}</button>`).join('');
  }
return tabsHtml.apply(self, args);
}
export function newLabel({T, tab}, self, args) {
function newLabel() { return tab === 'quote' ? T().newQuote : T().newInvoice; }
return newLabel.apply(self, args);
}
export function visibleRows({filter, getSaleInvoices, query, rowsFor, tab}, self, args) {
function visibleRows() {
    const q = query.trim().toLowerCase();
    if (tab === 'sales') {
      return getSaleInvoices().reverse().filter(r => !q || String(r.id).toLowerCase().includes(q) || String(r.customer).toLowerCase().includes(q));
    }
    return rowsFor(tab).filter(r => {
      if (tab === 'invoice') {
        const ds = r.displayStatus;
        const ok = filter === 'all' || (filter === 'draft' && ds === 'draft') || (filter === 'paid' && ds === 'paid')
          || (filter === 'overdue' && ds === 'overdue') || (filter === 'collect' && (ds === 'issued' || ds === 'partial' || ds === 'overdue'));
        if (!ok) return false;
      }
      return !q || String(r.number).toLowerCase().includes(q) || String(r.customer.name).toLowerCase().includes(q) || String(r.customer.ice).includes(q);
    });
  }
return visibleRows.apply(self, args);
}
export function paintRegister({ICON, NO_OF, T, esc, filter, fmtDate, loadingList, loadingMore, money, newLabel, nextCursor, overlay, rowsFor, statusHtml, tab, tpl, visibleRows}, self, args) {
function paintRegister() {
    const root = overlay?.querySelector('[data-inv-list]'); if (!root || !root.querySelector('[data-inv-table]')) return;
    const t = T();
    root.querySelector('[data-inv-filters]').innerHTML = tab === 'invoice'
      ? [['all', t.fAll], ['collect', t.fCollect], ['overdue', t.fOverdue], ['paid', t.fPaid], ['draft', t.fDraft]].map(([k, l]) => `<button class="inv-filter${filter === k ? ' on' : ''}" type="button" data-inv-act="filter" data-v="${k}">${esc(l)}</button>`).join('')
      : '';
    const newBtn = root.querySelector('[data-inv-act="new"]');
    if (newBtn) { newBtn.hidden = tab === 'credit_note'; newBtn.querySelector('[data-new-label]').textContent = newLabel(); }
    const rows = visibleRows();
    let html;
    if (loadingList && !rows.length && tab !== 'sales') {
      html = `<div class="inv-empty"><p>${esc(t.loading)}</p></div>`;
    } else if (rows.length) {
      const dueHead = tab === 'quote' ? t.colValid : t.colDue;
      html = `<div class="inv-table-wrap" tabindex="0" role="region" aria-label="${esc(t.title)}"><table class="inv-table"><thead><tr><th>${esc(t.colNo)}</th><th>${esc(t.colCustomer)}</th><th>${esc(t.colIssued)}</th><th>${esc(tab === 'credit_note' ? '' : dueHead)}</th><th>${esc(t.colStatus)}</th><th>${esc(t.colAmount)}</th></tr></thead><tbody>${rows.map(r => {
        if (r.isSaleInvoice) {
          return `<tr data-inv-act="sale-open" data-inv-sale-open="${esc(r.id)}" data-id="${esc(r.id)}" tabindex="0"><td><span class="inv-no">${esc(r.id)}</span></td><td><span class="inv-customer">${esc(r.customer)}</span><span class="inv-customer-sub">${esc(r.contact || '·')}</span></td><td class="inv-date" data-label="${esc(t.colIssued)}">${esc(fmtDate(r.issueDate))}</td><td class="inv-date" data-label="${esc(t.colDue)}">${esc(fmtDate(r.dueDate))}</td><td>${statusHtml('invoice', 'paid')}</td><td class="inv-money">${money(Math.round((Number(r.total) || 0) * 100))} MAD</td></tr>`;
        }
        const due = r.type === 'quote' ? (r.validUntil || r.dueDate) : r.dueDate;
        const sub = r.type === 'credit_note' && r.originalNumber ? tpl(t.creditOn, {n: r.originalNumber}) : (r.customer.ice ? 'ICE ' + r.customer.ice : '·');
        const left = r.type === 'invoice' && (r.displayStatus === 'partial' || r.displayStatus === 'overdue') && r.balanceCents > 0 && r.balanceCents < r.ttcCents ? `<span class="inv-customer-sub">${esc(tpl(t.balanceLeft, {amount: money(r.balanceCents) + ' MAD'}))}</span>` : '';
        return `<tr data-inv-act="open" data-id="${esc(r.id)}" data-type="${esc(r.type)}" tabindex="0"><td><span class="inv-no">${esc(NO_OF(r))}</span></td><td><span class="inv-customer">${esc(r.customer.name)}</span><span class="inv-customer-sub">${esc(sub)}</span></td><td class="inv-date" data-label="${esc(t.colIssued)}">${esc(fmtDate(r.issueDate))}</td><td class="inv-date" data-label="${esc(dueHead)}">${esc(r.type === 'credit_note' ? '·' : fmtDate(due))}</td><td>${statusHtml(r.type, r.displayStatus)}</td><td class="inv-money">${money(r.ttcCents)} MAD${left}</td></tr>`;
      }).join('')}</tbody></table></div>`;
    } else {
      const hasAny = tab === 'sales' ? false : rowsFor(tab).length > 0;
      const msg = tab === 'sales' ? [t.salesSub, ''] : hasAny ? [t.emptyFilter, ''] : ({invoice: [t.emptyInvoice, t.emptyInvoiceSub], quote: [t.emptyQuote, t.emptyQuoteSub], credit_note: [t.emptyCredit, t.emptyCreditSub]}[tab]);
      html = `<div class="inv-empty"><div class="inv-empty-mark">${ICON.invoice}</div><h4>${esc(msg[0])}</h4><p>${esc(msg[1])}</p>${tab === 'credit_note' || hasAny ? '' : `<button class="inv-btn primary" type="button" data-inv-act="new">${ICON.plus}${esc(newLabel())}</button>`}</div>`;
    }
    if (tab !== 'sales' && nextCursor[tab] && !(loadingList && !rows.length)) {
      html += `<div class="inv-more"><button class="inv-btn" type="button" data-inv-act="more"${loadingMore ? ' disabled aria-busy="true"' : ''}>${esc(loadingMore ? t.loading : t.loadMore)}</button></div>`;
    }
    root.querySelector('[data-inv-table]').innerHTML = html;
  }
return paintRegister.apply(self, args);
}
export function paintAll({currentView, overlay, paintNotices, paintRegister, paintStats}, self, args) {
function paintAll() { if (!overlay || currentView !== 'list') return; paintNotices(); paintStats(); paintRegister(); }
return paintAll.apply(self, args);
}
export function renderList({ICON, T, esc, newLabel, overlay, ownData, paintAll, query, show, tabsHtml}, self, args) {
function renderList() {
    const t = T();
    overlay.querySelector('[data-inv-list]').innerHTML = `<div class="inv-toolbar"><div class="inv-toolbar-copy"><h3>${esc(t.overview)}</h3><p>${esc(t.overviewSub)}</p></div><div class="inv-toolbar-actions"><button data-activation=money class="inv-btn" type="button" data-inv-act="export">${ICON.export}${esc(t.export)}</button><button class="inv-btn primary" type="button" data-inv-act="new">${ICON.plus}<span data-new-label>${esc(newLabel())}</span></button></div></div>
      <div data-inv-notices></div>
      <div class="inv-stats" data-inv-stats></div>
      <section class="inv-register"><div class="inv-tabs" role="tablist" data-lens-demo>${tabsHtml()}</div><div class="inv-register-head"><div class="inv-filters" data-inv-filters></div><input class="inv-search" type="search" value="${esc(query)}" data-inv-search placeholder="${esc(t.search)}" aria-label="${esc(t.search)}"></div><div data-inv-table></div></section>
      <p class="inv-foot-note">${esc(ownData() ? t.serverNote : t.demoNote)}</p>`;
    show('list'); paintAll();
  }
return renderList.apply(self, args);
}
export function csvCell({}, self, args) {
function csvCell(v, asText) {
    let s = String(v == null ? '' : v);
    if (asText && /^\d+$/.test(s)) return '="' + s + '"';
    /* Même cité, un tableur exécute une cellule qui commence par = + - @ : les
       noms de clients sont des données non fiables. */
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
  }
return csvCell.apply(self, args);
}
export function exportCsv({NO_OF, T, csvCell, csvMoney, statusLabel, tab, toast, today, visibleRows}, self, args) {
function exportCsv() {
    const t = T(), rows = visibleRows();
    let head, body;
    if (tab === 'sales') {
      head = [t.colNo, t.colCustomer, t.colIssued, t.colDue, t.colStatus, t.colAmount];
      body = rows.map(r => [r.id, r.customer, r.issueDate, r.dueDate, t.stPaid, csvMoney(Math.round((Number(r.total) || 0) * 100))]);
    } else if (tab === 'quote') {
      head = [t.colNo, t.colCustomer, 'ICE', t.colIssued, t.colValid, t.colStatus, t.colAmount];
      body = rows.map(r => [NO_OF(r), r.customer.name, r.customer.ice, r.issueDate, r.validUntil || r.dueDate, statusLabel(r.type, r.displayStatus), csvMoney(r.ttcCents)]);
    } else if (tab === 'credit_note') {
      head = [t.colNo, t.docInvoice, t.colCustomer, 'ICE', t.colIssued, t.colStatus, t.colAmount];
      body = rows.map(r => [NO_OF(r), r.originalNumber, r.customer.name, r.customer.ice, r.issueDate, statusLabel(r.type, r.displayStatus), csvMoney(r.ttcCents)]);
    } else {
      head = [t.colNo, t.colCustomer, 'ICE', t.colIssued, t.colDue, t.colStatus, t.colAmount, t.balance];
      body = rows.map(r => [NO_OF(r), r.customer.name, r.customer.ice, r.issueDate, r.dueDate, statusLabel(r.type, r.displayStatus), csvMoney(r.ttcCents), csvMoney(r.balanceCents)]);
    }
    const iceCol = head.indexOf('ICE');
    const csv = '﻿' + [head].concat(body).map((row, ri) => row.map((v, ci) => csvCell(v, ri > 0 && ci === iceCol && iceCol >= 0)).join(';')).join('\r\n');
    const blob = new Blob([csv], {type: 'text/csv;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'kiwi-' + ({invoice: 'factures', quote: 'devis', credit_note: 'avoirs', sales: 'factures-vente'}[tab]) + '-' + today() + '.csv';
    a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); toast(t.exported);
    return csv;
  }
return exportCsv.apply(self, args);
}
